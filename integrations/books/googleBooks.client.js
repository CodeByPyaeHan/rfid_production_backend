const axios = require("axios");

async function lookupGoogleBooks(isbn) {
  const url = "https://www.googleapis.com/books/v1/volumes";
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;

  const res = await axios.get(url, {
    params: { q: `isbn:${isbn}`, key: apiKey },
    timeout: 5000,
  });

  const item = res.data.items?.[0];
  if (!item) return null;

  const info = item.volumeInfo;
  return {
    isbn_number: isbn,
    title: info.title || null,
    author: info.authors?.[0] || null,
    publisher: info.publisher || null,
    pubYear: info.publishedDate?.slice(0, 4) || null,
    pages: info.pageCount || null,
    keywords: info.categories || [],
    coverImage: info.imageLinks?.thumbnail || null,
    book_language: info.language || null,
    description: info.description || null,
    classNumber: null,
    shelfLocation: null,
  };
}

module.exports = { lookupGoogleBooks };
