const crypto = require("crypto");
const express = require("express");
const { getCatalog } = require("../data/catalog");

const router = express.Router();
const nairaPattern = /^\d+(?:\.\d{1,2})?$/;

function getPaymentConfiguration() {
    const secret = (process.env.PAYSTACK_SECRET_KEY || "").trim();
    const callback = (process.env.PAYSTACK_CALLBACK_URL || "").trim();
    const rawDeliveryFee = (process.env.DELIVERY_FEE_NGN || "").trim();
    const deliveryFeeKobo = nairaPattern.test(rawDeliveryFee)
        ? Math.round(Number(rawDeliveryFee) * 100)
        : null;
    const requirements = [];

    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secret)) {
        requirements.push("Set PAYSTACK_SECRET_KEY on the server.");
    }

    try {
        const callbackUrl = new URL(callback);
        const isLocalHttp = callbackUrl.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(callbackUrl.hostname);
        if (callbackUrl.protocol !== "https:" && !isLocalHttp) {
            requirements.push("Set PAYSTACK_CALLBACK_URL to your HTTPS payment-return page.");
        }
    } catch {
        requirements.push("Set PAYSTACK_CALLBACK_URL to your payment-return page.");
    }

    if (deliveryFeeKobo === null || !Number.isSafeInteger(deliveryFeeKobo)) {
        requirements.push("Set DELIVERY_FEE_NGN to the delivery fee in naira (use 0 for free delivery).");
    }

    return {
        secret,
        callback,
        deliveryFeeKobo,
        requirements
    };
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
        quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
        if (quantities.get(item.id) > 10) {
            throw new Error("A product quantity cannot exceed 10.");
        }
    }
    return quantities;
}

function createQuote(input) {
    const quantities = normalizeItems(input);
    const catalogById = new Map(getCatalog().map((product) => [product.id, product]));
    const items = [];
    const missingPrices = [];
    let subtotalKobo = 0;

    for (const [id, quantity] of quantities) {
        const product = catalogById.get(id);
        if (!product) throw new Error("A product in your cart is no longer available. Please refresh your cart.");

        const priceKobo = Number.isFinite(product.priceNGN)
            ? Math.round(product.priceNGN * 100)
            : null;
        if (!Number.isSafeInteger(priceKobo) || priceKobo <= 0) {
            missingPrices.push(product.name);
        } else {
            subtotalKobo += priceKobo * quantity;
        }
        items.push({
            id: product.id,
            name: product.name,
            brand: product.brand,
            quantity,
            priceKobo
        });
    }

    if (!Number.isSafeInteger(subtotalKobo)) {
        throw new Error("The cart total is too large to process.");
    }

    const configuration = getPaymentConfiguration();
    const ready = missingPrices.length === 0 && configuration.requirements.length === 0;
    const deliveryKobo = configuration.deliveryFeeKobo;
    const totalKobo = ready ? subtotalKobo + deliveryKobo : null;
    if (totalKobo !== null && !Number.isSafeInteger(totalKobo)) {
        throw new Error("The cart total is too large to process.");
    }

    const messages = [...configuration.requirements];
    if (missingPrices.length > 0) {
        messages.unshift(`Add a price_ngn value to the catalog for: ${missingPrices.slice(0, 3).join(", ")}${missingPrices.length > 3 ? ", and other selected fragrances" : ""}.`);
    }

    return {
        items,
        currency: "NGN",
        subtotalKobo: missingPrices.length === 0 ? subtotalKobo : null,
        deliveryKobo,
        totalKobo,
        canPay: ready,
        messages
    };
}

function createPaymentReference(amountKobo, secret) {
    const payload = Buffer.from(`${amountKobo}:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`)
        .toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return `MO.${payload}.${signature}`;
}

function readPaymentReference(reference, secret) {
    const match = /^MO\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(reference || "");
    if (!match) return null;

    const [, payload, signature] = match;
    const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
    let suppliedSignature;
    try {
        suppliedSignature = Buffer.from(signature, "base64url");
    } catch {
        return null;
    }
    if (suppliedSignature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(suppliedSignature, expectedSignature)) {
        return null;
    }

    try {
        const [rawAmount, rawTimestamp] = Buffer.from(payload, "base64url").toString().split(":");
        const amountKobo = Number(rawAmount);
        const timestamp = Number(rawTimestamp);
        if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0 ||
            !Number.isSafeInteger(timestamp) || Date.now() - timestamp > 48 * 60 * 60 * 1000 ||
            timestamp > Date.now() + 60 * 1000) {
            return null;
        }
        return amountKobo;
    } catch {
        return null;
    }
}

router.get("/status", (_req, res) => {
    const configuration = getPaymentConfiguration();
    res.json({
        provider: "Paystack",
        currency: "NGN",
        configured: configuration.requirements.length === 0,
        requirements: configuration.requirements
    });
});

router.post("/quote", (req, res) => {
    try {
        res.json(createQuote(req.body.items));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.post("/initialize", async (req, res) => {
    const configuration = getPaymentConfiguration();
    let quote;
    try {
        quote = createQuote(req.body.items);
    } catch (error) {
        res.status(400).json({ message: error.message });
        return;
    }

    if (!quote.canPay) {
        res.status(409).json({
            message: quote.messages.join(" "),
            requirements: quote.messages
        });
        return;
    }

    const customer = req.body.customer;
    if (!customer || typeof customer !== "object" ||
        typeof customer.fullName !== "string" || customer.fullName.trim().length < 2 ||
        typeof customer.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()) ||
        typeof customer.phone !== "string" || customer.phone.trim().length < 7 ||
        typeof customer.address !== "string" || customer.address.trim().length < 5 ||
        typeof customer.city !== "string" || customer.city.trim().length < 2 ||
        typeof customer.state !== "string" || customer.state.trim().length < 2) {
        res.status(400).json({ message: "Enter a valid name, email, phone number, street address, city, and state." });
        return;
    }

    const secret = configuration.secret;
    const reference = createPaymentReference(quote.totalKobo, secret);
    const requestBody = {
        email: customer.email.trim(),
        amount: quote.totalKobo,
        currency: "NGN",
        reference,
        callback_url: configuration.callback,
        metadata: {
            order_type: "MO Perfume order",
            delivery_fee_kobo: quote.deliveryKobo,
            products: quote.items.map(({ id, name, quantity, priceKobo }) => ({
                product_id: id,
                name,
                quantity,
                price_kobo: priceKobo
            })),
            delivery_address: {
                full_name: customer.fullName.trim(),
                phone: customer.phone.trim(),
                address: customer.address.trim(),
                city: customer.city.trim(),
                state: customer.state.trim()
            }
        }
    };

    try {
        const response = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${secret}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(15000)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.status || !result.data?.authorization_url ||
            result.data.reference !== reference) {
            console.error("Paystack could not initialize the transaction:", result?.message || response.status);
            res.status(502).json({ message: "Payment could not be started. Please try again or contact us." });
            return;
        }
        res.json({
            authorizationUrl: result.data.authorization_url,
            reference: result.data.reference
        });
    } catch (error) {
        console.error("Paystack initialization failed:", error.message);
        res.status(502).json({ message: "Payment service is unavailable. Please try again shortly." });
    }
});

router.get("/verify", async (req, res) => {
    const secret = getPaymentConfiguration().secret;
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secret)) {
        res.status(503).json({ message: "Payment verification is not configured." });
        return;
    }

    const reference = typeof req.query.reference === "string" ? req.query.reference : "";
    const expectedAmount = readPaymentReference(reference, secret);
    if (expectedAmount === null) {
        res.status(400).json({ message: "The payment reference is invalid or has expired." });
        return;
    }

    try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(15000)
        });
        const result = await response.json().catch(() => null);
        const transaction = result?.data;
        if (!response.ok || !result?.status || !transaction ||
            transaction.reference !== reference ||
            transaction.status !== "success" ||
            transaction.currency !== "NGN" ||
            transaction.amount !== expectedAmount) {
            res.status(402).json({ message: "Payment has not been confirmed. If you were charged, contact us with your payment reference." });
            return;
        }
        res.json({
            paid: true,
            reference,
            amountKobo: transaction.amount,
            currency: transaction.currency
        });
    } catch (error) {
        console.error("Paystack verification failed:", error.message);
        res.status(502).json({ message: "Payment verification is temporarily unavailable. Please refresh this page to try again." });
    }
});

module.exports = {
    router,
    createQuote,
    createPaymentReference,
    readPaymentReference
};
