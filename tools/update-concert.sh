#!/bin/sh
# Brings an existing concert project up to date with the latest template code.
#
# Run it from the TEMPLATE folder and give it the concert project's folder:
#   sh tools/update-concert.sh ~/Documents/GitHub/26-city-jazz
#
# It copies only the website's code (the page, styles, scripts, libraries and Netlify settings).
# It never touches the concert's spreadsheet, photos, or README, and the concert project's
# index.html placeholder text is replaced by Netlify when it publishes, so nothing there is lost.
#
# Add --dry-run to just list what would change without changing anything.

DRY=""
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="--dry-run" ;;
    *) TARGET="$arg" ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "Usage: sh tools/update-concert.sh /path/to/concert-project [--dry-run]"
  exit 1
fi

SRC="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${TARGET%/}"

if [ ! -f "$TARGET/index.html" ] || [ ! -d "$TARGET/data" ]; then
  echo "That doesn't look like a concert project (no index.html and data folder): $TARGET"
  exit 1
fi
if [ "$SRC" = "$(cd "$TARGET" && pwd)" ]; then
  echo "That is the template itself. Give the concert project's folder instead."
  exit 1
fi

# --checksum: only files whose content really differs; --delete: files removed from the template go too
SYNC="rsync -rl --checksum --itemize-changes $DRY"
CHANGES="$(mktemp)"
trap 'rm -f "$CHANGES"' EXIT

echo "Updating $TARGET from $SRC"
[ -n "$DRY" ] && echo "(dry run - nothing is changed)"

for file in index.html netlify.toml .gitignore; do
  if [ -f "$SRC/$file" ] && ! cmp -s "$SRC/$file" "$TARGET/$file"; then
    echo ">f $file" >> "$CHANGES"
    [ -n "$DRY" ] || cp "$SRC/$file" "$TARGET/$file"
  fi
done
for dir in assets/css assets/js assets/vendor scripts; do
  [ -n "$DRY" ] || mkdir -p "$TARGET/$dir"
  $SYNC --delete "$SRC/$dir/" "$TARGET/$dir/" 2>&1 | sed -E "s#^(>f[^ ]* +|\*deleting +)#\1$dir/#" >> "$CHANGES"
done

echo ""
# '>f' lines are files copied over, '*deleting' lines are files removed
UPDATED="$(grep -E '^(>|\*deleting)' "$CHANGES" | sed -E 's/^>f[^ ]* +/updated:  /; s/^\*deleting +/removed:  /')"
if [ -z "$UPDATED" ]; then
  echo "Already up to date - nothing changed."
else
  echo "$UPDATED"
fi
echo ""
echo "Not touched: data/ (your spreadsheet), assets/img/ (your photos), README.md."
if [ -z "$DRY" ] && [ -d "$TARGET/.git" ]; then
  echo ""
  echo "Changes in the project, ready to commit:"
  (cd "$TARGET" && git status --short)
fi
