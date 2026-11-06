const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDelimited } = require("../data/catalog");

test("parses pipe-delimited fields with escaped quotes and embedded newlines", () => {
  const source = [
    "brand|name_perfume|description|gender|ingredients|image_name",
    'Brand|Scent|"A ""bright"" scent"|Male|["Rose", "Lemon"]|bottle.jpg',
    '"Brand| Two"|Other|"Line one',
    'line two"|Female|[]|other.jpg'
  ].join("\n");

  const products = parseDelimited(source);

  assert.equal(products.length, 2);
  assert.equal(products[0].name, "Scent");
  assert.equal(products[0].category, "Men");
  assert.equal(products[0].ingredients, "Rose, Lemon");
  assert.equal(products[1].brand, "Brand| Two");
  assert.equal(products[1].description, "Line one\nline two");
});

test("maps unknown gender to Unisex and handles an empty ingredient list", () => {
  const products = parseDelimited(
    "brand|name_perfume|gender|ingredients\nBrand|Scent|Unknown|[]"
  );

  assert.equal(products[0].category, "Unisex");
  assert.equal(products[0].ingredients, "");
});

test("reads optional NGN prices and leaves missing or invalid prices unset", () => {
  const products = parseDelimited([
    "brand|name_perfume|gender|price_ngn",
    "Brand|Priced|Female|12500.50",
    "Brand|Missing|Male|",
    "Brand|Invalid|Unisex|12.345"
  ].join("\n"));

  assert.equal(products[0].priceNGN, 12500.5);
  assert.equal(products[1].priceNGN, null);
  assert.equal(products[2].priceNGN, null);
});
