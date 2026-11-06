const express = require("express");
const { getCatalog } = require("../data/catalog");

const router = express.Router();

router.get("/", (req, res) => {
    const catalog = getCatalog();
    const search = (req.query.search || "").toString().trim().toLowerCase();
    const category = (req.query.category || "").toString().trim().toLowerCase();
    const rawPage = Number.parseInt(req.query.page || "1", 10);
    const rawLimit = Number.parseInt(req.query.limit || "24", 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 24;

    let products = catalog.filter((product) => {
        const matchesSearch = !search || [
            product.name,
            product.brand,
            product.description,
            product.category,
            product.family,
            product.origin
        ].some((value) => String(value || "").toLowerCase().includes(search));

        const matchesCategory = !category || category === "all" || String(product.category || "").toLowerCase() === category;
        return matchesSearch && matchesCategory;
    });

    res.set("X-Total-Count", String(products.length));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    res.json(products.slice(startIndex, endIndex));
});

module.exports = router;
