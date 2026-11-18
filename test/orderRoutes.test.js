const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { getCatalog } = require("../data/catalog");
const {
  createOrderRouter,
  createOrder,
  formatOrderEmailHtml,
  loadEmailConfiguration,
  ORDER_EMAIL_TO
} = require("../routes/orderRoutes");

const customer = {
  fullName: "A Customer",
  email: "customer@example.com",
  phone: "+2348012345678",
  address: "12 Example Street",
  city: "Lagos",
  state: "Lagos"
};

async function withOrderServer(options, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/orders", createOrderRouter(options));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/orders`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve()
    ));
  }
}

test("SMTP configuration is read from complete environment settings", () => {
  const configuration = loadEmailConfiguration({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "orders@example.com",
    SMTP_PASSWORD: "test-password",
    SMTP_FROM: "MO Perfume <orders@example.com>"
  });

  assert.deepEqual(configuration, {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    user: "orders@example.com",
    password: "test-password",
    from: "MO Perfume <orders@example.com>"
  });
  assert.equal(loadEmailConfiguration({ SMTP_HOST: "smtp.example.com" }), null);
});

test("designed order email escapes customer HTML", () => {
  const order = createOrder({
    fullName: "<script>Test</script>",
    email: "customer@example.com",
    phone: "+2348012345678",
    address: "12 <Example> Street",
    city: "Lagos",
    state: "Lagos"
  }, [{ id: getCatalog()[0].id, quantity: 1 }]);

  const html = formatOrderEmailHtml(order);

  assert.match(html, /&lt;script&gt;Test&lt;\/script&gt;/);
  assert.match(html, /&lt;Example&gt;/);
  assert.doesNotMatch(html, /<script>Test<\/script>/);
});

test("valid order requests are emailed with catalog product details", async () => {
  const product = getCatalog()[0];
  let deliveredOrder;
  await withOrderServer({
    getEmailConfiguration: () => ({ host: "smtp.example.com" }),
    sendEmail: async (order, configuration) => {
      deliveredOrder = { order, configuration };
    }
  }, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: product.id, quantity: 2 }],
        customer
      })
    });
    const result = await response.json();

    assert.equal(response.status, 201);
    assert.match(result.orderId, /^MO-/);
  });

  assert.equal(ORDER_EMAIL_TO, "buksthegreatt@gmail.com");
  assert.equal(deliveredOrder.order.items[0].name, product.name);
  assert.equal(deliveredOrder.order.items[0].quantity, 2);
  assert.equal(deliveredOrder.order.customer.email, customer.email);
});

test("invalid products and customer details are rejected without sending email", async () => {
  let sendCount = 0;
  await withOrderServer({
    getEmailConfiguration: () => ({ host: "smtp.example.com" }),
    sendEmail: async () => { sendCount += 1; }
  }, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: "unknown-product", quantity: 1 }],
        customer
      })
    });
    assert.equal(response.status, 400);

    const invalidCustomerResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: getCatalog()[0].id, quantity: 1 }],
        customer: { ...customer, email: "not-an-email" }
      })
    });
    assert.equal(invalidCustomerResponse.status, 400);
  });
  assert.equal(sendCount, 0);
});

test("missing email setup and mail delivery failures are reported", async () => {
  await withOrderServer({
    getEmailConfiguration: () => null
  }, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: getCatalog()[0].id, quantity: 1 }],
        customer
      })
    });
    assert.equal(response.status, 503);
  });

  await withOrderServer({
    getEmailConfiguration: () => ({ host: "smtp.example.com" }),
    sendEmail: async () => { throw new Error("SMTP unavailable"); }
  }, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: getCatalog()[0].id, quantity: 1 }],
        customer
      })
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.match(result.message, /could not send your order/);
  });
});
