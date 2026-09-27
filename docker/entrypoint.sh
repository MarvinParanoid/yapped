#!/bin/sh
set -e
# Kept for local use only — in compose the `migrate` service does this.
echo "RETRIEVING HISTORICAL RECORDS..."
exec "$@"
