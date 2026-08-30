const {
  normalizeIsbn,
  cleanStr,
  isMyanmarText,
  getAuthorInd1,
  getNonfilingCount,
  getUrlInd1,
  getSubjectInd2,
  normalizePrice,
  normalizeDate,
  normalizeItemType,
  parseDewey,
  normalizeLoanPolicy,
  normalizePage,
  normalizeYear,
  normalizeAccessionNumber,
  cleanNum,
  ensureAccessionNumber,
} = require("../utils/marcHelpers");

function buildMarcJson(row) {
  const marc = {};
  // 100 — Main Author
  const authorName = cleanStr(row.author);
  const authorRole = cleanStr(row.authorRole);
  if (authorName) {
    const f100 = { ind1: getAuthorInd1(authorName), ind2: " " };
    f100.a = authorName;
    if (authorRole) f100.e = authorRole;
    marc["100"] = f100;
  }

  // 245 — Title
  const titleVal = cleanStr(row.title);
  const subtitleVal = cleanStr(row.subtitle);
  if (titleVal) {
    const f245 = {
      ind1: authorName ? "1" : "0",
      ind2: getNonfilingCount(titleVal),
    };
    f245.a = titleVal;
    if (subtitleVal) f245.b = subtitleVal;
    marc["245"] = f245;
  }

  // 020 — ISBN
  const isbnVal = cleanStr(normalizeIsbn(row.isbn_number));
  if (isbnVal) marc["020"] = { ind1: " ", ind2: " ", a: isbnVal };

  // 250 — Edition
  const editionVal = cleanStr(row.edition);
  if (editionVal) marc["250"] = { ind1: " ", ind2: " ", a: editionVal };

  // 260 — Publication
  const pubPlace = cleanStr(row.pubPlace);
  const publisher = cleanStr(row.publisher);
  const pubYear = normalizeYear(row.pubYear);
  if (pubPlace || publisher || pubYear) {
    const f260 = { ind1: " ", ind2: " " };
    if (pubPlace) f260.a = pubPlace;
    if (publisher) f260.b = publisher;
    if (pubYear) f260.c = pubYear;
    marc["260"] = f260;
  }

  // 300 — Physical Description
  const pages = row.pages;
  const illus = cleanStr(row.illustrations);
  const dimensions = cleanStr(row.dimensions);
  if (pages || illus || dimensions) {
    const f300 = { ind1: " ", ind2: " " };
    if (pages) f300.a = pages;
    if (illus) f300.b = illus;
    if (dimensions) f300.c = dimensions;
    marc["300"] = f300;
  }

  // 490 — Series
  const seriesTitle = cleanStr(row.seriesTitle);
  if (seriesTitle) {
    marc["490"] = { ind1: "0", ind2: " ", a: seriesTitle };
  }

  // 500 — General Note
  const genNote = cleanStr(row.genNote);
  if (genNote) marc["500"] = { ind1: " ", ind2: " ", a: genNote };

  // 520 — Summary Note
  const note = cleanStr(row.note);
  if (note) marc["520"] = { ind1: " ", ind2: " ", a: note };

  // 504 — Bibliography Note
  const bibNote = cleanStr(row.bibNote);
  if (bibNote) marc["504"] = { ind1: " ", ind2: " ", a: bibNote };

  // 082 — Dewey
  const classNumber = parseDewey(row.classNumber);
  if (classNumber) {
    marc["082"] = {
      ind1: "0",
      ind2: "4",
      a: classNumber.number,
      ...(classNumber.suffix && { b: classNumber.suffix }),
      raw: classNumber.raw,
    };
  }

  // 090 — Local Call Number
  const shelfLoc = cleanStr(row.shelfLocation);
  if (shelfLoc) marc["090"] = { ind1: " ", ind2: " ", a: shelfLoc };

  // 650 — Keywords
  const keywords = cleanStr(row.keywords);
  if (keywords) {
    const terms = keywords
      .split(/[,;၊]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (terms.length) {
      marc["650"] = terms.map((term) => ({
        ind1: "0",
        ind2: getSubjectInd2(term),
        a: term,
      }));
    }
  }

  // 700 — Added Authors
  const added = [];
  const a2 = cleanStr(row.author2);
  const a3 = cleanStr(row.author3);
  if (a2) added.push({ ind1: getAuthorInd1(a2), ind2: " ", a: a2 });
  if (a3) added.push({ ind1: getAuthorInd1(a3), ind2: " ", a: a3 });
  if (added.length) marc["700"] = added;

  // 856 — URL
  const url = cleanStr(row.ebook_url);
  if (url) marc["856"] = { ind1: getUrlInd1(url), ind2: "0", u: url };

  // 037 — Acquisition
  const acqMethod = cleanStr(row.acquired_method);
  const acqDate = row.acquiredDate ? row.acquiredDate : null;
  const acqPrice = cleanNum(row.price);
  if (acqMethod || acqDate || acqPrice !== null) {
    const f037 = { ind1: " ", ind2: " " };
    if (acqMethod) f037.a = acqMethod;
    if (acqDate) f037.d = acqDate;
    if (acqPrice !== null) f037.c = acqPrice;
    marc["037"] = f037;
  }

  return marc;
}

function buildMarcJsonFromForm(form) {
  const marc = {};

  // 020 — ISBN
  if (cleanStr(form.isbn_number)) {
    marc["020"] = { ind1: " ", ind2: " ", a: cleanStr(form.isbn_number) };
  }

  // 100 — Main Author
  if (cleanStr(form.author)) {
    const f100 = {
      ind1: getAuthorInd1(form.author),
      ind2: " ",
      a: cleanStr(form.author),
    };
    if (cleanStr(form.authorRole)) f100.e = cleanStr(form.authorRole);
    marc["100"] = f100;
  }

  // 245 — Title
  if (cleanStr(form.title)) {
    const f245 = {
      ind1: cleanStr(form.author) ? "1" : "0",
      ind2: getNonfilingCount(form.title),
      a: cleanStr(form.title),
    };
    if (cleanStr(form.subtitle)) f245.b = cleanStr(form.subtitle);
    marc["245"] = f245;
  }

  // 250 — Edition
  if (cleanStr(form.edition)) {
    marc["250"] = { ind1: " ", ind2: " ", a: cleanStr(form.edition) };
  }

  // 260 — Publication
  const f260 = { ind1: " ", ind2: " " };
  if (cleanStr(form.pubPlace)) f260.a = cleanStr(form.pubPlace);
  if (cleanStr(form.publisher)) f260.b = cleanStr(form.publisher);
  if (cleanStr(form.pubYear)) f260.c = cleanStr(form.pubYear);
  if (Object.keys(f260).length > 2) marc["260"] = f260;

  // 300 — Physical
  const f300 = { ind1: " ", ind2: " " };
  if (form.pages) f300.a = form.pages;
  if (cleanStr(form.illustrations)) f300.b = cleanStr(form.illustrations);
  if (form.dimensions) f300.c = form.dimensions;
  if (Object.keys(f300).length > 2) marc["300"] = f300;

  // 490 — Series
  if (cleanStr(form.seriesTitle)) {
    const f490 = { ind1: "0", ind2: " ", a: cleanStr(form.seriesTitle) };
    if (cleanStr(form.seriesNo)) f490.v = cleanStr(form.seriesNo);
    marc["490"] = f490;
  }

  // 500/504 — Notes
  if (cleanStr(form.generalNote))
    marc["500"] = { ind1: " ", ind2: " ", a: cleanStr(form.generalNote) };
  if (cleanStr(form.bibNote))
    marc["504"] = { ind1: " ", ind2: " ", a: cleanStr(form.bibNote) };

  // 082 — Class Number
  if (cleanStr(form.classNumber)) {
    marc["082"] = { ind1: "0", ind2: "4", a: cleanStr(form.classNumber) };
  }

  // 650 — Keywords/Subjects
  if (Array.isArray(form.keywords) && form.keywords.length > 0) {
    const terms = form.keywords.map((k) => cleanStr(k)).filter(Boolean);
    if (terms.length) {
      marc["650"] = terms.map((term) => ({
        ind1: "0",
        ind2: getSubjectInd2(term),
        a: term,
      }));
    }
  }

  // 700 — Added authors
  const added = [];
  if (cleanStr(form.author2))
    added.push({
      ind1: getAuthorInd1(form.author2),
      ind2: " ",
      a: cleanStr(form.author2),
    });
  if (cleanStr(form.author3))
    added.push({
      ind1: getAuthorInd1(form.author3),
      ind2: " ",
      a: cleanStr(form.author3),
    });
  if (added.length) marc["700"] = added;

  // 856 — URL
  if (cleanStr(form.ebookUrl)) {
    marc["856"] = {
      ind1: getUrlInd1(form.ebookUrl),
      ind2: "0",
      u: cleanStr(form.ebookUrl),
    };
  }

  return marc;
}

module.exports = { buildMarcJson };

module.exports = { buildMarcJson, buildMarcJsonFromForm };
