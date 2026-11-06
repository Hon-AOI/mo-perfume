const test = require("node:test");
const assert = require("node:assert/strict");
const { getCatalog } = require("../data/catalog");
const {
  createQuote,
  createPaymentReference,
  readPaymentReference
} = require("../routes/paymentRoutes");

test("checkout cannot charge a fragrance without a catalog price", () => {
  const product = getCatalog()[0];
  const previousPrice = product.priceNGN;
  const previousEnvironment = {
    secret: process.env.PAYSTACK_SECRET_KEY,
    callback: process.env.PAYSTACK_CALLBACK_URL,
    delivery: process.env.DELIVERY_FEE_NGN
  };

  try {
    product.priceNGN = null;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example123";
    process.env.PAYSTACK_CALLBACK_URL = "http://localhost:1969/payment-return.html";
    process.env.DELIVERY_FEE_NGN = "0";

    const quote = createQuote([{ id: product.id, quantity: 1 }]);

    assert.equal(quote.canPay, false);
    assert.equal(quote.subtotalKobo, null);
    assert.ok(quote.messages.some((message) => message.includes("price_ngn")));
  } finally {
    product.priceNGN = previousPrice;
    restoreEnvironment("PAYSTACK_SECRET_KEY", previousEnvironment.secret);
    restoreEnvironment("PAYSTACK_CALLBACK_URL", previousEnvironment.callback);
    restoreEnvironment("DELIVERY_FEE_NGN", previousEnvironment.delivery);
  }
});

test("checkout totals use catalog prices and the configured delivery fee", () => {
  const product = getCatalog()[0];
  const previousPrice = product.priceNGN;
  const previousEnvironment = {
    secret: process.env.PAYSTACK_SECRET_KEY,
    callback: process.env.PAYSTACK_CALLBACK_URL,
    delivery: process.env.DELIVERY_FEE_NGN
  };

  try {
    product.priceNGN = 12500.5;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example123";
    process.env.PAYSTACK_CALLBACK_URL = "http://localhost:1969/payment-return.html";
    process.env.DELIVERY_FEE_NGN = "1500";

    const quote = createQuote([{ id: product.id, quantity: 2, price: 1 }]);

    assert.equal(quote.canPay, true);
    assert.equal(quote.subtotalKobo, 2500100);
    assert.equal(quote.deliveryKobo, 150000);
    assert.equal(quote.totalKobo, 2650100);
  } finally {
    product.priceNGN = previousPrice;
    restoreEnvironment("PAYSTACK_SECRET_KEY", previousEnvironment.secret);
    restoreEnvironment("PAYSTACK_CALLBACK_URL", previousEnvironment.callback);
    restoreEnvironment("DELIVERY_FEE_NGN", previousEnvironment.delivery);
  }
});

test("server-signed payment references bind the amount", () => {
  const secret = "sk_test_example123";
  const reference = createPaymentReference(987654, secret);

  assert.equal(readPaymentReference(reference, secret), 987654);
  assert.equal(readPaymentReference(reference, "sk_test_anotherkey"), null);
  assert.equal(readPaymentReference(`${reference}tampered`, secret), null);
});

function restoreEnvironment(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
