const searchInput = document.querySelector("#search_input");
const searchOutput = document.querySelector("#search_output");
const FULL_MODE = document.body.classList.contains("search-page");
const QUICK_LIMIT = 4;  // dropdown shows up to this many; overflow goes to search.html

let searchIndex;

let searchResultsCount = 0;
let searchSelection = -1;

// search.json's content hash is supplied by the page on the script tag (see data-search-version) — keeps search.json cache-busted independently of this file
const SEARCH_JSON_VERSION = document.currentScript?.dataset.searchVersion || "";

// asynchronously load search "index" (the search box will remain disabled until then)
fetch("search.json" + (SEARCH_JSON_VERSION ? "?v=" + SEARCH_JSON_VERSION : ""))
    .then(response => response.json())
    .then(data => {
        searchIndex = data;
        searchInput.removeAttribute("disabled");

        if (FULL_MODE) {
            const q = new URLSearchParams(window.location.search).get("q") || "";
            if (q) {
                searchInput.value = q;
                showFullResults(searchAll(q));
            }
            searchInput.focus();
        }
    })
    .catch(error => {
        searchOutput.innerHTML = `<span class="error">${error}</span>`
    });

// filler words dropped from queries so e.g. "almond recipe" doesn't fail to match Almond Crescent Cookies just because no recipe contains the literal word "recipe"
const SEARCH_STOP_WORDS = new Set(["recipe", "recipes", "with", "and", "or", "the", "a", "an", "for", "of"]);

// score and rank every entry; returns ALL matches sorted high-to-low (no slicing)
function searchAll(query) {
    let tokens = query.toLowerCase().split(/[\s,]+/).filter(t => t && !SEARCH_STOP_WORDS.has(t));
    if (tokens.length === 0) {
        const fallback = query.toLowerCase().trim();
        if (!fallback) return [];
        tokens = [fallback];
    }

    // category may arrive as a list (multi-category recipes) — flatten to a single haystack string
    const flatten = h => Array.isArray(h) ? h.join(" ") : (h || "");
    const matchesEvery = haystack => {
        const h = flatten(haystack).toLowerCase();
        return tokens.every(t => h.includes(t));
    };
    const matchesStart = haystack => flatten(haystack).toLowerCase().startsWith(query.toLowerCase());

    let results = [];
    searchIndex.forEach(e => {
        let score = 0;
        if (matchesEvery(e["title"])) score += 20;
        if (matchesEvery(e["original_title"])) score += 10;
        if (matchesEvery(e["category"])) score += 5;
        if (matchesEvery(e["author"])) score += 5;
        if (matchesEvery(e["description"])) score += 2;
        if (matchesEvery(e["htmlfile"])) score += 1;

        if (matchesStart(e["title"])) score += 10;
        if (matchesStart(e["original_title"])) score += 5;

        if (score > 0 && e["favorite"]) score += 2;

        results.push({score: score, e: e});
    });

    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.e);
}

function clearResults() {
    searchResultsCount = 0;
    searchSelection = -1;
    searchOutput.innerHTML = "";
}

function iconHtml(e) {
    let s = "";
    if (e.favorite) s += `<img src="assets/tabler-icons/tabler-icon-star.svg"> `;
    if (!e.veggie && !e.vegan) s += `<img src="assets/tabler-icons/tabler-icon-meat.svg"> `;
    if (e.vegan) s += `<img src="assets/tabler-icons/tabler-icon-leaf.svg"> `;
    if (e.spicy) s += `<img src="assets/tabler-icons/tabler-icon-pepper.svg"> `;
    if (e.sweet) s += `<img src="assets/tabler-icons/tabler-icon-candy.svg"> `;
    if (e.salty) s += `<img src="assets/tabler-icons/tabler-icon-salt.svg"> `;
    if (e.sour)  s += `<img src="assets/tabler-icons/tabler-icon-lemon.svg"> `;
    if (e.bitter) s += `<img src="assets/tabler-icons/tabler-icon-coffee.svg"> `;
    if (e.umami) s += `<img src="assets/tabler-icons/tabler-icon-mushroom.svg"> `;
    return s;
}

// dropdown rendering: top QUICK_LIMIT visible, plus an overflow link to search.html when more matches exist
function showDropdownResults(results, totalCount) {
    const overflow = totalCount > results.length;
    searchResultsCount = results.length + (overflow ? 1 : 0);
    searchSelection = -1;

    let i = 0;
    let html = results.map(e =>
        `<a class="searchresult" href="${e.htmlfile}" id="${i++}">`
        + `<h3>`
        + `<span class="title">${e.title}</span>`
        + (e.original_title ? `<em>${e.original_title}</em>` : ``)
        + `</h3>`
        + `<i class="icons">${iconHtml(e)}</i>`
        + `</a>`
    ).join("");

    if (overflow) {
        const q = encodeURIComponent(searchInput.value);
        html += `<a class="searchresult more" href="search.html?q=${q}" id="${i++}">View all ${totalCount} results →</a>`;
    }

    searchOutput.innerHTML = html;
}

// full-page rendering: every match, styled like the index/category recipe-link rows
function showFullResults(results) {
    if (results.length === 0) {
        searchOutput.innerHTML = `<p class="no-results">No matches.</p>`;
        return;
    }
    const html = results.map(e =>
        `<a class="recipe-link" href="${e.htmlfile}">`
        + `<h3>`
        + `<span class="title">${e.title}</span>`
        + (e.original_title ? `<em>${e.original_title}</em>` : ``)
        + `</h3>`
        + `<i class="icons">${iconHtml(e)}</i>`
        + (e.description ? `<p class="descr">${e.description}</p>` : ``)
        + `</a>`
    ).join("");
    searchOutput.innerHTML = html;
}

searchInput.addEventListener('input', () => {
    clearResults();
    if (!searchInput.value) {
        if (FULL_MODE) history.replaceState(null, "", window.location.pathname);
        return;
    }
    const all = searchAll(searchInput.value);
    if (FULL_MODE) {
        history.replaceState(null, "", `?q=${encodeURIComponent(searchInput.value)}`);
        showFullResults(all);
    } else {
        showDropdownResults(all.slice(0, QUICK_LIMIT), all.length);
    }
});

function highlightSearchSelection() {
    document.querySelectorAll(".searchresult").forEach(e => e.classList.remove("selected"));
    if (document.getElementById(`${searchSelection}`)) {
        document.getElementById(`${searchSelection}`).classList.add("selected");
    }
}

// keyboard navigation (dropdown only)
searchInput.addEventListener('keydown', e => {
    if (FULL_MODE) return;
    if (e.key == "ArrowUp") {
        searchSelection = Math.max(-1, searchSelection - 1);
        e.preventDefault();
    } else if (e.key == "ArrowDown") {
        searchSelection = Math.min(searchResultsCount - 1, searchSelection + 1);
        e.preventDefault();
    } else if (e.key == "Enter") {
        if (searchSelection != -1) {
            document.getElementById(`${searchSelection}`).click();
        }
    }
    highlightSearchSelection();
});

// hover highlighting (dropdown only)
searchOutput.addEventListener('mousemove', e => {
    if (FULL_MODE) return;
    const target = e.target.closest("a.searchresult");
    if (!target) return;
    searchSelection = parseInt(target.id);
    highlightSearchSelection();
});
