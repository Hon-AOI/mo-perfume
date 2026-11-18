const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const { getCatalog } = require("../data/catalog");

const ORDER_EMAIL_TO = "buksthegreatt@gmail.com";

function loadEmailConfiguration(environment = process.env) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = environment;
    let fileConfig = {};
    try {
        fileConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "order-email.json"), "utf8"));
    } catch (_error) {
        fileConfig = {};
    }

    const host = typeof SMTP_HOST === "string" ? SMTP_HOST : fileConfig.host;
    const portValue = SMTP_PORT !== undefined ? SMTP_PORT : fileConfig.port;
    const secureValue = SMTP_SECURE !== undefined ? SMTP_SECURE : fileConfig.secure;
    const user = typeof SMTP_USER === "string" ? SMTP_USER : fileConfig.user;
    const password = typeof SMTP_PASSWORD === "string" ? SMTP_PASSWORD : fileConfig.password;
    const from = typeof SMTP_FROM === "string" ? SMTP_FROM : fileConfig.from;
    const port = Number(portValue);

    if (typeof host !== "string" || !host.trim() ||
        !Number.isInteger(port) || port < 1 || port > 65535 ||
        (secureValue !== true && secureValue !== false &&
            secureValue !== "true" && secureValue !== "false") ||
        typeof user !== "string" || !user.trim() ||
        typeof password !== "string" || !password ||
        typeof from !== "string" || !from.trim()) {
        return null;
    }

    return {
        host: host.trim(),
        port,
        secure: secureValue === true || secureValue === "true",
        user: user.trim(),
        password,
        from: from.trim()
    };
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

function escapeEmailHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatOrderEmailHtml(order) {
    const customer = order.customer;
    const itemRows = order.items.map((item) => `
        <tr>
          <td style="padding:14px 12px;border-bottom:1px solid #e8e0d3;">
            <strong style="color:#302d28;">${escapeEmailHtml(item.name)}</strong><br>
            <span style="font-family:Arial,sans-serif;font-size:12px;color:#817967;">${escapeEmailHtml(item.brand || "MO Perfume")}</span>
          </td>
          <td align="center" style="padding:14px 12px;border-bottom:1px solid #e8e0d3;font-family:Arial,sans-serif;font-size:14px;">${escapeEmailHtml(item.quantity)}</td>
        </tr>`).join("");

    const detailRows = [
        ["Name", customer.fullName],
        ["Email", customer.email],
        ["Phone", customer.phone],
        ["Address", `${customer.address}, ${customer.city}, ${customer.state}`]
    ].map(([label, value]) => `
        <tr>
          <td width="90" valign="top" style="padding:6px 12px 6px 0;font-family:Arial,sans-serif;font-size:12px;color:#817967;">${label}</td>
          <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#302d28;">${escapeEmailHtml(value)}</td>
        </tr>`).join("");

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>New MO Perfume order request</title>
  </head>
  <body style="margin:0;padding:0;background:#f4efe7;font-family:Georgia,'Times New Roman',serif;color:#302d28;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe7;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fffdf9;border:1px solid #ddd3c4;">
            <tr>
              <td align="center" style="padding:28px 24px;border-bottom:1px solid #e8e0d3;">
                <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:5px;color:#786d5d;">MO PERFUME</div>
              </td>
            </tr>
            <tr>
              <td style="padding:38px 44px 30px;">
                <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8467;">New order request</div>
                <h1 style="margin:12px 0 6px;font-size:34px;line-height:1.2;font-weight:normal;">${escapeEmailHtml(order.orderId)}</h1>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#817967;">Received ${escapeEmailHtml(order.createdAt)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 44px 32px;">
                <h2 style="margin:0 0 12px;font-size:19px;font-weight:normal;">Selected fragrances</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e8e0d3;">${itemRows}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 44px 34px;border-top:1px solid #e8e0d3;">
                <h2 style="margin:0 0 12px;font-size:19px;font-weight:normal;">Customer details</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${detailRows}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 44px;background:#eee7dc;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#716958;">
                This is an order request. Confirm availability, delivery, and payment directly with the customer.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
        text: formatOrderEmail(order),
        html: formatOrderEmailHtml(order)
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
    formatOrderEmailHtml,
    loadEmailConfiguration,
    ORDER_EMAIL_TO
};
