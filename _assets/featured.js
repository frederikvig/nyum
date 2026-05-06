// Today's pick — picks one favorite recipe per day, deterministically from the date.
// Reads search.json (already loaded by the search bar), filters for favorites, and
// rotates daily. Falls back to silently hiding the block if anything goes wrong.

fetch("search.json")
    .then(r => r.json())
    .then(all => {
        const favorites = all.filter(r => r.favorite);
        if (favorites.length === 0) return;

        const d = new Date();
        const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
        const pick = favorites[key % favorites.length];

        const block = document.getElementById("featured");
        if (!block) return;

        const wrap = block.querySelector(".featured-img-wrap");
        wrap.href = pick.htmlfile;
        const img = wrap.querySelector("img");
        if (pick.image) {
            img.src = pick.image;
            img.alt = pick.title;
        } else {
            img.remove();
            wrap.style.display = "none";
            block.style.gridTemplateColumns = "1fr";
        }
        // Stable per-recipe number = alphabetical position in search.json (which is alphabetical by basename)
        const idx = all.findIndex(r => r.htmlfile === pick.htmlfile) + 1;
        wrap.setAttribute("data-num", "No. " + String(idx).padStart(3, "0"));

        block.querySelector("h2").textContent = pick.title;

        const descrEl = block.querySelector(".descr");
        if (pick.description) {
            descrEl.textContent = pick.description;
        } else {
            descrEl.remove();
        }

        const meta = [];
        if (pick.size) meta.push(pick.size);
        if (pick.time) meta.push(pick.time);
        if (pick.category) {
            const cats = Array.isArray(pick.category) ? pick.category : [pick.category];
            meta.push(cats[0]);
        }
        const metaEl = block.querySelector(".featured-meta");
        if (meta.length) {
            metaEl.innerHTML = meta.map(m => `<span>${m}</span>`).join("");
        } else {
            metaEl.remove();
        }

        block.querySelector(".read-more").href = pick.htmlfile;
        block.removeAttribute("hidden");
    })
    .catch(e => {
        console.warn("featured: failed to load", e);
    });
