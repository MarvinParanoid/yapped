#!/usr/bin/env bash
#
# Back up the archive. Run on the server, by cron or by hand.
#
#   ./scripts/backup.sh                 dump to ~/yapped-backups
#   BACKUP_DIR=/mnt/x ./scripts/backup.sh
#
# Two things are worth keeping and they are kept differently.
#
#   The database is dumped whole, gzipped, and rotated. It is tiny — a few tens
#   of kilobytes — so the policy is deliberately generous: everything for 30
#   days, then one per month, forever.
#
#   The uploads are evidence images, stored under a content hash and never
#   modified or deleted. Re-archiving them daily would copy the same bytes over
#   and over, so they are mirrored instead: new files are added, nothing is
#   rewritten.
#
# This writes to the same disk the database lives on. That protects against a
# bad migration, a wrong DELETE and a fat-fingered redaction — it does NOT
# protect against losing the box. Set BACKUP_MIRROR to an rsync destination
# (user@host:/path) to get a copy off the machine.

set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/yapped-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d-%H%M)"

step() { printf '\n\033[1m>> %s\033[0m\n' "$1"; }
note() { printf '   %s\n' "$1"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

[[ -f compose.yaml ]] || die "no compose.yaml in $PWD — wrong directory?"

DB_CONTAINER="$(docker compose ps -q db)"
[[ -n "$DB_CONTAINER" ]] || die "the db container is not running."

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"
DUMP="$BACKUP_DIR/db/yapped-$STAMP.sql.gz"

step "Dumping the database"
# Straight through gzip: never lands on disk uncompressed, and a failure in
# either half fails the whole thing rather than leaving half a backup.
set -o pipefail
docker exec "$DB_CONTAINER" pg_dump -U yapped -d yapped --clean --if-exists |
  gzip -9 > "$DUMP" || { rm -f "$DUMP"; die "pg_dump failed."; }

step "Verifying"
gzip -t "$DUMP" || { rm -f "$DUMP"; die "the dump is not a valid gzip stream."; }
# A dump that restores to an empty archive is the failure that looks like
# success, so check the tables that must be there are actually in it.
for table in User Team Yap; do
  zgrep -q "COPY public.\"$table\"" "$DUMP" ||
    { rm -f "$DUMP"; die "the dump has no rows for \"$table\" — refusing to keep it."; }
done
note "$(du -h "$DUMP" | cut -f1)  $(basename "$DUMP")"

step "Mirroring uploads"
# Content-addressed and immutable, so -n (never overwrite) is both correct and
# what makes this cheap on the second run.
docker run --rm \
  -v yapped_yapped-uploads:/src:ro \
  -v "$BACKUP_DIR/uploads":/dst \
  alpine sh -c 'cp -an /src/. /dst/ 2>/dev/null; find /dst -type f | wc -l' |
  tail -1 | xargs -I{} echo "   {} files held"

step "Rotating"
# Everything for KEEP_DAYS, then the first dump of each month, forever.
removed=0
while IFS= read -r -d '' old; do
  day="$(basename "$old" | sed -E 's/^yapped-[0-9]{4}-[0-9]{2}-([0-9]{2}).*/\1/')"
  [[ "$day" == "01" ]] && continue
  rm -f "$old"
  removed=$((removed + 1))
done < <(find "$BACKUP_DIR/db" -name 'yapped-*.sql.gz' -mtime "+$KEEP_DAYS" -print0)
note "$removed expired, $(find "$BACKUP_DIR/db" -name 'yapped-*.sql.gz' | wc -l) kept"

ln -sf "$DUMP" "$BACKUP_DIR/latest.sql.gz"

if [[ -n "${BACKUP_MIRROR:-}" ]]; then
  step "Copying off the box"
  rsync -a --delete "$BACKUP_DIR/" "$BACKUP_MIRROR/" || die "rsync to $BACKUP_MIRROR failed."
  note "mirrored to $BACKUP_MIRROR"
fi

step "Done"
df -h "$BACKUP_DIR" | tail -1
printf '\n\033[32mBacked up to %s\033[0m\n' "$DUMP"
