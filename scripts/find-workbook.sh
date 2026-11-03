#!/bin/sh
# Runs on Netlify each time the site is published (see netlify.toml).
# Finds the spreadsheet in the data folder and writes its name to data/workbook.txt,
# which the website reads to know which file to load. This means you can name the
# spreadsheet after the concert (for example 27-spring-band.xlsx) with no code edits.
#
# Rule: use any .xlsx in data/ other than the blank template (concert-data.xlsx), sample
# files (names containing "example") and Excel temp files (names starting with ~$).
# If there is more than one, the first alphabetically wins. If there is none, fall back
# to concert-data.xlsx. This script never fails the build.

cd "$(dirname "$0")/../data" 2>/dev/null || { echo "find-workbook: no data folder"; exit 0; }

chosen=""
for f in *.xlsx; do
  [ -e "$f" ] || continue
  case "$f" in
    concert-data.xlsx|*[Ee][Xx][Aa][Mm][Pp][Ll][Ee]*|'~$'*) continue ;;
  esac
  chosen="$f"
  break
done

if [ -z "$chosen" ] && [ -f concert-data.xlsx ]; then
  chosen="concert-data.xlsx"
fi

if [ -n "$chosen" ]; then
  printf '%s\n' "$chosen" > workbook.txt
  echo "find-workbook: using data/$chosen"
else
  rm -f workbook.txt
  echo "find-workbook: no spreadsheet found in data/"
fi
exit 0
