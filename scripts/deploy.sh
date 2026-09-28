#!/usr/bin/env bash
#
# Deploy, from the server's own checkout.
#
#   ./scripts/deploy.sh                 roll out the newest published commit
#   ./scripts/deploy.sh --tag <sha>     roll out one specific commit
#   ./scripts/deploy.sh --rollback      go back to the commit this replaced
#   ./scripts/deploy.sh --build         build here instead of pulling
#
# The images come from the registry, built by CI from a green `check` job. This
# box has under a gigabyte of RAM and one core, so `next build` was by far the
# heaviest thing that ever happened on it — and the build cache it left behind
# was most of a full disk. Now the server only pulls.
#
# Git is still involved, but only for compose.yaml, the migrations and these
# scripts. Code arrives as an image tagged with the commit that produced it,
# which is what makes `--tag` and `--rollback` exact.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
STATE="$ROOT/.deploy-state"
REGISTRY_WAIT=40   # 40 × 15s ≈ 10 minutes, comfortably longer than CI takes

step() { printf '\n\033[1m>> %s\033[0m\n' "$1"; }
note() { printf '   %s\n' "$1"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

[[ -f compose.yaml ]] || die "no compose.yaml in $ROOT — wrong directory?"
[[ -f .env ]] || die "no .env in $ROOT. Copy .env.example and set POSTGRES_PASSWORD and APP_URL."
[[ -d .git ]] || die "$ROOT is not a git checkout. See 'Deploying' in README.md."

PULL_GIT=1
BUILD=0
ROLLBACK=0
TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) PULL_GIT=0 ;;
    --build) BUILD=1 ;;
    --rollback) ROLLBACK=1; PULL_GIT=0 ;;
    --tag) TAG="${2:-}"; shift; [[ -n "$TAG" ]] || die "--tag needs a commit sha" ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

# What is running now, so a failed rollout has somewhere to go back to.
PREVIOUS="$(grep -E '^YAPPED_TAG=' .env 2>/dev/null | cut -d= -f2 || true)"
PREVIOUS="${PREVIOUS:-$(git rev-parse HEAD)}"

if [[ "$ROLLBACK" == 1 ]]; then
  [[ -f "$STATE" ]] || die "no previous deploy recorded in $STATE."
  TAG="$(cat "$STATE")"
  step "Rolling back to ${TAG:0:7}"
  note "a schema migration is NOT undone by this — roll the code back, then decide about the data."
elif [[ "$PULL_GIT" == 1 ]]; then
  # A --rollback leaves the checkout detached, so "the current branch" is not a
  # question git can always answer. Fall back to the remote's default.
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" == "HEAD" ]]; then
    BRANCH="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
    BRANCH="${BRANCH:-main}"
    note "detached (after a rollback?) — returning to $BRANCH"
  fi

  step "Fetching origin/$BRANCH"
  git fetch --quiet origin "$BRANCH"

  # A deployed checkout is never edited by hand, so anything local is an
  # accident. Refuse rather than silently discard it.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git --no-pager status --short
    die "the checkout has local changes. Commit, stash or 'git checkout -- .' them first."
  fi

  if git diff --quiet HEAD "origin/$BRANCH" --; then
    note "already at origin/$BRANCH ($(git rev-parse --short HEAD))"
  else
    git --no-pager log --oneline "HEAD..origin/$BRANCH" 2>/dev/null | sed 's/^/   /'
  fi

  # A file sitting here untracked that the incoming commit also provides blocks
  # a fast-forward. On a deploy box that is always a leftover — a script copied
  # up by hand to try it before it was committed — and the incoming version is
  # the authoritative one, so drop the local copy rather than stopping.
  while IFS= read -r path; do
    [[ -e "$path" ]] || continue
    git ls-files --error-unmatch "$path" >/dev/null 2>&1 && continue
    note "replacing untracked $path with the committed version"
    rm -f "$path"
  done < <(git diff --name-only HEAD "origin/$BRANCH" 2>/dev/null)

  if git symbolic-ref --quiet HEAD >/dev/null; then
    git merge --ff-only "origin/$BRANCH"
  else
    git checkout -B "$BRANCH" "origin/$BRANCH" --quiet
  fi
fi

# Compose reads .env, so the checkout and the running containers agree on the
# tag afterwards — `docker compose ps` and a bare `up -d` stay consistent.
TAG="${TAG:-$(git rev-parse HEAD)}"
if [[ "$ROLLBACK" == 1 ]]; then
  # The server clones shallow, so the commit being rolled back to may not be in
  # the local history at all. Ask for it by name before reaching for it.
  git cat-file -e "$TAG^{commit}" 2>/dev/null || git fetch --quiet origin "$TAG" ||
    die "commit $TAG is not in this checkout and origin will not serve it."
  git -c advice.detachedHead=false checkout --force "$TAG" --quiet
fi

APP_IMAGE="$(grep -E '^YAPPED_IMAGE=' .env 2>/dev/null | cut -d= -f2 || true)"
APP_IMAGE="${APP_IMAGE:-ghcr.io/marvinparanoid/yapped}"

if [[ "$BUILD" == 1 ]]; then
  step "Building images here"
  YAPPED_TAG="$TAG" docker compose build
else
  step "Waiting for CI to publish ${TAG:0:7}"
  for attempt in $(seq 1 "$REGISTRY_WAIT"); do
    if docker manifest inspect "$APP_IMAGE:$TAG" >/dev/null 2>&1; then
      note "published"
      break
    fi
    [[ "$attempt" == "$REGISTRY_WAIT" ]] && die \
      "$APP_IMAGE:$TAG never appeared. Is the CI run green, and is the package readable? Use --build to build here instead."
    sleep 15
  done

  step "Pulling images"
  YAPPED_TAG="$TAG" docker compose pull --quiet
fi

# Written before anything is restarted so every later compose command in this
# shell — and any run by hand afterwards — uses the same tag.
if grep -qE '^YAPPED_TAG=' .env; then
  sed -i "s|^YAPPED_TAG=.*|YAPPED_TAG=$TAG|" .env
else
  printf 'YAPPED_TAG=%s\n' "$TAG" >> .env
fi

# Migrations run in their own one-shot container before the app is touched, so
# a migration that fails leaves the old app serving the old schema.
step "Applying migrations"
docker compose run --rm migrate || die "migrations failed — the running app was not touched."

step "Starting the app"
docker compose up -d --remove-orphans

step "Waiting for the app to report healthy"
for attempt in {1..30}; do
  status="$(docker compose ps app --format '{{.Health}}' 2>/dev/null || true)"
  case "$status" in
    healthy) note "healthy after $((attempt * 5))s"; break ;;
    unhealthy) docker compose logs --tail 40 app; die "the app came up unhealthy." ;;
  esac
  [[ "$attempt" == 30 ]] && { docker compose logs --tail 40 app; die "the app never became healthy."; }
  sleep 5
done

# Recorded only once the new version is actually serving, so --rollback always
# points at something that worked.
[[ "$ROLLBACK" == 1 ]] || echo "$PREVIOUS" > "$STATE"

step "Reclaiming disk"
docker image prune --force >/dev/null || true
df -h "$ROOT" | tail -1

printf '\n\033[32mDeployed %s\033[0m\n' "${TAG:0:7}"
[[ "$ROLLBACK" == 1 ]] || note "previous was ${PREVIOUS:0:7} — ./scripts/deploy.sh --rollback goes back to it."
