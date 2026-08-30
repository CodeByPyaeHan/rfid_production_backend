// services/marcMrcService.js
const { Marc, Record } = require("marcjs");
const { Readable } = require("stream");
const Book = require("../models/book_model");
const BookCopy = require("../models/bookCopy_model");
const {
  normalizeIsbn,
  ensureAccessionNumber,
  normalizePrice,
} = require("../utils/marcHelpers");

function fieldToAppendArgs(tag, field) {
  if (!field || typeof field !== "object") return null;

  const ind1 = field.ind1 || " ";
  const ind2 = field.ind2 || " ";
  const indicators = ind1 + ind2;

  const subfields = [];
  for (const [code, val] of Object.entries(field)) {
    if (code === "ind1" || code === "ind2" || code === "raw") continue;
    if (val == null || val === "") continue;
    const strVal =
      val instanceof Date ? val.toISOString().split("T")[0] : String(val);
    subfields.push(code, strVal);
  }

  if (subfields.length === 0) return null;
  return [tag, indicators, ...subfields];
}

function buildField008(book) {
  const now = new Date();
  const entered = now.toISOString().slice(2, 10).replace(/-/g, "");
  const date1 = String(book.pub_year || now.getFullYear())
    .padEnd(4, " ")
    .slice(0, 4);
  const lang = book.book_language === "mya" ? "mya" : "eng";
  // 40-char fixed field
  return `${entered}s${date1}    mm ||||||||||||||||${lang}|d`;
}

function bookToMarcRecord(book, copies = []) {
  const rec = new Record();
  const marc = book.marc_json || {};

  rec.leader = "00000nam a2200000 i 4500";

  // ── Control Fields ────────────────────────────────────────
  rec.append(["001", book._id.toString()]);
  rec.append(["003", "MMU"]);
  rec.append([
    "005",
    new Date(book.updated_at || book.created_at)
      .toISOString()
      .replace(/[-:T]/g, "")
      .split(".")[0] + ".0",
  ]);
  rec.append(["008", buildField008(book)]);

  // ── Data Fields from marc_json (sorted by tag) ────────────
  const sortedTags = Object.keys(marc)
    .filter((tag) => /^\d{3}$/.test(tag))
    .sort((a, b) => Number(a) - Number(b));

  for (const tag of sortedTags) {
    const field = marc[tag];

    // Repeatable (array) — 650, 700
    if (Array.isArray(field)) {
      for (const f of field) {
        const args = fieldToAppendArgs(tag, f);
        if (args) rec.append(args);
      }
    } else {
      const args = fieldToAppendArgs(tag, field);
      if (args) rec.append(args);
    }
  }

  // ── Holdings — 852 from BookCopy ─────────────────────────
  for (const copy of copies) {
    const subfields = [];
    if (copy.shelf_id?.shelf_code) {
      subfields.push("c", copy.shelf_id.shelf_code);
    }
    subfields.push("p", copy.accession_number);
    subfields.push("x", copy.status);
    if (copy.acquired_date) {
      subfields.push(
        "d",
        new Date(copy.acquired_date).toISOString().split("T")[0],
      );
    }
    rec.append(["852", "  ", ...subfields]);
  }
  return rec;
}

const exportSingle = async (bookId) => {
  const book = await Book.findById(bookId).lean();
  if (!book) {
    const err = new Error("Book not found.");
    err.status = 404;
    throw err;
  }

  const copies = await BookCopy.find({ book_id: book._id })
    .populate("shelf_id", "shelf_code")
    .lean();

  const record = bookToMarcRecord(book, copies);
  const isoStr = Marc.format(record, "Iso2709");
  return Buffer.from(isoStr, "utf-8");
};

const exportBulk = async ({ search, documentType }) => {
  const filter = {};
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { author: { $regex: search, $options: "i" } },
    ];
  }
  if (documentType) filter.document_type = documentType;

  const books = await Book.find(filter).sort({ created_at: 1 }).lean();

  if (books.length === 0) {
    const err = new Error("No records found.");
    err.status = 404;
    throw err;
  }

  const bookIds = books.map((b) => b._id);
  const allCopies = await BookCopy.find({ book_id: { $in: bookIds } })
    .populate("shelf_id", "shelf_code")
    .lean();

  const copiesByBook = allCopies.reduce((acc, c) => {
    const key = c.book_id.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const isoChunks = books.map((book) => {
    const record = bookToMarcRecord(
      book,
      copiesByBook[book._id.toString()] || [],
    );
    return Marc.format(record, "Iso2709");
  });

  return Buffer.from(isoChunks.join(""), "utf-8");
};

const importMrc = async (mrcBuffer) => {
  const records = await new Promise((resolve, reject) => {
    const results = [];
    const parser = Marc.createStream("Iso2709", "Parser");
    parser.on("data", (r) => results.push(r));
    parser.on("end", () => resolve(results));
    parser.on("error", (err) => reject(err));
    // Feed buffer through Readable → parser
    const readable = new Readable();
    readable.push(mrcBuffer);
    readable.push(null);
    readable.pipe(parser);
  });

  let imported = 0,
    skipped = 0,
    errors = 0;
  const errorDetails = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const recordNum = i + 1;

    try {
      // ── Extract field helper ──────────────────────────────
      const getSubfield = (tag, code) => {
        const f = rec.fields.find((f) => f[0] === tag);
        if (!f) return null;
        // marcjs field: [tag, indicators, code, value, code, value...]
        for (let j = 2; j < f.length - 1; j += 2) {
          if (f[j] === code) return f[j + 1];
        }
        return null;
      };

      const getAllByTag = (tag) => rec.fields.filter((f) => f[0] === tag);

      const title = getSubfield("245", "a");
      const author = getSubfield("100", "a");

      if (!title) {
        skipped++;
        continue;
      }

      // Duplicate check
      const isbnRaw = getSubfield("020", "a");
      const isbn = normalizeIsbn(isbnRaw);
      const dupFilter = isbn ? { isbn } : { title, author };

      const exists = await Book.findOne(dupFilter);
      if (exists) {
        skipped++;
        continue;
      }

      // Build marc_json from Record fields
      const marc_json = buildMarcJsonFromFields(rec.fields);

      // Create book
      const book = await Book.create({
        isbn_number: isbn || null,
        title,
        author: author || null,
        publisher: getSubfield("260", "b"),
        pub_year: getSubfield("260", "c"),
        class_number: getSubfield("082", "a") || getSubfield("090", "a"),
        keywords: getAllByTag("650")
          .map((f) => {
            for (let j = 2; j < f.length - 1; j += 2)
              if (f[j] === "a") return f[j + 1];
          })
          .filter(Boolean),
        document_type: "book",
        material_type: "BOOK",
        loan_policy: "LOANABLE",
        marc_source: "mrc_import",
        marc_json,
      });

      // Holdings from 852
      const holdings = getAllByTag("852");
      if (holdings.length > 0) {
        for (const h of holdings) {
          const accNum =
            (() => {
              for (let j = 2; j < h.length - 1; j += 2) {
                if (h[j] === "p") return h[j + 1];
              }
              return null;
            })() || (await ensureAccessionNumber(null));

          const statusVal = (() => {
            for (let j = 2; j < h.length - 1; j += 2) {
              if (h[j] === "x") return h[j + 1];
            }
            return "available";
          })();

          const copyExists = await BookCopy.findOne({
            accession_number: accNum,
          });
          if (!copyExists) {
            await BookCopy.create({
              book_id: book._id,
              accession_number: accNum,
              price: normalizePrice(getSubfield("037", "c")),
              acquired_date: getSubfield("037", "d"),
              status: statusVal,
            });
          }
        }
      } else {
        const accNum = await ensureAccessionNumber(null);
        await BookCopy.create({
          book_id: book._id,
          accession_number: accNum,
          price: normalizePrice(getSubfield("037", "c")),
          acquired_date: getSubfield("037", "d"),
          status: "pending_rfid",
        });
      }

      imported++;
    } catch (err) {
      errors++;
      errorDetails.push(`Record ${recordNum}: ${err.message}`);
    }
  }

  return { imported, skipped, errors, errorDetails };
};

function buildMarcJsonFromFields(fields) {
  const marc = {};
  const REPEATABLE = new Set(["650", "700", "600", "610", "856"]);

  for (const field of fields) {
    const tag = field[0];
    if (!tag || !/^\d{3}$/.test(tag)) continue;

    // Control fields (001-009) — no indicators/subfields
    if (Number(tag) < 10) continue;

    const indicators = field[1] || "  ";
    const ind1 = indicators[0] || " ";
    const ind2 = indicators[1] || " ";

    const obj = { ind1, ind2 };
    for (let j = 2; j < field.length - 1; j += 2) {
      const code = field[j];
      const val = field[j + 1];
      if (code && val != null) obj[code] = val;
    }

    if (REPEATABLE.has(tag)) {
      if (!marc[tag]) marc[tag] = [];
      marc[tag].push(obj);
    } else {
      marc[tag] = obj;
    }
  }

  return marc;
}

module.exports = { exportSingle, exportBulk, importMrc };
