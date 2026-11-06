const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const { getCatalog } = require("../data/catalog");

const ORDER_EMAIL_TO = "bukunmiisaac1969@gmail.com";
const EMAIL_CONFIG_PATH = path.join(__dirname, "..", "config", "order-email.json");

function loadEmailConfiguration() {
    try {
        const configuration = JSON.parse(fs.readFileSync(EMAIL_CONFIG_PATH, "utf8"));
        if (typeof configuration.host !== "string" || !configuration.host.trim() ||
            !Number.isInteger(configuration.port) || configuration.port < 1 || configuration.port > 65535 ||
            typeof configuration.secure !== "boolean" ||
            typeof configuration.user !== "string" || !configuration.user.trim() ||
            typeof configuration.password !== "string" || !configuration.password ||
            typeof configuration.from !== "string" || !configuration.from.trim()) {
            return null;
        }
        return configuration;
    } catch (error) {
        if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
        throw error;
    }
}

function normalizeCustomer(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Enter your delivery details to place the order.");
    }

    const customer = {};
    for (const [field, minimum, maximum] of [
        ["fullName", 2, 100],
        ["email", 3, 254],
        ["phone", 7, 30],
        ["address", 5, 200],
        ["city", 2, 100],
        ["state", 2, 100]
    ]) {
        const value = input[field];
        if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) {
            throw new Error("Enter a valid name, email, phone number, street address, city, and state.");
        }
        customer[field] = value.trim();
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
        throw new Error("Enter a valid email address.");
    }
    return customer;
}

function normalizeItems(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 30) {
        throw new Error("Your cart must contain between 1 and 30 different products.");
    }

    const quantities = new Map();
    for (const item of input) {
        if (!item || typeof item.id !== "string" ||
            !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
            throw new Error("Each cart item needs a valid product and a quantity from 1 to 10.");
        }
        const quantity = (quantities.get(item.id) || 0) + item.quantity;
        if (quantity > 10) throw new Error("A product quantity cannot exceed 10.");
        quantities.set(item.id, quantity);
    }

    const catalogById = new Map(getCatalog().map((product) => [product.id, product]));
    return [...quantities].map(([id, quantity]) => {
        const product = catalogById.get(id);
        if (!product) {
            throw new Error("A product in your cart is no longer available. Please refresh your cart.");
        }
        return {
            id: product.id,
            name: product.name,
            brand: product.brand,
            quantity
        };
    });
}

function createOrder(customerInput, itemsInput) {
    return {
        orderId: `MO-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        createdAt: new Date().toISOString(),
        customer: normalizeCustomer(customerInput),
        items: normalizeItems(itemsInput)
    };
}

function formatOrderEmail(order) {
    const itemLines = order.items.map((item) =>
        `- ${item.name} (${item.brand || "MO Perfume"}) x ${item.quantity}`
    );
    const customer = order.customer;
    return [
        `Order request: ${order.orderId}`,
        `Received: ${order.createdAt}`,
        "",
        "Products:",
        ...itemLines,
        "",
        "Customer:",
        `Name: ${customer.fullName}`,
        `Email: ${customer.email}`,
        `Phone: ${customer.phone}`,
        `Address: ${customer.address}`,
        `City: ${customer.city}`,
        `State: ${customer.state}`,
        "",
        "This is an order request. Confirm availability, delivery, and payment directly with the customer."
    ].join("\n");
}

async function sendOrderEmail(order, configuration) {
    const transporter = nodemailer.createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        auth: {
            user: configuration.user,
            pass: configuration.password
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });

    await transporter.sendMail({
        from: configuration.from,
        to: ORDER_EMAIL_TO,
        replyTo: order.customer.email,
        subject: `New MO Perfume order request ${order.orderId}`,
        text: formatOrderEmail(order)
    });
}

function createOrderRouter({
    getEmailConfiguration = loadEmailConfiguration,
    sendEmail = sendOrderEmail
} = {}) {
    const router = express.Router();

    router.get("/status", (_req, res) => {
        res.json({ configured: Boolean(getEmailConfiguration()) });
    });

    router.post("/", async (req, res) => {
        let order;
        try {
            const body = req.body || {};
            order = createOrder(body.customer, body.items);
        } catch (error) {
            res.status(400).json({ message: error.message });
            return;
        }

        const configuration = getEmailConfiguration();
        if (!configuration) {
            res.status(503).json({
                message: "Order email is not configured yet. Please contact us directly while we set it up."
            });
            return;
        }

        try {
            await sendEmail(order, configuration);
            res.status(201).json({ orderId: order.orderId });
        } catch (error) {
            console.error("Order email delivery failed:", error.message);
            res.status(502).json({
                message: "We could not send your order just now. Your cart is unchanged; please try again or contact us."
            });
        }
    });

    return router;
}

module.exports = {
    createOrderRouter,
    createOrder,
    formatOrderEmail,
    loadEmailConfiguration,
    ORDER_EMAIL_TO
};
