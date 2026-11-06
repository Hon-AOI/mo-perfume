const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const resultCount = document.getElementById("resultCount");
const loadMore = document.getElementById("loadMore");

let page = 1;
const limit = 24;
let search = "";
let category = "";
let totalLoaded = 0;
let loading = false;

async function loadPerfumes(reset = false) {
    if (loading) return;

    if (reset) {
        page = 1;
        totalLoaded = 0;
        productGrid.innerHTML = "";
    }

    loading = true;
    loadMore.disabled = true;
    loadMore.textContent = "Loading...";

    try {
        const params = new URLSearchParams({
            page,
            limit,
            search,
            category
        });

        const response = await fetch(`/api/products?${params}`);

        if (!response.ok) {
            throw new Error("Could not load perfumes");
        }

        const perfumes = await response.json();

        const total = Number(response.headers.get("X-Total-Count")) || 0;

        perfumes.forEach((perfume) => {
            const card = document.createElement("article");
            card.className = "product-card";

            const image = document.createElement("img");

            image.src = perfume.image
                ? `/images/${encodeURIComponent(perfume.image)}`
                : "/images/00ijl17uq8jditypgnzv0yd0c962xd4tcia2hczrypw3w436v1wh8666goon-w500-q85.jpg";

            image.alt = perfume.name || "MO Perfume";
            image.loading = "eager";

            image.onerror = () => {
                image.onerror = null;
                image.src = "/images/00ijl17uq8jditypgnzv0yd0c962xd4tcia2hczrypw3w436v1wh8666goon-w500-q85.jpg";
            };

            const name = document.createElement("h3");
            name.textContent = perfume.name || "Unnamed Perfume";

            const brand = document.createElement("p");
            brand.textContent = perfume.brand || "MO PERFUME";

            const family = document.createElement("p");
            family.textContent =
                `${perfume.category || "Unisex"} · ${perfume.family || "Fragrance"}`;

            card.append(image, name, brand, family);
            productGrid.appendChild(card);
        });

        totalLoaded += perfumes.length;

        resultCount.textContent =
            `Showing ${totalLoaded} of ${total} perfumes`;

        loadMore.style.display =
            totalLoaded < total ? "block" : "none";

    } catch (error) {
        console.error(error);
        resultCount.textContent =
            "Unable to load perfumes. Check your server and API route.";
    } finally {
        loading = false;
        loadMore.disabled = false;
        loadMore.textContent = "Load More";
    }
}

searchInput.addEventListener("input", () => {
    search = searchInput.value.trim();
    loadPerfumes(true);
});

categoryFilter.addEventListener("change", () => {
    category = categoryFilter.value;
    loadPerfumes(true);
});

loadMore.addEventListener("click", () => {
    page++;
    loadPerfumes();
});

loadPerfumes();