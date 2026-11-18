const express = require("express");
const fs = require("fs");
const path = require("path");

function loadEnvironmentFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const match = /^\s*([^#=\s]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!match || process.env[match[1]] !== undefined) continue;

        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
    }
}

loadEnvironmentFile(path.join(__dirname, ".env"));

const app = express();
const productRoutes = require("./routes/productRoutes");
const { createOrderRouter } = require("./routes/orderRoutes");
const { createNewsletterRouter } = require("./routes/newsletterRoutes");
const { createVisitRouter } = require("./routes/visitRoutes");
const port = Number(process.env.PORT) || 1969;

// Middleware
app.use(express.json());
app.use("/api/products", productRoutes);
app.use("/api/orders", createOrderRouter());
app.use("/api/newsletter", createNewsletterRouter());
app.use("/api/visits", createVisitRouter());
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/public/images", express.static(path.join(__dirname, "public", "images")));
app.use("/images", express.static(path.join(__dirname, "public", "images")));

const storefrontPages = [
    "index.html",
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