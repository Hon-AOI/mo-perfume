const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const {
  createNewsletterRouter,
  loadMailchimpConfiguration,
  subscribeToMailchimp
} = require("../routes/newsletterRoutes");

async function withNewsletterServer(options, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/newsletter", createNewsletterRouter(options));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/newsletter`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve()
    ));
  }
}

test("Mailchimp configuration requires an API key, audience, and valid server prefix", () => {
  assert.deepEqual(loadMailchimpConfiguration({
    MAILCHIMP_API_KEY: "test-key",
    MAILCHIMP_AUDIENCE_ID: "audience-id",
    MAILCHIMP_SERVER_PREFIX: "US17"
  }), {
    apiKey: "test-key",
    audienceId: "audience-id",
    serverPrefix: "us17"
  });
  assert.equal(loadMailchimpConfiguration({
    MAILCHIMP_API_KEY: "test-key",
    MAILCHIMP_AUDIENCE_ID: "audience-id",
    MAILCHIMP_SERVER_PREFIX: "us17.example.com"
  }), null);
});

test("Mailchimp subscription uses a hashed member URL and double opt-in", async () => {
  let request;
  const member = await subscribeToMailchimp("person@example.com", {
    apiKey: "test-key",
    audienceId: "audience-id",
    serverPrefix: "us17"
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: "pending" }) };
  });

  const hash = crypto.createHash("md5").update("person@example.com").digest("hex");
  assert.match(request.url, new RegExp(`/members/${hash}$`));
  assert.equal(request.options.method, "PUT");
  assert.deepEqual(JSON.parse(request.options.body), {
    email_address: "person@example.com",
    status_if_new: "pending"
  });
  assert.equal(member.status, "pending");
});

test("newsletter sign-up requires consent and sends a welcome email after Mailchimp accepts", async () => {
  let subscribedEmail;
  let welcomedEmail;
  await withNewsletterServer({
    getMailchimpConfiguration: () => ({ apiKey: "test", audienceId: "audience", serverPrefix: "us17" }),
    getEmailConfiguration: () => ({ host: "smtp.example.com" }),
    subscribe: async (email) => {
      subscribedEmail = email;
      return { status: "pending" };
    },
    sendWelcomeEmail: async (email) => { welcomedEmail = email; }
  }, async (url) => {
    const invalidResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "person@example.com", consent: false })
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal(subscribedEmail, undefined);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: " Person@Example.com ", consent: true })
    });
    const result = await response.json();

    assert.equal(response.status, 201);
    assert.equal(result.welcomeEmailSent, true);
    assert.equal(subscribedEmail, "person@example.com");
    assert.equal(welcomedEmail, "person@example.com");
  });
});

test("newsletter sign-up remains pending when the welcome email cannot be sent", async () => {
  await withNewsletterServer({
    getMailchimpConfiguration: () => ({ apiKey: "test", audienceId: "audience", serverPrefix: "us17" }),
    getEmailConfiguration: () => ({ host: "smtp.example.com" }),
    subscribe: async () => ({ status: "pending" }),
    sendWelcomeEmail: async () => { throw new Error("SMTP unavailable"); }
  }, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "person@example.com", consent: true })
    });
    const result = await response.json();

    assert.equal(response.status, 201);
    assert.equal(result.welcomeEmailSent, false);
    assert.match(result.message, /Mailchimp's confirmation email/);
  });
});

test("newsletter sign-up works with local fallback when Mailchimp is not configured", async () => {
  await withNewsletterServer({
    getMailchimpConfiguration: () => null,
    getEmailConfiguration: () => null
  }, async (url) => {
    const email = `fallback-${Date.now()}@example.com`;
    const firstResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, consent: true })
    });
    const firstResult = await firstResponse.json();

    assert.equal(firstResponse.status, 201);
    assert.match(firstResult.message, /subscribed to Notes from MO/);

    const secondResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, consent: true })
    });
    assert.equal(secondResponse.status, 200);
  });
});
