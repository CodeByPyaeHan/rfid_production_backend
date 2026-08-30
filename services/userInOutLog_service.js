const mongoose = require("mongoose");
const model = require("../models/userInOutLog_model");
const User = require("../models/user_model");
const csv = require("csv-parser");
const { Parser } = require("json2csv");
const { Readable } = require("stream");

function httpError(msg, status) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

const add = async ({ identifier, log_type }) => {
  if (!identifier?.trim()) throw httpError("identifier is required.", 400);
  if (!["IN", "OUT"].includes(log_type))
    throw httpError("log_type must be IN or OUT.", 400);

  const user = await User.findOne({
    username: identifier.trim().toLowerCase(),
    is_deleted: false,
  });
  if (!user) throw httpError("Card not recognized.", 404);
  if (user.status !== "ACTIVE")
    throw httpError(
      `Account is ${user.status.toLowerCase()} — gate access denied.`,
      403,
    );

  const log = await new model({ user_id: user._id, log_type }).save();

  const populated = await model
    .findById(log._id)
    .populate("user_id", "username name role");
  const { getIO } = require("../sockets/socketServer");
  try {
    getIO().to("inout-monitor").emit("inout:scan", populated);
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }

  return populated;
};

const getById = async (id) => await model.findById(id);

const drop = async (id) => await model.findByIdAndDelete(id);

const getAll = async (query = {}) => {
  const {
    page = 1,
    log_type,
    user_id,
    search,
    role,
    startDate,
    endDate,
  } = query;

  const limit = Number(process.env.LOG_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter = {};
  if (log_type) filter.log_type = log_type;
  if (user_id) filter.user_id = user_id;

  if (startDate || endDate) {
    filter.scan_time = {};
    if (startDate) filter.scan_time.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.scan_time.$lte = end;
    }
  }

  if (search || role) {
    const userFilter = {};

    if (search) {
      userFilter.$or = [
        { username: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      userFilter.role = role;
    }

    const users = await User.find(userFilter).select("_id");
    filter.user_id = { $in: users.map((u) => u._id) };
  }

  const [logs, total] = await Promise.all([
    model
      .find(filter)
      .populate("user_id", "username name role")
      .sort({ scan_time: -1 })
      .skip(skip)
      .limit(limit),
    model.countDocuments(filter),
  ]);

  return {
    logs,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const getRangeLogs = async (startDate, endDate) => {
  if (!startDate || !endDate)
    throw httpError("startDate and endDate are required.", 400);

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime()))
    throw httpError("Invalid date format.", 400);
  if (start > end) throw httpError("startDate must be before endDate.", 400);

  end.setHours(23, 59, 59, 999);

  return await model
    .find({ scan_time: { $gte: start, $lte: end } })
    .populate("user_id", "username name role")
    .sort({ scan_time: 1 })
    .lean();
};

const exportJSON = async (startDate, endDate) => {
  const logs = await getRangeLogs(startDate, endDate);

  return {
    version: 1,
    entity: "inoutlogs",
    start_date: startDate,
    end_date: endDate,
    exported_at: new Date(),
    total_records: logs.length,
    data: logs,
  };
};

const exportCSV = async (startDate, endDate) => {
  const result = await exportJSON(startDate, endDate);

  const rows = result.data.map((item) => ({
    user_id: item.user_id?._id ?? "",
    username: item.user_id?.username ?? "",
    name: item.user_id?.name ?? "",
    role: item.user_id?.role ?? "",
    log_type: item.log_type,
    scan_time: item.scan_time,
  }));

  const parser = new Parser({
    fields: ["user_id", "username", "name", "role", "log_type", "scan_time"],
  });
  return rows.length
    ? parser.parse(rows)
    : "user_id,username,name,role,log_type,scan_time\n";
};

const validateAndPartitionRows = async (rows) => {
  const errors = [];
  const candidates = [];
  const now = new Date();

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;

    if (!row.user_id) {
      errors.push({ row: rowNum, reason: "Missing user_id.", data: row });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(row.user_id)) {
      errors.push({
        row: rowNum,
        reason: "Invalid user_id format.",
        data: row,
      });
      return;
    }
    if (!["IN", "OUT"].includes(row.log_type)) {
      errors.push({
        row: rowNum,
        reason: "log_type must be IN or OUT.",
        data: row,
      });
      return;
    }

    const scanTime =
      row.scan_time instanceof Date ? row.scan_time : new Date(row.scan_time);
    if (isNaN(scanTime.getTime())) {
      errors.push({ row: rowNum, reason: "Invalid scan_time.", data: row });
      return;
    }
    if (scanTime > now) {
      errors.push({
        row: rowNum,
        reason: "scan_time is in the future — rejected.",
        data: row,
      });
      return;
    }

    candidates.push({
      row: rowNum,
      user_id: row.user_id,
      log_type: row.log_type,
      scan_time: scanTime,
    });
  });

  // ── Batch user existence check ──
  const userIds = [...new Set(candidates.map((c) => c.user_id))];
  const existingUsers = await User.find({
    _id: { $in: userIds },
    is_deleted: false,
  }).select("_id");
  const existingUserIdSet = new Set(existingUsers.map((u) => u._id.toString()));

  const withUserCheck = [];
  candidates.forEach((c) => {
    if (!existingUserIdSet.has(c.user_id.toString())) {
      errors.push({
        row: c.row,
        reason: "User not found (may be deleted).",
        data: c,
      });
    } else {
      withUserCheck.push(c);
    }
  });

  // ── In-batch duplicate check ──
  const seen = new Set();
  const deduped = [];
  withUserCheck.forEach((c) => {
    const key = `${c.user_id}|${c.log_type}|${c.scan_time.toISOString()}`;
    if (seen.has(key)) {
      errors.push({
        row: c.row,
        reason: "Duplicate row within the import file.",
        data: c,
      });
    } else {
      seen.add(key);
      deduped.push(c);
    }
  });

  // ── DB duplicate check ──
  let existing = [];
  if (deduped.length) {
    existing = await model
      .find({
        $or: deduped.map((c) => ({
          user_id: c.user_id,
          log_type: c.log_type,
          scan_time: c.scan_time,
        })),
      })
      .lean();
  }
  const existingKeySet = new Set(
    existing.map(
      (e) => `${e.user_id}|${e.log_type}|${e.scan_time.toISOString()}`,
    ),
  );

  const toInsert = [];
  deduped.forEach((c) => {
    const key = `${c.user_id}|${c.log_type}|${c.scan_time.toISOString()}`;
    if (existingKeySet.has(key)) {
      errors.push({
        row: c.row,
        reason: "Duplicate — already exists in database.",
        data: c,
      });
    } else {
      toInsert.push(c);
    }
  });

  return { toInsert, errors };
};

const bulkInsert = async (rows) => {
  const { toInsert, errors } = await validateAndPartitionRows(rows);

  let inserted = 0;
  if (toInsert.length) {
    const docs = toInsert.map((c) => ({
      user_id: c.user_id,
      log_type: c.log_type,
      scan_time: c.scan_time,
    }));
    const result = await model.insertMany(docs, { ordered: false });
    inserted = result.length;
  }

  return {
    total: rows.length,
    inserted,
    rejected: errors.length,
    errors, // ★ row-level reason ပါတဲ့ list — frontend မှာ ပြန်ပြနိုင်
  };
};

const importJSON = async (buffer) => {
  let body;
  try {
    body = JSON.parse(buffer.toString());
  } catch {
    throw httpError("Invalid JSON file.", 400);
  }
  if (body.entity !== "inoutlogs")
    throw httpError("Invalid archive — entity mismatch.", 400);
  if (!Array.isArray(body.data))
    throw httpError("Archive data must be an array.", 400);

  const rows = body.data.map((item) => ({
    user_id: item.user_id?._id ?? item.user_id,
    log_type: item.log_type,
    scan_time: item.scan_time,
  }));

  return await bulkInsert(rows);
};

const importCSV = async (buffer) => {
  const rows = [];
  await new Promise((resolve, reject) => {
    Readable.from(buffer)
      .pipe(csv())
      .on("data", (row) => {
        rows.push({
          user_id: row.user_id,
          log_type: row.log_type,
          scan_time: row.scan_time,
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return await bulkInsert(rows);
};

module.exports = {
  add,
  getById,
  getAll,
  drop,
  getRangeLogs,
  exportJSON,
  exportCSV,
  importJSON,
  importCSV,
  bulkInsert,
};
