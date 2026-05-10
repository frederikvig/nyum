#!/usr/bin/env bash

TIME_START=$(date +%s)

# exit on errors
set -e

# parse arguments
QUIET=false
CLEAN=false
while [[ $# -gt 0 ]]; do
    if [ "$1" = "-q" ] || [ "$1" = "--quiet" ]; then
        QUIET=true
        shift
    elif [ "$1" = "-c" ] || [ "$1" = "--clean" ]; then
        CLEAN=true
        shift
    elif [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        echo "Usage: bash build.sh [-q | --quiet] [-c | --clean]"
        echo "  Builds the site. If the -c flag is given, stops after resetting _site/ and _temp/."
        echo "  Set BUILD_JOBS=N to override the parallelism level (default: number of CPUs)."
        exit
    else
        shift
    fi
done

# parallelism for the per-recipe pandoc loops; overridable via BUILD_JOBS env var
JOBS="${BUILD_JOBS:-$(nproc 2>/dev/null || echo 4)}"
# cache-busting version stamp for static assets (CSS/JS/search.json), shared across all pandoc invocations
ASSET_VERSION="$TIME_START"
export QUIET ASSET_VERSION

function status {
    $QUIET && return
    BOLD=$(tput bold)
    NORMAL=$(tput sgr0)
    echo "${BOLD}$*${NORMAL}"
}

function x {
    _IFS="$IFS"
    IFS=" "
    $QUIET || echo "↪" "$*" >&2
    IFS="$_IFS"
    "$@"
}

# per-recipe metadata extraction; called in parallel via xargs
extract_metadata() {
    local FILE="$1"
    local BASE
    BASE="$(basename "$FILE" .md)"
    $QUIET || echo "↪ extract $BASE" >&2
    pandoc "$FILE" \
        --metadata-file config.yaml \
        --metadata basename="$BASE" \
        --template _templates/technical/category.template.txt \
        -t html -o "_temp/$BASE.category.txt"
    pandoc "$FILE" \
        --metadata htmlfile="$BASE.html" \
        --template _templates/technical/metadata.template.json \
        -t html -o "_temp/$BASE.metadata.json"
}
export -f extract_metadata

# per-recipe page rendering; called in parallel via xargs (depends on extract_metadata + group_by_category.awk having run)
render_recipe() {
    local FILE="$1"
    local BASE
    BASE="$(basename "$FILE" .md)"
    local SLUG CATEGORY_DISPLAY
    read -r SLUG < "_temp/$BASE.slug.txt"  # slug precomputed by group_by_category.awk
    # first category line (multi-category recipes have several): used for the breadcrumb display string
    CATEGORY_DISPLAY="$(head -n1 "_temp/$BASE.category.txt" | tr -d '\r' | cut -d' ' -f2-)"
    $QUIET || echo "↪ render $BASE" >&2
    pandoc "$FILE" \
        --metadata-file config.yaml \
        --metadata basename="$BASE" \
        --metadata category_faux_urlencoded="$SLUG" \
        --metadata category_display="$CATEGORY_DISPLAY" \
        --metadata updatedtime="$(date -r "$FILE" "+%Y-%m-%d")" \
        --metadata asset_version="$ASSET_VERSION" \
        --template _templates/recipe.template.html \
        -o "_site/$BASE.html"
}
export -f render_recipe

status "Resetting _site/ and _temp/..."
# (...with a twist, just to make sure this doesn't throw an error the first time)
x mkdir -p _site/
x touch _site/dummy.txt
x rm -r _site/
x mkdir -p _site/
x mkdir -p _temp/
x touch _temp/dummy.txt
x rm -r _temp/
x mkdir -p _temp/

$CLEAN && exit

status "Copying assets..."
x cp -r _assets/ _site/assets/

status "Copying images..."
x cp -r _recipes/images/ _site/images/

status "Extracting metadata (parallel, -P $JOBS)..."
printf '%s\n' _recipes/*.md | xargs -n 1 -P "$JOBS" bash -c 'extract_metadata "$1"' _

status "Grouping metadata by category..."
x awk -f _templates/technical/group_by_category.awk _temp/*.category.txt

status "Building recipe pages (parallel, -P $JOBS)..."
printf '%s\n' _recipes/*.md | xargs -n 1 -P "$JOBS" bash -c 'render_recipe "$1"' _

status "Building category pages..."
for FILE in _temp/*.category.json; do
    x pandoc _templates/technical/empty.md \
        --metadata-file config.yaml \
        --metadata title="dummy" \
        --metadata updatedtime="$(date "+%Y-%m-%d")" \
        --metadata asset_version="$ASSET_VERSION" \
        --metadata-file "$FILE" \
        --template _templates/category.template.html \
        -o "_site/$(basename "$FILE" .category.json).html"
done

status "Building index page..."
x pandoc _templates/technical/empty.md \
    --metadata-file config.yaml \
    --metadata title="dummy" \
    --metadata updatedtime="$(date "+%Y-%m-%d")" \
    --metadata asset_version="$ASSET_VERSION" \
    --metadata-file _temp/index.json \
    --template _templates/index.template.html \
    -o _site/index.html

status "Building search page..."
x pandoc _templates/technical/empty.md \
    --metadata-file config.yaml \
    --metadata title="dummy" \
    --metadata updatedtime="$(date "+%Y-%m-%d")" \
    --metadata asset_version="$ASSET_VERSION" \
    --template _templates/search.template.html \
    -o _site/search.html

status "Assembling search index..."
x awk 'BEGIN { printf "[" } FNR == 1 && NR > 1 { printf "," } { sub(/\r$/, ""); print } END { printf "]\n" }' _temp/*.metadata.json > _temp/search.json
x cp _temp/search.json _site/

TIME_END=$(date +%s)
TIME_TOTAL=$((TIME_END-TIME_START))

EMOJI="🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🥝🍅🥥🥑🍆🥔🥕🌽🌶️🥒🥬🥦"
status "All done after $TIME_TOTAL seconds!" "${EMOJI:RANDOM%${#EMOJI}:1}"
