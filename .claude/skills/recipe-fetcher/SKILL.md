---
name: recipe-fetcher
description: >
  Fetch a recipe from any URL and save it as a markdown file in the user's recipe collection.
  Use this skill whenever the user shares a recipe URL and wants to add it to their recipes,
  or asks to "save this recipe", "add this recipe", "create a recipe from this link",
  or mentions importing/fetching a recipe from a website. Also trigger when the user pastes
  a URL from a cooking site (e.g. allrecipes, nytimes cooking, seriouseats, gypsyplate, etc.)
  and asks to save or create a recipe from it.
---

# Recipe Fetcher

You help the user save recipes from the web into their personal recipe collection. Each recipe is a markdown file that follows a specific template format, with an accompanying image.

## Fetching Strategy

Recipe websites are often blocked by direct fetch tools (WebFetch). Use the chrome-devtools MCP as the primary method, with WebSearch as a fallback.

**Primary: chrome-devtools MCP**
Use `mcp__chrome-devtools__new_page` with the recipe URL (or `mcp__chrome-devtools__list_pages` + `mcp__chrome-devtools__navigate_page` if a tab is already open). Once the page loads, use `mcp__chrome-devtools__take_snapshot` to inspect the page (returns the accessibility tree as text with `uid` identifiers), or skip straight to `mcp__chrome-devtools__evaluate_script` to pull the recipe data out of the DOM directly.

**Fallback: WebSearch**
If Chrome can't reach the site (blocked, permission issues, timeouts), fall back to WebSearch to find the recipe details. Search for the recipe name + "recipe" + key terms like "ingredients" to find the information from alternative sources or cached snippets. The goal is always to produce a recipe file — don't give up just because one method fails.

## Workflow

1. **Open the URL in Chrome** — `mcp__chrome-devtools__new_page` with the recipe URL. Most recipe pages render quickly; if a page is JS-heavy, `mcp__chrome-devtools__wait_for` is available.

2. **Inspect the page (optional)** — for an unfamiliar recipe site, run `mcp__chrome-devtools__take_snapshot` to see the structure. The snapshot returns the accessibility tree as text with `uid` identifiers; it can be large (tens of KB), so for known-good sites you can skip straight to `evaluate_script`.

3. **Extract ingredients and instructions via `evaluate_script`.** Targeted DOM queries are more reliable than parsing snapshots, especially for long ingredient lists or multi-paragraph steps that snapshots may truncate:
   ```javascript
   const ingEls = document.querySelectorAll('.recipe-ingredients li, [class*="ingredient"] li, .ingredients li');
   const ingredients = Array.from(ingEls).map(el => el.innerText.trim()).filter(t => t.length);

   const stepEls = document.querySelectorAll('ol.recipe-instructions li, [class*="instruction"] li, ol li');
   const instructions = Array.from(stepEls).map(el => el.innerText.trim()).filter(t => t.length > 10);

   JSON.stringify({ ingredients, instructions });
   ```
   Selectors vary by site; widen them or inspect the snapshot if the first pass returns nothing.

4. **Extract metadata** — prep/cook/total time, yield/servings. These are often available via schema.org microdata (`[itemprop="recipeYield"]`, `[itemprop="totalTime"]`, etc.) or inside the recipe card markup. Use `evaluate_script` again.

5. **Save the recipe image** — Every recipe MUST have an image. Try these methods in order until one succeeds:

   **Method A: Extract from the source page.** Find the main recipe/hero image on the page via `evaluate_script`:
   ```javascript
   const img = document.querySelector('.recipe-image img, article img, .post-content img, [class*="hero"] img, .featured-image img');
   img ? img.src : document.querySelector('article img, main img')?.src;
   ```
   Then use Bash to download it:
   ```bash
   curl -L -o /path/to/images/recipe-name.jpg "IMAGE_URL"
   ```
   Use the same base name as the recipe file (e.g. `chicken-jollof-rice.webp`). Keep whatever format the source provides (jpg, webp, png).

   **Method B: Search for a free image.** If the source page is unavailable or the image can't be downloaded, use `mcp__chrome-devtools__navigate_page` to a free image site (Unsplash, Pexels, Pixabay) and search for the dish name. Download a suitable photo and save it to the `images/` folder.

   **Method C: Generate a placeholder image.** If no photo can be found online, use Python (Pillow — install with `python -m pip install Pillow` if missing) to generate a simple placeholder image (e.g. 800x600, warm background color like #F5E6CC, with the recipe title in a readable font centered on it). Save as `.jpg` to the `images/` folder.

   **Never omit the `image` field from frontmatter.** Every recipe must have an accompanying image.

6. **Format and save** — write the recipe as a markdown file following the template below. Save it to the user's recipe folder.

## Recipe Template

Every recipe follows this exact format. There are NO section headers (no `##` for ingredients or instructions) — just the frontmatter, then the ingredient list, then the instruction steps.

### Frontmatter

```yaml
---
title: Recipe Title
category: [Dinner, Chicken]
description: Short description of the dish
image: images/recipe-title.jpg
size: 4 servings
time: 1 hour 30 minutes
source: https://original-recipe-url.com/recipe
---
```

Frontmatter fields:
- `title` — The recipe name, in title case. Capitalize all major words; keep small connectors lowercase: "with", "and", "or", "for", "of", "the", "a", "in", "on", "to". Examples: "Pasta with White Sausage Sauce" (not "Pasta With ..."), "Tomato-Poached Fish with Chile Oil and Herbs", "Chicken with Lemon".
- `category` — REQUIRED. Either a single string (`category: Dessert`) or a YAML inline list (`category: [Dinner, Chicken]`). Recipes appear under each of their categories on the index. The first listed category is used for the breadcrumb back-link on the recipe page, so put the most general category first. Recipes without a category fall into a catch-all "Uncategorized" bucket — avoid that.
  - **Picking categories.** Choose at least one of: `Breakfast`, `Dessert`, `Dinner`, `Bread`, `Sides`, `Soup`, `Pasta`. For meat mains, also add the protein: `Chicken`, `Beef`, `Pork`, `Turkey`, or `Seafood`. For pasta dinners, also add `Pasta`. For soups, also add `Soup`.
  - **Examples:** chicken main → `[Dinner, Chicken]`. Beef stew → `[Dinner, Beef]`. Lasagna → `[Dinner, Pasta]`. Bolognese sauce (component, not a complete dish) → `Pasta`. Sourdough loaf → `Bread`. Apple cake → `Dessert`. Mashed potatoes → `Sides`. Pancakes → `Breakfast`. Chicken Piccata Pasta (multi-faceted) → `[Dinner, Chicken, Pasta]`.
- `original_title` — (optional) If the recipe has a name in another language (e.g. Korean, Italian), include it here
- `description` — A brief, appealing description (one line)
- `image` — Path to the saved image in `images/` subfolder (e.g. `images/chicken-jollof-rice.jpg`). This field is REQUIRED — every recipe must have an image. Name the image file after the recipe's basename exactly (`chicken-jollof-rice.md` → `images/chicken-jollof-rice.jpg`). Never reuse another recipe's image filename — copy-paste mistakes here are a common source of "wrong photo on the page" bugs. And never include `.md` in the image filename (e.g. `images/recipe.md.webp` is wrong; only the recipe markdown gets the `.md` extension).
- `size` — Yield, e.g. "4 servings", "12 cookies", "1 loaf"
- `time` — Total time (combine prep + cook if listed separately). Use natural format like "1 hour 30 minutes", "45 minutes", "4 hours"
- `source` — The original URL the recipe was fetched from
- Do NOT include `favorite`, `vegan`, `sweet`, `spicy` or other tag fields — the user adds those later

### Ingredients

List ingredients as bullet points directly after the frontmatter (no header). Wrap quantities in backtick inline code:

```markdown
* `2 tbsp` olive oil
* `1` onion, diced
* `3` cloves garlic, minced
* salt and pepper, to taste
```

Formatting rules:
- Each ingredient is a `* ` bullet
- Quantities go in backticks: `` `2 cups` ``, `` `1 tbsp` ``, `` `3` ``
- Ingredients without a specific measurement (like "salt to taste") have no backticks
- Always use abbreviations for units: tbsp, tsp, oz, lbs, cups — never spell out "tablespoons", "teaspoons", etc.
- Always use unicode fraction symbols: ½, ¼, ¾, ⅓, ⅔, ⅛ — never use `1/2`, `1/4` etc.
  - Examples: `½ cup`, `1½ tsp`, `¼ tsp`, `⅓ cup`
- **Include metric measurements when the source recipe provides them.** Put both inside the same backticks, separated by `/`: `` `⅔ cup / 90g` ``, `` `1 scant cup / 190g` ``, `` `1½ cups / 200g` ``. Omit metric for units that don't usefully convert (tsp, tbsp of small ingredients, whole eggs).
- Keep the ingredient description after the quantity natural and readable

### Instructions

Each step is a blockquote, separated by horizontal rules. No headers before the instructions — just a blank line after the ingredients, then start with the first blockquote:

```markdown
* `1 tbsp` olive oil
* `2` eggs

> First step of the recipe. Include temperature, timing, and visual cues.

---

> Second step. Keep each step as a coherent unit of work.

---

> Final step. Include serving suggestions if the recipe has them.
```

Formatting rules:
- Each step starts with `> `
- Steps are separated by `---` (horizontal rule)
- No `---` before the first step or after the last step
- Keep steps in the same logical grouping as the original recipe
- Include temperatures, times, and visual doneness cues

## File naming

Name the file using the recipe title in lowercase with hyphens:
- "Chicken Jollof Rice" → `chicken-jollof-rice.md`
- "Baked Salmon" → `baked-salmon.md`
- Drop articles like "the", "a" from the filename

## Where to save

Save the recipe markdown file to the user's recipe folder (where the other `.md` recipe files live). Save the image to the `images/` subfolder within that same recipe folder.

## After saving

After creating the recipe file, present a link to it so the user can review it. Keep the confirmation brief.
