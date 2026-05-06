# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`nyum` is a Pandoc-powered static site generator for a personal recipe collection. There is no application code in a traditional sense — the entire generator is `build.sh` (a Bash script) plus a set of Pandoc templates. Markdown recipes in `_recipes/` are rendered into a static site in `_site/`.

## Commands

- `bash build.sh` — build the site into `_site/`. Flags: `-q`/`--quiet`, `-c`/`--clean` (resets `_site/` and `_temp/` and exits without building), `-h`/`--help`.
- `bash deploy.sh` — `rsync` the contents of `_site/` to the `deploy_remote` configured in `config.yaml`. Uses `--delete`, so verify the target before first run. `-n`/`--dry-run` is available.
- There is no test suite, lint step, or package manager — Pandoc (≥ 2.8) is the only dependency.

### Windows note

The repo is checked out on Windows but `build.sh`/`deploy.sh` are Bash scripts. Run them under Git Bash or WSL — `tput`, `rsync`, and the script's string-munging assume a POSIX environment. PowerShell will not work directly.

## Architecture

The build is a multi-stage Pandoc pipeline orchestrated by `build.sh`. Understanding it requires reading `build.sh` alongside the templates, since several templates are repurposed to emit non-HTML data.

1. **Metadata extraction.** Each recipe in `_recipes/*.md` is run through Pandoc twice using "technical" templates that exist solely to coerce Pandoc into emitting structured data instead of HTML:
   - `_templates/technical/category.template.txt` emits one line `<basename> <category>` per category (multi-category recipes produce multiple lines via `$for(category)$`).
   - `_templates/technical/metadata.template.json` emits `$meta-json$` — Pandoc's full metadata as JSON — per recipe.
2. **Group-by-category in awk.** `_templates/technical/group_by_category.awk` reads every `.category.txt` in a single pass and produces three things: the global `_temp/index.json` (shape `{"categories": [{"category": "...", "category_faux_urlencoded": "...", "recipes": [...]}, ...]}`), one `_temp/<slug>.category.json` per category, and one `_temp/<basename>.slug.txt` per recipe (with the slug for that recipe's *first* category — the breadcrumb target). Multi-category recipes naturally appear in multiple buckets because each (basename, category) pair is its own input line. The slug is a deterministic lowercase + space-strip + non-alnum-to-hex encoding (so `"Korean Food"` → `koreanfood`); the encoder lives inside the awk script. This used to be a nested bash loop spawning ~5 processes per recipe — the upstream README's FAQ still calls that out as the most fragile piece, but the awk rewrite fixes it.
3. **Per-recipe HTML pages.** For each `_recipes/*.md`, `pandoc` is invoked with `_templates/recipe.template.html`, merging `config.yaml` and injecting `basename`, `updatedtime`, `category_faux_urlencoded` (read with `read -r SLUG < _temp/<basename>.slug.txt` — fork-free), and `category_display` (the first category's name as a scalar, since `$category$` from the YAML may be a list). The breadcrumb uses `$category_display$` so a multi-category recipe still shows a single, valid back-link.
4. **Per-category HTML pages.** One Pandoc invocation per `_temp/*.category.json`, using `_templates/category.template.html`. The category JSON file is supplied as a `--metadata-file`, so its top-level fields (`category`, `recipes`, …) become template variables. Both the index and category templates render each recipe via the shared partial `_templates/recipe_list_item.partial.html`.
5. **Index page + search page + search index.** The grouped `_temp/index.json` is fed back into Pandoc alongside `_templates/index.template.html` (using `_templates/technical/empty.md` as the input document) to produce `_site/index.html`. `_templates/search.template.html` produces a static `_site/search.html` that hydrates from a `?q=` URL parameter. A flat concatenation of all metadata JSON becomes `_site/search.json`, consumed client-side by `_assets/search.js`. The same script powers two render modes — a dropdown on the index page (top 4 + "View all N results →" overflow link to `search.html` when there are more than 4 matches) and a full inline list on the search page — branching on `<body class="search-page">`.

`deploy.sh` reuses the metadata-template trick: it runs Pandoc against `_templates/technical/deploy_remote.template.txt` purely to extract the `deploy_remote` value out of `config.yaml`.

### Known fragility

- Filenames in `_recipes/` must not contain spaces — the Bash string handling will break.
- A recipe named `index.md` will be overwritten by the generated index. Likewise, a recipe whose basename collides with any category's faux-encoded slug (e.g. a recipe `uncategorized.md` would clash with `_site/uncategorized.html`) will be overwritten.
- `uncategorized_label` in `config.yaml` may not contain an odd number of `"` characters.
- An empty `_recipes/` directory will likely break the build.
- **Windows / Git Bash:** Pandoc emits CRLF line endings on Windows. `build.sh` strips CRs from the captured `.category.txt` content (`cat ... | tr -d '\r'`) before grouping. Removing that `tr -d '\r'` re-introduces a subtle bug where `$()` strips both `\r\n` from only the *last* line of the captured string, causing `sort | uniq` to emit the same category twice and silently doubling every recipe in the rendered index.

## Recipe format

Recipes live in `_recipes/*.md`. Images go in `_recipes/images/` and are referenced from front matter as `images/foo.jpg`. Each recipe has YAML front matter (only `title` is required; full list in README.md) and a body of horizontal-rule-separated steps, where each step is an unordered list of ingredients (amounts wrapped in backticks to enable the three-column layout) followed by a `>` blockquote with the instruction. See `_recipes/bolognese.md` for a canonical example.

## Configuration

`config.yaml` controls site-wide labels, language, the optional `github_url` (which enables the per-recipe "Edit" link), and `deploy_remote`. It is loaded as a Pandoc metadata file in every Pandoc invocation, so any key added there becomes available in every template as `$key$`.
