const fs = require("fs");
const path = require("path");

function parseDelimited(text, delimiter = "|") {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === delimiter && !insideQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values, index) => {
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
  });
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
