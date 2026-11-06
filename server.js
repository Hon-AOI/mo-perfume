const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const productRoutes = require("./routes/productRoutes");
const { router: paymentRoutes } = require("./routes/paymentRoutes");
const port = process.env.PORT || 1969;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/products", productRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/public/images", express.static(path.join(__dirname, "public", "images")));
app.use("/images", express.static(path.join(__dirname, "public", "images")));

const storefrontPages = [
    "about.html",
    "cart.html",
    "contact.html",
    "men.html",
    "payment-return.html",
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

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log("MongoDB connected successfully!"))
        .catch((error) => {
            console.error("MongoDB connection error; using the bundled catalog:", error.message);
        });
} else {
    console.warn("MONGO_URI is not set; using the bundled catalog.");
}