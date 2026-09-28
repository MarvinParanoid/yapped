#!/usr/bin/env bash
#
# Restore the archive from a backup. The other half of scripts/backup.sh — a
# backup nobody has ever restored is a hope, not a backup.
#
#   ./scripts/restore.sh --check                     restore into a scratch
#                                                    database and compare, then
#                                                    throw it away
#   ./scripts/restore.sh --into yapped_old           restore beside the live one
#   ./scripts/restore.sh --live                      replace the live archive
#   ./scripts/restore.sh --file <dump> [...]         pick a dump; default is latest
#
# --check is the one to run on a schedule. It proves the newest dump is
# restorable without touching anything that matters.

set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/yapped-backups}"
DUMP="$BACKUP_DIR/latest.sql.gz"
MODE=""
TARGET=""

step() { printf '\n\033[1m>> %s\033[0m\n' "$1"; }
note() { printf '   %s\n' "$1"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE="check"; TARGET="yapped_restore_check" ;;
    --into) MODE="into"; TARGET="${2:-}"; shift; [[ -n "$TARGET" ]] || die "--into needs a database name" ;;
    --live) MODE="live"; TARGET="yapped" ;;
    --file) DUMP="${2:-}"; shift; [[ -n "$DUMP" ]] || die "--file needs a path" ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

[[ -n "$MODE" ]] || die "pick one of --check, --into <db>, --live."
[[ -f "$DUMP" ]] || die "no dump at $DUMP"

DB_CONTAINER="$(docker compose ps -q db)"
[[ -n "$DB_CONTAINER" ]] || die "the db container is not running."

psql_as_admin() {
  docker exec -i "$DB_CONTAINER" psql -U yapped -d postgres --quiet \
    -v ON_ERROR_STOP=1 -c "SET client_min_messages TO WARNING;" "$@"
}
count_in() {
  docker exec -i "$DB_CONTAINER" psql -U yapped -d "$1" -tAc \
    'select (select count(*) from "Yap"), (select count(*) from "User"), (select count(*) from "Team")' 2>/dev/null
}

note "dump:   $DUMP ($(du -Lh "$DUMP" | cut -f1), $(date -r "$DUMP" '+%F %H:%M'))"
note "target: $TARGET"

if [[ "$MODE" == "live" ]]; then
  printf '\n\033[31mThis replaces the live archive.\033[0m Type the word yapped to confirm: '
  read -r answer
  [[ "$answer" == "yapped" ]] || die "not confirmed."
  step "Stopping the app so nothing writes mid-restore"
  docker compose stop app
fi

step "Preparing $TARGET"
if [[ "$MODE" != "live" ]]; then
  psql_as_admin -c "DROP DATABASE IF EXISTS \"$TARGET\";" >/dev/null
  psql_as_admin -c "CREATE DATABASE \"$TARGET\" OWNER yapped;" >/dev/null
fi

step "Restoring"
# The dump carries --clean --if-exists, so restoring over a populated database
# is the supported path; errors still stop the run.
gunzip -c "$DUMP" |
  docker exec -i "$DB_CONTAINER" psql -U yapped -d "$TARGET" --quiet \
    -v ON_ERROR_STOP=1 >/dev/null || die "psql refused the dump."

read -r yaps users teams <<<"$(count_in "$TARGET" | tr '|' ' ')"
note "restored: $yaps records, $users people, $teams teams"
[[ "${teams:-0}" -ge 1 ]] || die "the restored archive has no teams — that dump is not usable."

if [[ "$MODE" == "check" ]]; then
  step "Comparing against the live archive"
  read -r lyaps lusers lteams <<<"$(count_in yapped | tr '|' ' ')"
  note "live:     $lyaps records, $lusers people, $lteams teams"
  if [[ "$yaps" -lt "$lyaps" ]]; then
    note "the dump is older than the live archive by $((lyaps - yaps)) records — expected if"
    note "anything was filed since it was taken."
  fi

  step "Discarding the scratch database"
  psql_as_admin -c "DROP DATABASE \"$TARGET\";" >/dev/null
  printf '\n\033[32mThe newest backup restores cleanly.\033[0m\n'
  exit 0
fi

if [[ "$MODE" == "live" ]]; then
  step "Starting the app"
  docker compose up -d app
fi

printf '\n\033[32mRestored into %s\033[0m\n' "$TARGET"
[[ "$MODE" == "into" ]] && note "nothing points at it yet — it is there for you to look at."
