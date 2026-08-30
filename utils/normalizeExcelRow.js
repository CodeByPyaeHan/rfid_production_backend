const {
  cleanStr,
  normalizeDate,
  normalizeItemType,
  normalizeLoanPolicy,
  normalizeIsbn,
  normalizePriceToString,
  normalizeYear,
  normalizeDimension,
} = require("./marcHelpers");

const normalizeRow = (row, COL) => {
  return {
    title: cleanStr(row[COL.title]),
    author: cleanStr(row[COL.author]),
    isbn_number: normalizeIsbn(row[COL.isbn_number]),
    publisher: cleanStr(row[COL.publisher]),
    pubYear: normalizeYear(row[COL.year]),
    classNumber: cleanStr(row[COL.classNumber]),
    shelfLocation: cleanStr(row[COL.shelfLoc]),
    materialType: normalizeItemType(row[COL.itemType]),
    loanPolicy: normalizeLoanPolicy(row[COL.loanPolicy]),
    accession_number: cleanStr(row[COL.accession]),
    price: normalizePriceToString(row[COL.price]),
    // marc fields
    subtitle: cleanStr(row[COL.subtitle]),
    authorRole: cleanStr(row[COL.authorRole]),
    author2: cleanStr(row[COL.author2]),
    author3: cleanStr(row[COL.author3]),
    pages: cleanStr(row[COL.pages]),
    illustrations: cleanStr(row[COL.illus]),
    edition: cleanStr(row[COL.edition]),
    dimensions: normalizeDimension(row[COL.dimensions]),
    seriesTitle: cleanStr(row[COL.seriesTitle]),
    genNote: cleanStr(row[COL.genNote]),
    note: cleanStr(row[COL.note]),
    bibNote: cleanStr(row[COL.bibNote]),
    ebook_url: cleanStr(row[COL.ebook_url]),
    keywords: cleanStr(row[COL.keywords]),
    acquired_method: cleanStr(row[COL.acquired_method]),
    acquiredDate: normalizeDate(row[COL.date]),
    documentType: "book",
    copyCount: 1,
  };
};

module.exports = { normalizeRow };
