#!/usr/bin/awk -f

# Reads all _temp/*.category.txt files (each line: "<basename> <category>"),
# groups recipes by category, and writes:
#   _temp/index.json            - all categories with recipes nested
#   _temp/<slug>.category.json  - one per category, same shape minus the wrapper
#   _temp/<basename>.slug.txt   - one per recipe, the precomputed category slug
#
# Replaces a nested bash GROUP BY loop that spawned ~5 processes per recipe.

function slug(str,    c, len, res, i) {
    str = tolower(str)
    len = length(str)
    res = ""
    for (i = 1; i <= len; i++) {
        c = substr(str, i, 1)
        if (c ~ /[0-9A-Za-z]/) res = res c
        else if (c == " ")     continue
        else                   res = res sprintf("%02X", ord[c])
    }
    return res
}

BEGIN {
    for (i = 0; i <= 255; i++) ord[sprintf("%c", i)] = i
}

{
    sub(/\r$/, "")  # Pandoc on Windows emits CRLF
    pos = index($0, " ")
    if (pos == 0) next

    basename = substr($0, 1, pos - 1)
    category = substr($0, pos + 1)

    if (!(category in seen_cat)) {
        seen_cat[category] = 1
        all_cats[++ncats] = category
    }

    if (category in recipes)
        recipes[category] = recipes[category] SUBSEP basename
    else
        recipes[category] = basename

    print slug(category) > ("_temp/" basename ".slug.txt")
}

END {
    # sort categories alphabetically (portable across awk implementations)
    for (i = 1; i <= ncats; i++) {
        for (j = i + 1; j <= ncats; j++) {
            if (all_cats[i] > all_cats[j]) {
                tmp = all_cats[i]; all_cats[i] = all_cats[j]; all_cats[j] = tmp
            }
        }
    }

    idx = "_temp/index.json"
    printf "{\"categories\": [" > idx

    sep_outer = ""
    for (i = 1; i <= ncats; i++) {
        category = all_cats[i]
        s = slug(category)
        cat = "_temp/" s ".category.json"

        printf "%s{\"category\": \"%s\", \"category_faux_urlencoded\": \"%s\", \"recipes\": [", sep_outer, category, s > idx
        printf "{\"category\": \"%s\", \"category_faux_urlencoded\": \"%s\", \"recipes\": [", category, s > cat

        nrec = split(recipes[category], rec_list, SUBSEP)
        sep_inner = ""
        for (j = 1; j <= nrec; j++) {
            basename = rec_list[j]
            meta_path = "_temp/" basename ".metadata.json"

            meta = ""
            while ((getline line < meta_path) > 0) {
                sub(/\r$/, "", line)
                meta = (meta == "") ? line : meta "\n" line
            }
            close(meta_path)

            printf "%s%s", sep_inner, meta > idx
            printf "%s%s", sep_inner, meta > cat
            sep_inner = ","
        }

        printf "]}\n" > idx
        printf "]}\n" > cat
        close(cat)

        sep_outer = ","
    }

    print "]}" > idx
    close(idx)
}
