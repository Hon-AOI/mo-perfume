const pageSize = 24;
const productsElement = document.getElementById("product-container");
const featuredElement = document.getElementById("featured-products");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const paginationElement = document.getElementById("pagination");
const resultCountElement = document.getElementById("result-count");
const bagItemsElement = document.getElementById("bag-items");
const bagEmptyElement = document.getElementById("bag-empty");
const clearBagButton = document.getElementById("clear-bag");
const checkoutForm = document.getElementById("checkout-form");
const checkoutSubmitButton = document.getElementById("checkout-submit");
const checkoutStatusElement = document.getElementById("checkout-status");
const toastElement = document.getElementById("site-toast");
let currentPage = 1;
let totalPages = 1;
let requestController;
let searchTimer;
let toastTimer;
let cachedCatalog;
let quoteController;
let currentQuote;

function readCart() {
    try {
        const storedCart = JSON.parse(localStorage.getItem("mo-perfume-cart") || "[]");
        return Array.isArray(storedCart)
            ? storedCart.filter((item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.name === "string" &&
                Number.isInteger(item.quantity) &&
                item.quantity > 0
            )
            : [];
    } catch (error) {
        console.warn("Could not read the saved cart:", error);
        return [];
    }
}

let cart = readCart();

function saveCart() {
    try {
        localStorage.setItem("mo-perfume-cart", JSON.stringify(cart));
    } catch (error) {
        console.error("Could not save the cart:", error);
    }
}

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function getProductId(product) {
    return String(product._id || product.id || `${product.brand}-${product.name}`);
}

function showToast(message) {
    if (!toastElement) return;
    toastElement.textContent = message;
    toastElement.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastElement.classList.remove("is-visible"), 2400);
}

function getCatalogErrorMessage(error) {
    if (error instanceof TypeError || window.location.protocol === "file:") {
        return "The fragrance catalog is unavailable. Start the site with `npm start`, then open http://localhost:1969/shop.html.";
    }
    return error.message;
}

function addProductToCart(product) {
    const id = getProductId(product);
    const existingItem = cart.find((item) => item.id === id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id,
            name: product.name || "Fragrance",
            brand: product.brand || "",
            quantity: 1
        });
    }

    saveCart();
    renderCart();
    showToast(`${product.name || "Fragrance"} added to your cart`);
}

function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";

    const imageStage = document.createElement("div");
    imageStage.className = "product-image";
    const image = document.createElement("img");
    const imageFallback = createTextElement("span", "image-fallback", "Image unavailable");
    image.alt = `${product.brand || ""} ${product.name || "Perfume"}`.trim();
    image.loading = "eager";
    image.decoding = "async";
    if (product.image) {
        image.src = `/images/${encodeURIComponent(product.image)}`;
        image.addEventListener("error", () => {
            image.hidden = true;
            imageFallback.style.display = "block";
        }, { once: true });
    } else {
        image.hidden = true;
        imageFallback.style.display = "block";
    }
    imageStage.append(image, imageFallback);
    imageStage.append(createTextElement("span", "product-badge", product.category || "Unisex"));

    const details = document.createElement("div");
    details.className = "product-details";
    details.append(
        createTextElement("p", "product-brand", product.brand || "MO Perfume"),
        createTextElement("h3", "product-name", product.name || "Untitled fragrance"),
        createTextElement("p", "product-category", [product.family, product.origin].filter(Boolean).join(" · ") || "A fragrance to make your own")
    );

    const addButton = createTextElement("button", "add-to-bag", "Add to cart");
    addButton.type = "button";
    addButton.setAttribute("aria-label", `Add ${product.name || "fragrance"} to cart`);
    addButton.addEventListener("click", () => addProductToCart(product));
    details.append(addButton);

    card.append(imageStage, details);
    return card;
}

function renderPagination() {
    if (!paginationElement) return;
    paginationElement.replaceChildren();
    if (totalPages <= 1) return;

    const addPageButton = (label, page, isCurrent = false) => {
        const button = createTextElement("button", "", label);
        button.type = "button";
        if (isCurrent) button.setAttribute("aria-current", "page");
        button.addEventListener("click", () => {
            currentPage = page;
            loadProducts();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        paginationElement.append(button);
    };

    if (currentPage > 1) addPageButton("Previous", currentPage - 1);
    const firstPage = Math.max(1, currentPage - 2);
    const lastPage = Math.min(totalPages, currentPage + 2);
    for (let page = firstPage; page <= lastPage; page += 1) {
        addPageButton(String(page), page, page === currentPage);
    }
    if (currentPage < totalPages) addPageButton("Next", currentPage + 1);
}

async function fetchProducts({ page = 1, limit = pageSize, search = "", category = "", signal } = {}) {
    const query = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        category
    });

    try {
        const response = await fetch(`/api/products?${query}`, { signal });
        if (!response.ok) {
            throw new Error(`The product service returned ${response.status}.`);
        }
        const products = await response.json();
        if (!Array.isArray(products)) throw new Error("The product service returned an invalid response.");
        return { products, total: Number(response.headers.get("X-Total-Count")) };
    } catch (error) {
        if (error.name === "AbortError") throw error;
        console.warn("The product API is unavailable; loading the bundled catalog instead.", error);
    }

    if (!cachedCatalog) {
        const csvUrl = new URL("data/perfumes.csv", document.baseURI);
        const response = await fetch(csvUrl, { signal });
        if (!response.ok) {
            throw new Error(`The bundled fragrance catalog could not be loaded (${response.status}).`);
        }
        cachedCatalog = parseCatalogCsv(await response.text());
    }

    const normalizedSearch = search.trim().toLocaleLowerCase();
    const normalizedCategory = category.trim().toLocaleLowerCase();
    const filtered = cachedCatalog.filter((product) => {
        const matchesSearch = !normalizedSearch || [
            product.name,
            product.brand,
            product.description,
            product.category,
            product.family,
            product.origin
        ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedSearch));
        const matchesCategory = !normalizedCategory || String(product.category || "").toLocaleLowerCase() === normalizedCategory;
        return matchesSearch && matchesCategory;
    });

    const start = (page - 1) * limit;
    return {
        products: filtered.slice(start, start + limit),
        total: filtered.length
    };
}

function parseCatalogCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "|" && !quoted) {
            row.push(field);
            field = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            row.push(field);
            if (row.some((value) => value.length > 0)) rows.push(row);
            row = [];
            field = "";
        } else {
            field += character;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length === 0) return [];

    const headers = rows.shift().map((header) => header.trim());
    return rows.map((values, index) => {
        const record = {};
        headers.forEach((header, headerIndex) => {
            record[header] = values[headerIndex] || "";
        });

        const gender = (record.gender || "").toLocaleLowerCase();
        return {
            id: String(index + 1),
            name: record.name_perfume || "",
            brand: record.brand || "",
            category: gender === "male" ? "Men" : gender === "female" ? "Women" : "Unisex",
            description: record.description || "",
            image: record.image_name || "",
            family: record.family || "",
            origin: record.origin || "",
            year: record.years || ""
        };
    });
}

async function loadProducts() {
    if (!productsElement) return;
    if (requestController) requestController.abort();
    requestController = new AbortController();
    const controller = requestController;
    productsElement.setAttribute("aria-busy", "true");
    productsElement.replaceChildren(createTextElement("p", "catalog-message", "Finding your next favourite..."));

    try {
        const { products, total } = await fetchProducts({
            page: currentPage,
            search: searchInput.value.trim(),
            category: categoryFilter.value,
            signal: controller.signal
        });

        totalPages = Number.isFinite(total) ? Math.max(1, Math.ceil(total / pageSize)) : 1;
        productsElement.replaceChildren();
        if (products.length === 0) {
            productsElement.append(createTextElement("p", "catalog-message", "No fragrances match your search. Try another name or collection."));
        } else {
            products.forEach((product) => productsElement.append(createProductCard(product)));
        }
        if (resultCountElement) {
            resultCountElement.textContent = `${Number.isFinite(total) ? total.toLocaleString() : products.length} fragrances`;
        }
        renderPagination();
    } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Could not load fragrances:", error);
        const message = getCatalogErrorMessage(error);
        productsElement.replaceChildren(createTextElement("p", "catalog-message", message));
        if (resultCountElement) resultCountElement.textContent = "Catalog unavailable";
        const retryButton = createTextElement("button", "add-to-bag", "Try again");
        retryButton.type = "button";
        retryButton.addEventListener("click", loadProducts);
        productsElement.append(retryButton);
        if (paginationElement) paginationElement.replaceChildren();
    } finally {
        if (requestController === controller) {
            productsElement.setAttribute("aria-busy", "false");
        }
    }
}

async function loadFeaturedProducts() {
    if (!featuredElement) return;
    try {
        const { products } = await fetchProducts({ limit: 4 });
        featuredElement.replaceChildren();
        if (products.length === 0) {
            featuredElement.append(createTextElement("p", "catalog-message", "Our collection is being refreshed. Please visit again soon."));
            return;
        }
        products.forEach((product) => featuredElement.append(createProductCard(product)));
        featuredElement.setAttribute("aria-busy", "false");
    } catch (error) {
        console.error("Could not load featured fragrances:", error);
        featuredElement.replaceChildren(createTextElement("p", "catalog-message", getCatalogErrorMessage(error)));
        featuredElement.setAttribute("aria-busy", "false");
    }
}

function renderCart() {
    const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll(".cart-count").forEach((countElement) => {
        countElement.textContent = String(itemCount);
    });

    if (!bagItemsElement) return;
    bagItemsElement.replaceChildren();
    if (bagEmptyElement) bagEmptyElement.hidden = cart.length > 0;
    if (clearBagButton) clearBagButton.hidden = cart.length === 0;

    cart.forEach((item) => {
        const listItem = document.createElement("li");
        listItem.className = "bag-item";
        const details = document.createElement("div");
        details.append(
            createTextElement("p", "bag-item-brand", item.brand || "MO Perfume"),
            createTextElement("p", "bag-item-name", item.name),
            createTextElement("p", "bag-item-quantity", `Quantity: ${item.quantity}`),
            createTextElement("p", "bag-item-price", "Checking price...")
        );
        listItem.dataset.productId = item.id;
        const removeButton = createTextElement("button", "remove-item", "Remove");
        removeButton.type = "button";
        removeButton.setAttribute("aria-label", `Remove ${item.name} from your cart`);
        removeButton.addEventListener("click", () => {
            cart = cart.filter((cartItem) => cartItem.id !== item.id);
            saveCart();
            renderCart();
        });
        listItem.append(details, removeButton);
        bagItemsElement.append(listItem);
    });
    loadCheckoutQuote();
}

function formatNaira(kobo) {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 2
    }).format(kobo / 100);
}

async function loadCheckoutQuote() {
    const subtotalElement = document.getElementById("cart-subtotal");
    const deliveryElement = document.getElementById("cart-delivery");
    const totalElement = document.getElementById("cart-total");
    if (!checkoutForm || !checkoutStatusElement) return;

    if (quoteController) quoteController.abort();
    quoteController = new AbortController();
    const controller = quoteController;
    currentQuote = null;
    checkoutSubmitButton.disabled = true;

    try {
        if (cart.length === 0) {
            subtotalElement.textContent = "—";
            deliveryElement.textContent = "—";
            totalElement.textContent = "—";
            const response = await fetch("/api/payments/status", { signal: controller.signal });
            const status = response.ok ? await response.json() : null;
            const requirements = status?.requirements || [];
            checkoutStatusElement.textContent = [
                "Add fragrances to your cart to see the total.",
                ...requirements
            ].join(" ");
            return;
        }

        checkoutStatusElement.textContent = "Calculating your order...";
        const response = await fetch("/api/payments/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: cart.map(({ id, quantity }) => ({ id, quantity }))
            }),
            signal: controller.signal
        });
        const quote = await response.json();
        if (!response.ok) throw new Error(quote.message || "Your cart total could not be calculated.");
        currentQuote = quote;

        subtotalElement.textContent = quote.subtotalKobo === null ? "Not set" : formatNaira(quote.subtotalKobo);
        deliveryElement.textContent = quote.deliveryKobo === null ? "Not set" : formatNaira(quote.deliveryKobo);
        totalElement.textContent = quote.totalKobo === null ? "—" : formatNaira(quote.totalKobo);

        quote.items.forEach((item) => {
            const row = bagItemsElement.querySelector(`[data-product-id="${CSS.escape(item.id)}"]`);
            const priceElement = row?.querySelector(".bag-item-price");
            if (priceElement) {
                priceElement.textContent = item.priceKobo === null
                    ? "Price to be set"
                    : `${formatNaira(item.priceKobo)} each`;
            }
        });

        checkoutStatusElement.textContent = quote.canPay
            ? "Your total is confirmed. Continue to Paystack to pay securely."
            : quote.messages.join(" ");
        checkoutSubmitButton.disabled = !quote.canPay;
    } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Could not prepare checkout:", error);
        checkoutStatusElement.textContent = error.message;
    } finally {
        if (quoteController === controller) quoteController = null;
    }
}

if (searchInput && categoryFilter) {
    const initialCategory = new URLSearchParams(window.location.search).get("category");
    if (["Men", "Women", "Unisex"].includes(initialCategory)) {
        categoryFilter.value = initialCategory;
    }
    searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
            currentPage = 1;
            loadProducts();
        }, 200);
    });
    categoryFilter.addEventListener("change", () => {
        currentPage = 1;
        loadProducts();
    });
}

if (clearBagButton) {
    clearBagButton.addEventListener("click", () => {
        cart = [];
        saveCart();
        renderCart();
    });
}

if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!currentQuote?.canPay || cart.length === 0) return;

        const formData = new FormData(checkoutForm);
        const customer = Object.fromEntries(formData.entries());
        checkoutSubmitButton.disabled = true;
        checkoutStatusElement.textContent = "Connecting to secure payment...";

        try {
            const response = await fetch("/api/payments/initialize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: cart.map(({ id, quantity }) => ({ id, quantity })),
                    customer
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Could not start payment.");
            window.location.assign(result.authorizationUrl);
        } catch (error) {
            console.error("Could not start checkout:", error);
            checkoutStatusElement.textContent = error.message;
            checkoutSubmitButton.disabled = !currentQuote?.canPay;
        }
    });
}

const newsletterForm = document.getElementById("newsletter-form");
if (newsletterForm) {
    newsletterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        document.getElementById("newsletter-status").textContent =
            "Thanks for your interest. Newsletter sign-up is not connected yet.";
        newsletterForm.reset();
    });
}

renderCart();
loadProducts();
loadFeaturedProducts();
