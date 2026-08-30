const mqtt = require("mqtt");
const mongoose = require("mongoose");
const User = require("../models/user_model");
const BookCopy = require("../models/bookCopy_model");
const Fine = require("../models/fine_model");
const circulationService = require("./circulation_service");
const InOutLog = require("../models/userInOutLog_model");
const inOutLogService = require("./userInOutLog_service");
const scanLogService = require("./scanLog_service");
const Device = require("../models/device_model");
const { parseUserCardPayload } = require("../utils/rfidPayload");
const { activeLoginSessions } = require("../sockets/activeLoginSessions");
const { getIO } = require("../sockets/socketServer");

let scannerMode = "KIOSK";
let scannerModeTimer = null;

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

function setScannerMode(mode) {
  scannerMode = mode;
  console.log(`[Scanner] Mode switched to: ${mode}`);

  if (scannerModeTimer) clearTimeout(scannerModeTimer);

  if (mode === "LIBRARIAN") {
    scannerModeTimer = setTimeout(() => {
      scannerMode = "KIOSK";
      console.log("[Scanner] Auto-reverted to KIOSK mode.");
    }, 120000);
  }
}

const TOPIC_SUB = process.env.MQTT_TOPIC_SUB || "esp32/to/backend";
const TOPIC_PUB = process.env.MQTT_TOPIC_PUB || "backend/to/esp32";
const MIN_BOOKS = Number(process.env.MIN_BOOKS_PER_SESSION) || 1;

let client = null;

// borrow_limit: the {activeLoansCount, maxBooks} snapshot taken when the
// user's card was scanned.
// borrow_limit_status: derived live from borrow_limit + how many books are
// currently sitting in scanned_books — recomputed on every add/remove so
// the frontend always knows if the current pile exceeds the rule.
let sessionData = {
  currentStatus: "IDLE",
  user: null,
  scanned_books: [],
  returned_books: [],
  pending_write: null,
  last_error: null,
  scanner_status: "offline",
  borrow_limit: null,
  borrow_limit_status: null,
};
let sessionTimer = null;

function startSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    if (sessionData.currentStatus !== "IDLE") {
      resetSession();
      emit("nfc:session_timeout", {
        message: "Session expired due to inactivity.",
      });
      console.log("[Kiosk] Session expired due to inactivity.");
    }
  }, 60000);
}

async function authenticateDevice(deviceId, macAddress) {
  try {
    if (!deviceId || !macAddress) return false;

    const device = await Device.findOneAndUpdate(
      { _id: deviceId, mac_address: macAddress },
      { last_seen: new Date().toISOString() },
      { returnDocument: "after" },
    );

    return !!device;
  } catch (err) {
    console.error("Device auth error:", err.message);
    return false;
  }
}

function clearSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
}

// Full reset — used when there is genuinely nothing left pending
// (no scanned_books, no returned_books) after a confirm/cancel step,
// or on timeout. Clears the user too, so the kiosk is ready for the
// next person.
function resetSession() {
  clearSessionTimer();
  const currentScannerStatus = sessionData.scanner_status;
  sessionData = {
    currentStatus: "IDLE",
    user: null,
    scanned_books: [],
    returned_books: [],
    pending_write: null,
    last_error: null,
    scanner_status: currentScannerStatus,
    borrow_limit: null,
    borrow_limit_status: null,
  };
  emit("nfc:session_reset", {});
}

// Recomputes whether the currently-scanned borrow pile exceeds the rule.
// Call this any time scanned_books changes (add or remove) while a user
// is checked in. No-op if we never captured a borrow_limit for this user
// (e.g. BorrowRule/Circulation models unavailable).
function recomputeBorrowLimitStatus() {
  if (!sessionData.borrow_limit) {
    sessionData.borrow_limit_status = null;
    return;
  }
  const { activeLoansCount, maxBooks } = sessionData.borrow_limit;
  const scannedCount = sessionData.scanned_books.length;
  const projectedTotal = activeLoansCount + scannedCount;

  sessionData.borrow_limit_status = {
    active_loans: activeLoansCount,
    max_books: maxBooks,
    scanned_count: scannedCount,
    projected_total: projectedTotal,
    exceeded: projectedTotal > maxBooks,
    excess: Math.max(0, projectedTotal - maxBooks),
  };
}

// Clears only the borrow side of the session after a successful checkout
// (or lets the caller know nothing else is pending, so it's safe to fully
// reset). Never touches returned_books.
function finishBorrowStep() {
  sessionData.scanned_books = [];
  sessionData.borrow_limit = null;
  sessionData.borrow_limit_status = null;

  if (sessionData.returned_books.length === 0) {
    resetSession();
  } else {
    sessionData.currentStatus = "SCANNING_BOOKS";
    startSessionTimer();
  }
}

// Clears only the return side of the session after a successful return.
// Never touches scanned_books.
function finishReturnStep() {
  sessionData.returned_books = [];

  if (sessionData.scanned_books.length === 0) {
    resetSession();
  } else {
    sessionData.currentStatus = "SCANNING_BOOKS";
    startSessionTimer();
  }
}

function emit(event, payload) {
  try {
    getIO()
      .to("kiosk-room")
      .to("role:LIBRARIAN")
      .to("role:ADMIN")
      .emit(event, payload);
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }
}

function sendMqttFeedback(status, type) {
  if (!client) return;
  client.publish(
    TOPIC_PUB,
    JSON.stringify({ action: "response_feedback", status, type }),
  );
}

function publishReaderMode(action) {
  // action: "start" | "close"
  if (!client) {
    console.warn("[MQTT] publishReaderMode: client not connected");
    return;
  }
  client.publish(
    TOPIC_PUB, // "backend/to/esp32"
    JSON.stringify({ action }),
  );
  console.log(`[MQTT] Reader mode → ${action}`);
}

async function getBorrowLimitInfo(user) {
  const Circulation = mongoose.models.circulations;
  const BorrowRule = mongoose.models.borrowrules;
  const Student = mongoose.models.students;

  if (!Circulation || !BorrowRule) {
    console.warn("[getBorrowLimitInfo] models not registered", {
      Circulation: !!Circulation,
      BorrowRule: !!BorrowRule,
    });
    return { activeLoansCount: 0, maxBooks: Infinity };
  }

  // ★ Schema enum: BORROWED | RETURNED | LOST
  //   Overdue is a virtual — still status === "BORROWED"
  const activeLoansCount = await Circulation.countDocuments({
    user_id: user._id,
    status: "BORROWED",
  });

  let rule = null;

  if (user.role === "STUDENT" && Student) {
    const studentInfo = await Student.findOne({ user_id: user._id })
      .select("semester")
      .lean();

    // 1) semester-specific rule
    if (studentInfo?.semester) {
      rule = await BorrowRule.findOne({
        role: "STUDENT",
        semester: studentInfo.semester,
        is_deleted: false,
      });
    }

    // 2) generic STUDENT rule (no semester)
    if (!rule) {
      rule = await BorrowRule.findOne({
        role: "STUDENT",
        is_deleted: false,
        $or: [{ semester: null }, { semester: { $exists: false } }],
      });
    }
  } else {
    // STAFF / GUEST / other
    rule = await BorrowRule.findOne({
      role: user.role,
      is_deleted: false,
      $or: [{ semester: null }, { semester: { $exists: false } }],
    });
  }

  const maxBooks = rule?.max_books ?? 3;

  return { activeLoansCount, maxBooks };
}

async function handleUserCardRead(identifier, deviceId) {
  try {
    const actualDeviceId = deviceId || process.env.DEFAULT_DEVICE_ID;
    if (actualDeviceId) {
      scanLogService
        .add({
          device_id: actualDeviceId,
          rfid_code: identifier,
          scan_type: "user",
        })
        .catch((err) => console.error("[ScanLog] Error:", err.message));
    } else {
      console.warn("[ScanLog] Warning: No device_id provided for User scan.");
    }

    const { institutionCode, username } = parseUserCardPayload(identifier);

    if (institutionCode && institutionCode !== process.env.INSTITUTION_CODE) {
      return rejectCard(
        "This card is not registered at this library. Please see the librarian for external student services.",
      );
    }

    const user = await User.findOne({
      username: username,
      is_deleted: false,
    }).select("username name role status profile_picture");
    if (!user) return rejectCard("Card not recognized.");
    if (user.status !== "ACTIVE")
      return rejectCard(`Account is ${user.status.toLowerCase()}.`);

    const hasUnpaidFine = await Fine.exists({ user_id: user._id, paid: false });
    if (hasUnpaidFine)
      return rejectCard("Unpaid fines — please clear at the counter.");

    let limitInfo = null;
    try {
      limitInfo = await getBorrowLimitInfo(user);
      if (limitInfo.activeLoansCount >= limitInfo.maxBooks) {
        return rejectCard(
          `Borrow limit reached. You already have ${limitInfo.activeLoansCount}/${limitInfo.maxBooks} active loans.`,
        );
      }
    } catch (err) {
      console.error("Limit check error:", err.message);
    }

    sessionData.currentStatus = "USER_SCANNED";
    sessionData.user = {
      _id: user._id,
      username: user.username,
      name: user.name,
      role: user.role,
      profile_picture: user.profile_picture ?? null,
    };
    sessionData.last_error = null;
    sessionData.borrow_limit = limitInfo;
    recomputeBorrowLimitStatus();

    emit("nfc:user_scanned", sessionData.user);
    startSessionTimer();
  } catch (err) {
    console.error("handleUserCardRead error:", err.message);
    rejectCard("Server error while validating card.");
  }
}

function rejectCard(reason) {
  sessionData.last_error = reason;
  emit("nfc:invalid_card", { reason });
}

async function handleBookScanned(rfidTag, deviceId) {
  try {
    const actualDeviceId = deviceId || process.env.DEFAULT_DEVICE_ID;
    if (actualDeviceId) {
      scanLogService
        .add({
          device_id: actualDeviceId,
          rfid_code: rfidTag,
          scan_type: "book",
        })
        .catch((err) => console.error("[ScanLog] Error:", err.message));
    } else {
      console.warn("[ScanLog] Warning: No device_id provided for Book scan.");
    }

    const BOOK_PREFIX = process.env.RFID_BOOK_PREFIX || "";
    let searchAccession = rfidTag;
    if (BOOK_PREFIX && rfidTag.startsWith(BOOK_PREFIX)) {
      searchAccession = rfidTag.substring(BOOK_PREFIX.length);
    }

    const copy = await BookCopy.findOne({
      $or: [
        { accession_number: searchAccession },
        { accession_number: rfidTag },
        { rfid_tag_id: rfidTag },
      ],
    }).populate("book_id", "title cover_image_url");

    if (!copy) {
      emit("nfc:invalid_book", {
        reason: `Tag ${searchAccession} not recognized in catalog.`,
      });
      return;
    }

    const entry = {
      copy_id: copy._id.toString(),
      accession_number: copy.accession_number,
      rfid_tag_id: rfidTag,
      title: copy.book_id?.title ?? "Unknown Title",
      cover_image_url: copy.book_id?.cover_image_url ?? null,
    };

    if (copy.status === "borrowed") {
      if (sessionData.returned_books.some((b) => b.copy_id === entry.copy_id)) {
        startSessionTimer();
        return;
      }
      sessionData.returned_books.push(entry);
      sessionData.currentStatus = "SCANNING_BOOKS";

      emit("nfc:book_scanned", {
        book: entry,
        total: sessionData.scanned_books.length,
        session: sessionData,
      });
      startSessionTimer();
      return;
    } else if (copy.status === "available") {
      if (sessionData.scanned_books.some((b) => b.copy_id === entry.copy_id)) {
        startSessionTimer();
        return;
      }

      sessionData.scanned_books.push(entry);
      sessionData.currentStatus = "SCANNING_BOOKS";
      recomputeBorrowLimitStatus();

      emit("nfc:book_scanned", {
        book: entry,
        total: sessionData.scanned_books.length,
        session: sessionData,
      });
      startSessionTimer();
      return;
    } else {
      emit("nfc:invalid_book", {
        reason: `Not loanable/returnable (status: ${copy.status}).`,
        title: entry.title,
      });
    }
  } catch (err) {
    console.error("handleBookScanned error:", err.message);
  }
}

async function handleGateScan(uid) {
  try {
    const { institutionCode, username } = parseUserCardPayload(uid);

    if (institutionCode && institutionCode !== process.env.INSTITUTION_CODE) {
      console.warn(
        `[MQTT] Gate scan ignored: Card belongs to institution ${institutionCode}`,
      );
      return;
    }

    const user = await User.findOne({
      username: username.toLowerCase(),
      is_deleted: false,
    });
    if (!user)
      throw new Error(`User not found in database for username: ${username}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastLog = await InOutLog.findOne({
      user_id: user._id,
      scan_time: { $gte: today },
    }).sort({ scan_time: -1 });

    let autoLogType = "IN";

    if (lastLog && lastLog.log_type === "IN") {
      autoLogType = "OUT";
    }

    const logData = {
      identifier: username,
      log_type: autoLogType,
    };

    await inOutLogService.add(logData);

    console.log(
      `[MQTT] Gate scan logged for ${username} (Auto-detected: ${autoLogType})`,
    );
  } catch (err) {
    console.error("[MQTT] Gate scan failed:", err.message);
  }
}

async function handleWriteResult(uid, status) {
  try {
    if (status === "success" && sessionData.pending_write) {
      const { type, targetId, textToWrite } = sessionData.pending_write;

      if (type === "book") {
        const BOOK_PREFIX = process.env.RFID_BOOK_PREFIX || "";
        let accession = targetId;
        if (BOOK_PREFIX && accession.startsWith(BOOK_PREFIX)) {
          accession = accession.substring(BOOK_PREFIX.length);
        }

        const copy = await BookCopy.findOne({ accession_number: accession });

        if (copy) {
          const updateData = {
            rfid_tag_id: textToWrite,
            is_rfid_written: true,
          };

          if (copy.status === "pending_rfid") {
            updateData.status = "available";
          }

          await BookCopy.findByIdAndUpdate(copy._id, updateData);

          console.log(
            `[Kiosk] ✅ Book ${accession} tag written (status: ${updateData.status ?? copy.status}).`,
          );
        } else {
          console.log(`[Kiosk] ⚠️ Book ${accession} not found in database.`);
        }
      } else if (type === "user") {
        await User.findOneAndUpdate(
          { username: targetId },
          { status: "ACTIVE" },
        );
        console.log(`[Kiosk] ✅ User ${targetId} activated.`);
      }
    } else if (status === "success" && !sessionData.pending_write) {
      console.log(
        `[Kiosk] ⚠️ Write success received, but no pending_write found in session.`,
      );
    }
  } catch (err) {
    console.error("Database update failed after RFID write:", err.message);
  }

  resetSession();
  emit("nfc:write_result", { uid, status });
}

async function onMessage(topic, msg) {
  console.log(`\n📥 [MQTT IN] Topic: ${topic} | Message: ${msg.toString()}`);
  if (topic === "kiosk/status") {
    const statusStr = msg.toString();
    if (statusStr === "offline") {
      const now = new Date().toLocaleTimeString();
      console.log(`⚠️ [${now}] [ALERT] Kiosk disconnected unexpectedly!`);
      console.log(
        "⚠️ [ALERT] Kiosk disconnected unexpectedly (Power cut / Network drop)!",
      );
      sessionData.scanner_status = "offline";
      emit("nfc:scanner_heartbeat", { status: "offline" });
    } else if (statusStr === "online") {
      sessionData.scanner_status = "online";
      emit("nfc:scanner_heartbeat", { status: "active" });
    }
    return;
  }

  if (topic !== TOPIC_SUB) return;
  let data;
  try {
    data = JSON.parse(msg.toString());
  } catch {
    return;
  }

  const isAuthorized = await authenticateDevice(
    data.device_id,
    data.mac_address,
  );
  if (!isAuthorized) {
    console.warn(
      `⚠️ [SECURITY] Blocked fake payload from ID: ${data.device_id}, MAC: ${data.mac_address}`,
    );
    return;
  }
  switch (data.event) {
    case "login_card_scan":
      const sessionToken = activeLoginSessions.get(data.device_id);

      if (sessionToken) {
        const { institutionCode } = parseUserCardPayload(data.uid);

        if (
          institutionCode &&
          institutionCode !== process.env.INSTITUTION_CODE
        ) {
          console.warn(
            `[MQTT] Login blocked: Card belongs to institution ${institutionCode}`,
          );

          sendMqttFeedback("fail", "login_scan");
          break;
        }
        sendMqttFeedback("success", "login_scan");
        getIO()
          .to(`rfid-session:${sessionToken}`)
          .emit("nfc:login_card_scanned", { uid: data.uid });
      } else {
        console.warn(
          `[MQTT] ❌ No active login session found for device ID: "${data.device_id}". Make sure the Frontend uses this exact ID.`,
        );
        sendMqttFeedback("fail", "login_scan");
      }
      break;
    case "single_read":
      sendMqttFeedback("success", "single_read");
      if (scannerMode === "LIBRARIAN") {
        getIO()
          .to("role:LIBRARIAN")
          .emit("admin:guest_card_scanned", { uid: data.uid });
      } else {
        handleUserCardRead(data.uid, data.device_id);
      }
      break;
    case "book_detected":
      sendMqttFeedback("success", "multiple_read");

      if (scannerMode === "LIBRARIAN") {
        const BookCopy = require("../models/bookCopy_model");
        const BOOK_PREFIX = process.env.RFID_BOOK_PREFIX || "";
        let searchAccession = data.uid;
        if (BOOK_PREFIX && data.uid.startsWith(BOOK_PREFIX)) {
          searchAccession = data.uid.substring(BOOK_PREFIX.length);
        }

        BookCopy.findOne({
          $or: [
            { accession_number: searchAccession },
            { accession_number: data.uid },
          ],
        })
          .populate("book_id", "title")
          .then((copy) => {
            if (copy && ["available", "pending_rfid"].includes(copy.status)) {
              getIO()
                .to("role:LIBRARIAN")
                .emit("admin:guest_book_scanned", {
                  copy: { _id: copy._id, is_available: true },
                  book: {
                    title: copy.book_id.title,
                    accession_number: copy.accession_number,
                  },
                });
            }
          });
      } else {
        handleBookScanned(data.uid, data.device_id);
      }
      break;
    case "write_result":
      sendMqttFeedback(
        data.status === "success" ? "success" : "fail",
        "write_lock",
      );
      handleWriteResult(data.uid, data.status);
      break;
    case "device_status":
      if (data.status === "online") {
        sessionData.scanner_status = "online";
        emit("nfc:scanner_heartbeat", {
          device_id: data.device_id,
          status: "active",
        });
      }
      break;
    case "gate_scan": {
      const { institutionCode } = parseUserCardPayload(data.uid);
      if (institutionCode && institutionCode !== process.env.INSTITUTION_CODE) {
        console.warn(
          `[MQTT] Gate scan blocked: Card belongs to institution ${institutionCode}`,
        );
        sendMqttFeedback("fail", "gate_scan");
        break;
      }

      sendMqttFeedback("success", "gate_scan");
      handleGateScan(data.uid, data.device_id);
      break;
    }
    case "multiple_read_timeout":
      resetSession();
      emit("nfc:books_cleared", { reason: "timeout" });
      break;
  }
}

function init() {
  client = mqtt.connect(process.env.MQTT_BROKER_URL);
  client.on("connect", () => {
    console.log("[MQTT] Connected.");
    client.subscribe(TOPIC_SUB);
    client.subscribe("kiosk/status");
  });
  client.on("message", onMessage);
  client.on("error", (err) =>
    console.error("[MQTT] Connection error:", err.message),
  );
  client.on("close", () => console.log("[MQTT] Connection closed."));
}

function publishWriteRequest(type, targetId, text) {
  sessionData.currentStatus = "WAITING_FOR_WRITE";
  sessionData.pending_write = { type, targetId, textToWrite: text };

  if (client)
    client.publish(
      TOPIC_PUB,
      JSON.stringify({ action: "write_request", data: text }),
    );
}

async function confirmBorrow() {
  if (!sessionData.user) throw httpError("No user card scanned.", 400);
  if (sessionData.scanned_books.length < MIN_BOOKS)
    throw httpError(
      `Scan at least ${MIN_BOOKS} book(s) before confirming.`,
      400,
    );

  // Defensive re-check — the frontend should already disable the button
  // when this is true, but never trust that alone.
  if (sessionData.borrow_limit_status?.exceeded) {
    const { active_loans, max_books, scanned_count, excess } =
      sessionData.borrow_limit_status;
    throw httpError(
      `Borrow limit exceeded. This user has ${active_loans} active loan(s) and ${scanned_count} book(s) scanned, but the limit is ${max_books}. Remove ${excess} book(s) and try again.`,
      400,
    );
  }

  const userId = sessionData.user._id;
  const results = [];

  for (const book of sessionData.scanned_books) {
    try {
      const circulation = await circulationService.checkout(
        book.copy_id,
        userId,
        userId,
        null,
      );
      results.push({
        ...book,
        success: true,
        circulation_id: circulation._id.toString(),
        due_date: circulation.due_date,
      });
    } catch (err) {
      results.push({ ...book, success: false, error: err.message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  sendMqttFeedback(successCount > 0 ? "success" : "fail", "borrow_complete");

  const summary = {
    user: sessionData.user,
    results,
    success_count: successCount,
    total: results.length,
  };
  emit("nfc:borrow_confirmed", summary);
  finishBorrowStep(); // ← only clears the borrow side; returns survive
  return summary;
}

async function confirmReturn() {
  if (sessionData.returned_books.length === 0)
    throw httpError("No books scanned for return.", 400);

  const results = [];
  const Circulation =
    mongoose.models.circulations || mongoose.models.Circulation;

  for (const book of sessionData.returned_books) {
    try {
      const activeCirc = await Circulation.findOne({
        copy_id: book.copy_id,
        status: "BORROWED",
      });

      if (!activeCirc) {
        throw new Error(
          `Active loan (BORROWED) not found for ${book.title || book.accession_number}.`,
        );
      }

      await circulationService.processReturn(
        activeCirc._id.toString(),
        "GOOD",
        null,
      );

      results.push({
        ...book,
        success: true,
        circulation_id: activeCirc._id.toString(),
      });
    } catch (err) {
      results.push({ ...book, success: false, error: err.message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  sendMqttFeedback(successCount > 0 ? "success" : "fail", "return_complete");

  const summary = {
    results,
    success_count: successCount,
    total: results.length,
  };
  emit("nfc:return_confirmed", summary);

  finishReturnStep(); // ← only clears the return side; borrows survive
  return summary;
}

function cancelBook(copyId) {
  let removed = false;

  const beforeScanned = sessionData.scanned_books.length;
  sessionData.scanned_books = sessionData.scanned_books.filter(
    (b) => b.copy_id !== copyId,
  );
  if (sessionData.scanned_books.length !== beforeScanned) {
    removed = true;
    recomputeBorrowLimitStatus(); // removing a book may bring it back under the limit
  }

  const beforeReturned = sessionData.returned_books.length;
  sessionData.returned_books = sessionData.returned_books.filter(
    (b) => b.copy_id !== copyId,
  );
  if (sessionData.returned_books.length !== beforeReturned) removed = true;

  if (!removed) throw httpError("Book not found in the current session.", 404);

  if (
    sessionData.scanned_books.length === 0 &&
    sessionData.returned_books.length === 0 &&
    sessionData.user
  ) {
    sessionData.currentStatus = "USER_SCANNED";
  }

  emit("nfc:book_cancelled", { copy_id: copyId, session: sessionData });
  startSessionTimer();
  return { ...sessionData };
}

function cancelSession() {
  resetSession();
  return { success: true };
}

function getSession() {
  return { ...sessionData };
}

module.exports = {
  init,
  publishWriteRequest,
  confirmBorrow,
  confirmReturn,
  getSession,
  cancelSession,
  cancelBook,
  setScannerMode,
  publishReaderMode,
};
