const XLSX = require("xlsx");
const mongoose = require("mongoose");
const Book = require("../models/book_model");
const BookCopy = require("../models/bookCopy_model");
const Shelf = require("../models/shelf_model");
const { withTransaction } = require("../services/transaction_service");

const { normalizeRow } = require("../utils/normalizeExcelRow");
const { COL } = require("../utils/excelColumns");
const { buildMarcJson } = require("../mappers/marc.maper");
const {
  cleanStr,
  normalizeIsbn,
  normalizeYear,
  normalizePrice,
  parseDewey,
  ensureAccessionNumber,
  parseKeywords,
  normalizeAccessionNumber,
} = require("../utils/marcHelpers");

const { bookSchema } = require("../utils/schema");

const CHUNK_SIZE = 500;

function normKey(str) {
  return String(str || "")
    .trim()
    .toLowerCase();
}

const importExcelService = async (fileBuffer) => {
  try {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (!rows.length) throw new Error("Empty Excel");

    let imported = 0,
      skipped = 0,
      errors = 0;
    const errorDetails = [];

    const existingBooks = await Book.find(
      {},
      "_id title author isbn_number keywords",
    ).lean();
    const isbnMap = new Map(
      existingBooks
        .filter((b) => b.isbn_number)
        .map((b) => [normKey(b.isbn_number), b]),
    );
    const bookMap = new Map(
      existingBooks.map((b) => [
        `${normKey(b.title)}|${normKey(b.author || "")}`,
        b,
      ]),
    );

    const existingShelves = await Shelf.find(
      {},
      "_id shelf_code is_deleted",
    ).lean();
    const shelfMap = new Map(
      existingShelves.map((s) => [normKey(s.shelf_code), s]),
    );

    const lastAccessionDoc = await BookCopy.findOne(
      { accession_number: /^\d{6}$/ },
      "accession_number",
    )
      .sort({ accession_number: -1 })
      .lean();

    let accessionCounter = lastAccessionDoc
      ? parseInt(lastAccessionDoc.accession_number, 10)
      : 0;

    function getNextAccessionNumber() {
      accessionCounter += 1;
      return String(accessionCounter).padStart(6, "0");
    }

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);

      const copiesToInsert = [];
      const booksToInsert = [];
      const bookUpdateOps = [];
      const shelvesToInsert = [];
      const shelfRevives = [];

      for (let j = 0; j < chunk.length; j++) {
        const rowNumber = i + j + 2;
        const normalized = normalizeRow(chunk[j], COL);
        const { error, value } = bookSchema.importExcel.validate(normalized);

        if (error) {
          skipped++;
          errorDetails.push(`Row ${rowNumber}: ${error.message}`);
          continue;
        }

        try {
          const title = cleanStr(value.title);
          const author = cleanStr(value.author);
          const bookKey = `${normKey(title)}|${normKey(author)}`;

          // -- ၂။ Shelf ရှာဖွေခြင်း --
          let shelfId = null;
          if (value.shelfLocation) {
            const shelfKey = normKey(value.shelfLocation);
            if (shelfMap.has(shelfKey)) {
              const s = shelfMap.get(shelfKey);
              shelfId = s._id;
              if (s.is_deleted) {
                shelfRevives.push(s._id);
                s.is_deleted = false;
              }
            } else {
              shelfId = new mongoose.Types.ObjectId();
              const newShelf = {
                _id: shelfId,
                shelf_code: value.shelfLocation,
              };
              shelfMap.set(shelfKey, newShelf);
              shelvesToInsert.push(newShelf);
            }
          }

          // -- ၃။ Book စစ်ဆေးခြင်း (ISBN -> Title+Author) --
          let existingBook = value.isbn_number
            ? isbnMap.get(normKey(value.isbn_number))
            : null;
          if (!existingBook) existingBook = bookMap.get(bookKey);

          let bookId;
          if (existingBook) {
            bookId = existingBook._id;

            const updateDoc = {};
            if (value.publisher)
              updateDoc.publisher = cleanStr(value.publisher);
            if (value.pubYear)
              updateDoc.pub_year = normalizeYear(value.pubYear);
            if (value.classNumber)
              updateDoc.class_number = parseDewey(value.classNumber)?.raw;
            if (value.shelfLocation)
              updateDoc.shelf_location = value.shelfLocation;

            const newKeywords = parseKeywords(value.keywords);
            if (newKeywords?.length) {
              updateDoc.keywords = [
                ...new Set([...(existingBook.keywords || []), ...newKeywords]),
              ];
              existingBook.keywords = updateDoc.keywords;
            }

            if (Object.keys(updateDoc).length > 0) {
              bookUpdateOps.push({
                updateOne: {
                  filter: { _id: bookId },
                  update: { $set: updateDoc },
                },
              });
            }
          } else {
            bookId = new mongoose.Types.ObjectId();
            const newBook = {
              _id: bookId,
              isbn_number: value.isbn_number,
              title,
              author,
              publisher: cleanStr(value.publisher),
              pub_year: normalizeYear(value.pubYear),
              class_number: parseDewey(value.classNumber)?.raw,
              shelf_location: value.shelfLocation,
              material_type: value.materialType,
              loan_policy: value.loanPolicy,
              keywords: parseKeywords(value.keywords),
              marc_json: buildMarcJson(value),
            };
            booksToInsert.push(newBook);
            bookMap.set(bookKey, newBook);
            if (value.isbn_number)
              isbnMap.set(normKey(value.isbn_number), newBook);
          }

          const normalizedAccession = normalizeAccessionNumber(
            value.accession_number,
          );

          if (normalizedAccession && /^\d{6}$/.test(normalizedAccession)) {
            const asNum = parseInt(normalizedAccession, 10);
            if (asNum > accessionCounter) accessionCounter = asNum;
          }

          const accession = normalizedAccession || getNextAccessionNumber();

          copiesToInsert.push({
            book_id: bookId,
            shelf_id: shelfId,
            accession_number: accession,
            price: normalizePrice(value.price),
            acquired_date: value.acquiredDate || null,
            acquired_method: value.acquired_method,
            status: "pending_rfid",
            is_rfid_written: false,
          });
        } catch (err) {
          errors++;
          errorDetails.push(`Row ${rowNumber}: ${err.message}`);
        }
      }

      // ══════════════════════════════════════════════════════════════
      // ★ FIX — Duplicate accession-number pre-check, done BEFORE the
      //   transaction starts. A duplicate-key error INSIDE a transaction
      //   poisons the whole transaction server-side — you cannot discover
      //   it via a failed insertMany and gracefully keep using that same
      //   transaction afterward. Filtering here is the only reliable way
      //   to "skip duplicates, keep the rest of the chunk".
      // ══════════════════════════════════════════════════════════════
      let finalCopiesToInsert = copiesToInsert;
      if (copiesToInsert.length > 0) {
        const candidateAccessions = copiesToInsert.map(
          (c) => c.accession_number,
        );

        // ★ chunk-scoped $in — not a full collection scan
        const existingCopyDocs = await BookCopy.find(
          { accession_number: { $in: candidateAccessions } },
          "accession_number",
        ).lean();
        const existingAccessionSet = new Set(
          existingCopyDocs.map((c) => c.accession_number),
        );

        const seenInChunk = new Set();
        finalCopiesToInsert = [];

        for (const copy of copiesToInsert) {
          const acc = copy.accession_number;
          if (existingAccessionSet.has(acc)) {
            skipped++;
            errorDetails.push(
              `Accession Number "${acc}" ရှိပြီးသားဖြစ်၍ ကျော်သွားပါသည် (already in database).`,
            );
            continue;
          }
          if (seenInChunk.has(acc)) {
            skipped++;
            errorDetails.push(
              `Accession Number "${acc}" ဤ Excel file ထဲတွင် ထပ်နေသဖြင့် ကျော်သွားပါသည် (duplicate within this import).`,
            );
            continue;
          }
          seenInChunk.add(acc);
          finalCopiesToInsert.push(copy);
        }
      }

      let chunkImportedCount = 0;
      let chunkFailed = false;
      let chunkFailReason = "";

      try {
        await withTransaction(async (session) => {
          if (shelvesToInsert.length) {
            await Shelf.insertMany(shelvesToInsert, {
              session,
              ordered: false,
            });
          }
          if (shelfRevives.length) {
            await Shelf.updateMany(
              { _id: { $in: shelfRevives } },
              { $set: { is_deleted: false, deleted_at: null } },
              { session },
            );
          }
          if (booksToInsert.length) {
            await Book.insertMany(booksToInsert, { session, ordered: false });
          }
          if (bookUpdateOps.length) {
            await Book.bulkWrite(bookUpdateOps, { session, ordered: false });
          }

          if (finalCopiesToInsert.length > 0) {
            try {
              const inserted = await BookCopy.insertMany(finalCopiesToInsert, {
                session,
                ordered: false,
              });
              chunkImportedCount += inserted.length;
            } catch (bulkErr) {
              // ★ Should now be rare — duplicates are pre-filtered above. If this
              //   still fires (e.g. a concurrent import inserted the same accession
              //   number after our pre-check but before this insert), the transaction
              //   is already poisoned — we cannot selectively skip and continue it.
              //   Rethrow with a clear message so the whole chunk rolls back cleanly;
              //   re-running the import will pre-filter it correctly next time.
              const writeErrors = bulkErr.writeErrors || [];
              const dupAccessions = writeErrors
                .map((e) => finalCopiesToInsert[e.index]?.accession_number)
                .filter(Boolean);
              if (dupAccessions.length) {
                bulkErr.message = `Duplicate accession number(s) detected during insert (likely a concurrent import): ${dupAccessions.join(", ")}`;
              }
              throw bulkErr;
            }
          }
        });
      } catch (err) {
        chunkFailed = true;
        chunkFailReason = err.message;
      }

      if (chunkFailed) {
        errors += copiesToInsert.length;
        errorDetails.push(
          `Chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed and was rolled back: ${chunkFailReason}`,
        );
      } else {
        imported += chunkImportedCount;
      }
    }

    return { imported, skipped, errors, errorDetails };
  } catch (error) {
    console.log("Excel Import Error:", error.message);
    throw error;
  }
};

module.exports = { importExcelService };
