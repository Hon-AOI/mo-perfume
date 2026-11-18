const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  createVisitRouter,
  loadTelegramConfiguration,
  sendVisitAlert
} = require("../routes/visitRoutes");

async function withVisitServer(options, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/visits", createVisitRouter(options));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/visits`;
  try {
    await run(url, new URL(url).origin);
  } finally {
    await new Promise((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve()
    ));
  }
}

async function postVisit(url, origin, page = "/shop.html") {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin
    },
    body: JSON.stringify({ page })
  });
}

test("Telegram configuration requires both token and chat ID", () => {
  assert.deepEqual(loadTelegramConfiguration({
    TELEGRAM_BOT_TOKEN: " token ",
    TELEGRAM_CHAT_ID: " 12345 "
  }), {
    botToken: "token",
    chatId: "12345"
  });
  assert.equal(loadTelegramConfiguration({ TELEGRAM_BOT_TOKEN: "token" }), null);
});

test("visit alert sends only the page path and timestamp to Telegram", async () => {
  let request;
  await sendVisitAlert("/shop.html", {
    botToken: "bot-token",
    chatId: "12345"
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true }) };
  });

  assert.equal(request.url, "https://api.telegram.org/botbot-token/sendMessage");
  assert.equal(request.options.method, "POST");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.chat_id, "12345");
  assert.match(payload.text, /Page: \/shop\.html/);
  assert.match(payload.text, /Time: \d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(payload.text, /IP|email|address/i);
});

test("visit endpoint accepts same-origin storefront pages", async () => {
  let alert;
  await withVisitServer({
    getConfiguration: () => ({ botToken: "token", chatId: "12345" }),
    sendAlert: async (page, configuration) => {
      alert = { page, configuration };
    }
  }, async (url, origin) => {
    const response = await postVisit(url, origin);

    assert.equal(response.status, 204);
    assert.deepEqual(alert, {
      page: "/shop.html",
      configuration: { botToken: "token", chatId: "12345" }
    });
  });
});

test("visit endpoint rejects unknown pages and foreign origins", async () => {
  let alertCount = 0;
  await withVisitServer({
    getConfiguration: () => ({ botToken: "token", chatId: "12345" }),
    sendAlert: async () => { alertCount += 1; }
  }, async (url, origin) => {
    assert.equal((await postVisit(url, origin, "/private?email=user@example.com")).status, 400);
    assert.equal((await postVisit(url, "https://attacker.example")).status, 403);
    assert.equal(alertCount, 0);
  });
});

test("visit endpoint requires configuration and limits alert volume", async () => {
  let currentTime = 0;
  let alertCount = 0;
  await withVisitServer({
    getConfiguration: () => ({ botToken: "token", chatId: "12345" }),
    sendAlert: async () => { alertCount += 1; },
    now: () => currentTime,
    maxAlertsPerMinute: 1
  }, async (url, origin) => {
    const first = await postVisit(url, origin);
    const limited = await postVisit(url, origin);
    assert.equal(first.status, 204);
    assert.equal(limited.status, 429);

    currentTime = 60000;
    assert.equal((await postVisit(url, origin)).status, 204);
    assert.equal(alertCount, 2);
  });

  await withVisitServer({
    getConfiguration: () => null,
    sendAlert: async () => { throw new Error("Should not send without configuration"); }
  }, async (url, origin) => {
    assert.equal((await postVisit(url, origin)).status, 503);
  });
});
