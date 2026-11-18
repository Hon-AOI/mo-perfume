const fs = require("fs");
const path = require("path");

function decodeField(text, start, end) {
  const raw = text.slice(start, end);
  if (!raw.includes('"')) return raw;

  const parts = [];
  let insideQuotes = false;
  let partStart = 0;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== '"') continue;

    parts.push(raw.slice(partStart, index));
    if (insideQuotes && raw[index + 1] === '"') {
      parts.push('"');
      index += 1;
    } else {
      insideQuotes = !insideQuotes;
    }
    partStart = index + 1;
  }
  parts.push(raw.slice(partStart));
  return parts.join("");
}

function parseDelimited(text, delimiter = "|") {
  const products = [];
  let headers;
  let row = [];
  let fieldStart = 0;
  let insideQuotes = false;

  const addRow = () => {
    if (!row.some((value) => value.length > 0)) {
      row = [];
      return;
    }
    if (!headers) {
      headers = row.map((header) => header.trim());
    } else {
      products.push(createProduct(headers, row, products.length));
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === delimiter && !insideQuotes) {
      row.push(decodeField(text, fieldStart, index));
      fieldStart = index + 1;
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      row.push(decodeField(text, fieldStart, index));
      addRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      fieldStart = index + 1;
    }
  }

  if (fieldStart < text.length || row.length > 0) {
    row.push(decodeField(text, fieldStart, text.length));
    addRow();
  }

  return products;
}

function createProduct(headers, values, index) {
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] || "";
    });

    const gender = record.gender.toLocaleLowerCase();
    const rawPrice = (record.price_ngn || record.price || "").trim();
    const priceNGN = /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? Number(rawPrice) : null;
    const ingredients = (record.ingredients || "")
      .replace(/^\s*\[|\]\s*$/g, "")
      .split(/,\s*/)
      .map((ingredient) => ingredient.replace(/^['"]|['"]$/g, "").trim())
      .filter(Boolean);

    return {
      id: String(index + 1),
      name: record.name_perfume,
      brand: record.brand,
      category: gender === "male" ? "Men" : gender === "female" ? "Women" : "Unisex",
      description: record.description,
      image: record.image_name,
      family: record.family,
      origin: record.origin,
      year: record.years,
      priceNGN: Number.isFinite(priceNGN) && priceNGN > 0 ? priceNGN : null,
      ingredients: ingredients.join(", ")
    };
}

let catalog;

function getCatalog() {
  if (!catalog) {
    const filePath = path.join(__dirname, "perfumes.csv");
    catalog = parseDelimited(fs.readFileSync(filePath, "utf8"));
  }
  return catalog;
}

module.exports = { getCatalog, parseDelimited };
