const axios = require("axios");
const { extractYear } = require("../../utils/marcHelpers");

async function lookupOpenLibrary(isbn) {
  const url = "https://openlibrary.org/api/books";
  const res = await axios.get(url, {
    params: { bibkeys: `ISBN:${isbn}`, format: "json", jscmd: "data" },
    timeout: 5000,
  });

  const book = res.data[`ISBN:${isbn}`];
  if (!book) return null;
  return {
    isbn_number: isbn,
    title: book.title || null,
    subtitle: null,
    author: book.authors?.[0]?.name || null,
    author2: book.authors?.[1]?.name || null,
    author3: book.authors?.[2]?.name || null,
    authorRole: book.by_statement || "စာရေးသူ",
    publisher: book.publishers?.[0]?.name || null,
    pubPlace: book.publish_places?.[0]?.name || null,
    pubYear: book.publish_date ? extractYear(book.publish_date) : null,
    pages: book.number_of_pages || null,
    keywords: (book.subjects || []).map((s) => s.name).slice(0, 5),
    coverImage: book.cover?.medium || null,
    classNumber: book.classifications?.dewey_decimal_class?.[0] || null,
    bibNote: book.notes || null,
    ebookUrl: book.ebooks?.[0]?.preview_url || null,
    accession_number: null,
    acquired_date: null,
    price: null,
    shelfLocation: null,
    acquisition: null,
    note: null,
    seriesTitle: null,
    illus: null,
    genNote: null,
    dimensions: null,
    material_type: "BOOK",
    loanPolicy: null,
    documentType: "book",
    edition: null,
  };
}

module.exports = { lookupOpenLibrary };
