#!/bin/sh
# Daily consistent copy of the enquiry database, keeping 30 days. Run from the ganjineh user's cron.
set -eu
DB=/srv/ganjineh/data/enquiries.sqlite3
OUT=/srv/ganjineh/backups
mkdir -p "$OUT"
chmod 700 "$OUT"
[ -f "$DB" ] || exit 0
python3 -c 'import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()' "$DB" "$OUT/enquiries-$(date +%F).sqlite3"
find "$OUT" -name 'enquiries-*.sqlite3' -mtime +30 -delete
