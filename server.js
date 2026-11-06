const express = require("express");
const path = require("path");

const app = express();
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const port = 1969;

// Middleware
app.use(express.json());
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/public/images", express.static(path.join(__dirname, "public", "images")));
app.use("/images", express.static(path.join(__dirname, "public", "images")));

const storefrontPages = [
    "about.html",
    "cart.html",
    "contact.html",
    "men.html",
    "shop.html",
    "unisex.html",
    "women.html"
];
storefrontPages.forEach((page) => {
    app.get(`/${page}`, (_req, res) => {
        res.sendFile(path.join(__dirname, page));
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
    console.log(`MO perfume server running on port ${port}`);
});