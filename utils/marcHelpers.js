const BookCopyModel = require("../models/bookCopy_model");

const mmToEnMap = {
  "၀": "0",
  "၁": "1",
  "၂": "2",
  "၃": "3",
  "၄": "4",
  "၅": "5",
  "၆": "6",
  "၇": "7",
  "၈": "8",
  "၉": "9",
};

function convertMmToEnDigits(input) {
  if (!input) return "";
  const str = input.toString();
  return str.replace(/[၀-၉]/g, (d) => mmToEnMap[d] || d);
}

function isValidIsbn10(digits) {
  if (!/^\d{9}[\dX]$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = digits[i];
    const val = ch === "X" ? 10 : parseInt(ch, 10);
    sum += (10 - i) * val;
  }
  return sum % 11 === 0;
}

function isValidIsbn13(digits) {
  if (!/^(978|979)\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

function normalizeIsbn(raw) {
  if (!raw) return null;

  const originalStr = raw.toString().trim();
  if (!originalStr) return null;

  let cleaned = originalStr.replace(/ISBM/gi, "ISBN");

  cleaned = cleaned.replace(/^ISBN[\s-]*/i, "");

  cleaned = cleaned.replace(/^-?(1[03])\s*[:\-]?\s*/, "");

  cleaned = convertMmToEnDigits(cleaned);

  let digits = cleaned.replace(/[^0-9Xx]/g, "").toUpperCase();

  if (
    digits.length === 15 &&
    digits.startsWith("13") &&
    ["978", "979"].includes(digits.slice(2, 5))
  ) {
    digits = digits.slice(2);
  }

  if (digits.length === 10) {
    return isValidIsbn10(digits) ? digits : null;
  }

  if (digits.length === 13) {
    return isValidIsbn13(digits) ? digits : null;
  }

  return null;
}

function extractYear(dateStr) {
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : null;
}

function cleanStr(val) {
  if (val === null || val === undefined) return null;
  const s = val.toString().trim();
  if (s === "_" || s === "" || s === "NaN") return null;
  return s;
}

function isMyanmarText(str) {
  if (!str) return false;
  return /[\u1000-\u109F\uAA60-\uAA7F]/.test(str);
}

function getAuthorInd1(name) {
  if (!name) return "1";
  if (isMyanmarText(name)) return "0";
  if (name.includes(",")) return "1";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return "0";
  return "1";
}

function getNonfilingCount(title) {
  if (!title) return "0";
  if (isMyanmarText(title)) return "0";
  const t = title.trimStart();
  if (/^The\s/i.test(t)) return "4";
  if (/^An\s/i.test(t)) return "3";
  if (/^A\s/i.test(t)) return "2";
  return "0";
}

function getUrlInd1(url) {
  if (!url) return "4";
  if (url.startsWith("mailto:")) return "0";
  if (url.startsWith("ftp:")) return "1";
  return "4"; // HTTP/HTTPSs default
}

function getSubjectInd2(term) {
  if (isMyanmarText(term)) return "4";
  return "0";
}

function normalizePrice(input) {
  if (input === null || input === undefined) {
    return {
      raw: null,
      amount: null,
      currency: null,
    };
  }

  let raw = String(input).trim();

  if (!raw) {
    return {
      raw: "",
      amount: null,
      currency: null,
    };
  }

  let normalized = convertMmToEnDigits(raw);

  let currencyMatch = normalized.match(/(USD|US\$|\$|Rs\.?|INR|₹|MMK|Ks|€|£)/i);

  let currency = currencyMatch ? currencyMatch[0] : null;

  let amountMatch = normalized.match(/[\d,.]+/);

  let amount = amountMatch ? amountMatch[0].replace(/,/g, "") : null;

  if (amount && !/^\d+(\.\d+)?$/.test(amount)) {
    amount = null;
  }

  if (!currency && amount && /^\d+(\.\d+)?$/.test(amount)) {
    currency = "Ks";
  }

  return {
    raw,
    amount,
    currency,
  };
}

function normalizePriceToString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function normalizeDate(raw) {
  if (!raw) return null;

  if (typeof raw === "number") {
    // Excel epoch: Dec 30, 1899
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }

  let str = raw.toString().trim();
  if (!str || str === "_") return null;

  str = convertMmToEnDigits(str);

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  }

  const dotSlash = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotSlash) {
    const day = parseInt(dotSlash[1], 10);
    const month = parseInt(dotSlash[2], 10); // ← index 2 = MM (မ month ကို first)
    const year = parseInt(dotSlash[3], 10);

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1900 || year > 2100) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
  }

  const yearFirst = str.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (yearFirst) {
    const year = parseInt(yearFirst[1], 10);
    const month = parseInt(yearFirst[2], 10);
    const day = parseInt(yearFirst[3], 10);

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function normalizeItemType(raw) {
  if (!raw) return "BOOK";
  const v = raw.toString().trim().toLowerCase().replace(/\s+/g, "");
  if (v.includes("dvd")) return "BOOK_DVD";
  if (v.includes("cd")) return "BOOK_CD";
  return "BOOK";
}

function parseDewey(raw) {
  if (!raw) return null;

  const str = raw.toString().trim();

  // split at first dash ONLY
  const parts = str.split(/-(.+)/);

  return {
    raw: str,
    number: parts[0],
    suffix: parts[1] || null,
  };
}

function normalizeLoanPolicy(raw) {
  if (!raw) return "LOANABLE";
  const v = raw.toString().trim().toLowerCase();
  if (v.includes("not") || v === "မငှား") return "NOT_LOANABLE";
  if (v.includes("teacher") || v.includes("ဆရာ") || v.includes("ဝန်ထမ်း"))
    return "STAFF_ONLY";
  return "LOANABLE";
}

function normalizePage(val) {
  if (!val) return null;

  let str = val.toString().trim(); // ✅ ADD THIS

  str = convertMmToEnDigits(str);

  const match = str.match(/\d+/);

  return match ? parseInt(match[0], 10) : null;
}

function normalizeYear(raw) {
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();

  str = convertMmToEnDigits(str);
  const match = str.match(/\d{4}/);
  if (match) {
    return match[0];
  }
  return null;
}

function cleanNum(val) {
  if (val === null || val === undefined) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function ensureAccessionNumber(rawAccession) {
  const normalized = normalizeAccessionNumber(rawAccession);
  if (normalized) return normalized;

  const last = await BookCopyModel.findOne({
    accession_number: /^\d{6}$/,
  }).sort({ accession_number: -1 });

  const nextSeq = last ? parseInt(last.accession_number, 10) + 1 : 1;

  return String(nextSeq).padStart(6, "0");
}

function normalizeAccessionNumber(raw) {
  const cleaned = raw?.toString().trim();
  if (!cleaned || cleaned === "_" || cleaned === "") return null;
  if (/^\d+$/.test(cleaned)) return cleaned.padStart(6, "0");
  return null;
}

function normalizeDimension(raw) {
  if (!raw) return null;

  let str = raw.toString().trim().toLowerCase();
  if (!str || str === "_") return null;

  str = convertMmToEnDigits(str);

  const numberMatch = str.match(/\d+(\.\d+)?/);
  if (!numberMatch) return null;
  const value = numberMatch[0];

  const isCm = /စင်တီ|cm|centimeter/.test(str);
  const isMm = /မီလီ|mm|millimeter/.test(str);
  const isInches = /လက်မ|in|inch|inches/.test(str);

  if (isCm) {
    return `${value} cm`;
  } else if (isMm) {
    return `${value} mm`;
  } else if (isInches) {
    return `${value} in`;
  }

  return `${value} cm`;
}

function parseKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))
    return raw.map((k) => String(k).trim()).filter(Boolean);

  return String(raw)
    .split(/[#;,]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

module.exports = {
  normalizeIsbn,
  cleanStr,
  isMyanmarText,
  getAuthorInd1,
  getNonfilingCount,
  getUrlInd1,
  getSubjectInd2,
  normalizePrice,
  normalizePriceToString,
  normalizeDate,
  normalizeItemType,
  parseDewey,
  normalizeLoanPolicy,
  normalizePage,
  normalizeYear,
  normalizeAccessionNumber,
  cleanNum,
  ensureAccessionNumber,
  extractYear,
  normalizeDimension,
  parseKeywords,
};
