const express = require("express");

const allowedPages = new Set([
    "/",
    "/index.html",
    "/about.html",
    "/cart.html",
    "/contact.html",
    "/men.html",
    "/shop.html",
    "/unisex.html",
    "/women.html"
]);
const alertWindowMs = 60 * 1000;

function loadTelegramConfiguration(environment = process.env) {
    const botToken = environment.TELEGRAM_BOT_TOKEN;
    const chatId = environment.TELEGRAM_CHAT_ID;
    if (typeof botToken !== "string" || !botToken.trim() ||
        typeof chatId !== "string" || !chatId.trim()) {
        return null;
    }

    return { botToken: botToken.trim(), chatId: chatId.trim() };
}

async function sendVisitAlert(page, configuration, fetchImplementation = fetch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetchImplementation(
            `https://api.telegram.org/bot${configuration.botToken}/sendMessage`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: configuration.chatId,
                    text: `New MO Perfume visit\nPage: ${page}\nTime: ${new Date().toISOString()}`
                }),
                signal: controller.signal
            }
        );
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Telegram API request failed with status ${response.status}.`);
    }

    const result = await response.json();
    if (!result || result.ok !== true) {
        throw new Error("Telegram returned an unsuccessful visitor alert response.");
    }
}

function createVisitRouter({
    getConfiguration = loadTelegramConfiguration,
    sendAlert = sendVisitAlert,
    now = Date.now,
    maxAlertsPerMinute = 60
} = {}) {
    const router = express.Router();
    let windowStartedAt = now();
    let alertCount = 0;

    router.post("/", async (req, res) => {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            typeof body.page !== "string" || !allowedPages.has(body.page)) {
            res.status(400).json({ message: "Invalid page visit." });
            return;
        }

        const origin = req.get("origin");
        try {
            if (!origin || new URL(origin).host !== req.get("host")) {
                res.status(403).json({ message: "Visitor alerts must come from this site." });
                return;
            }
        } catch (_error) {
            res.status(403).json({ message: "Visitor alerts must come from this site." });
            return;
        }

        const configuration = getConfiguration();
        if (!configuration) {
            res.status(503).json({ message: "Visitor alerts are not configured." });
            return;
        }

        const currentTime = now();
        if (currentTime - windowStartedAt >= alertWindowMs) {
            windowStartedAt = currentTime;
            alertCount = 0;
        }
        if (alertCount >= maxAlertsPerMinute) {
            res.status(429).json({ message: "Visitor alert limit reached. Try again later." });
            return;
        }
        alertCount += 1;

        try {
            await sendAlert(body.page, configuration);
            res.sendStatus(204);
        } catch (error) {
            console.error("Could not send visitor alert:", error.message);
            res.status(502).json({ message: "Visitor alert could not be sent." });
        }
    });

    return router;
}

module.exports = {
    createVisitRouter,
    loadTelegramConfiguration,
    sendVisitAlert
};
