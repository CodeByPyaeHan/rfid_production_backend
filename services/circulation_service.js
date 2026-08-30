const mongoose = require("mongoose");
const Circulation = require("../models/circulation_model");
const BookCopy = require("../models/bookCopy_model");
const Book = require("../models/book_model");
const User = require("../models/user_model");
const Student = require("../models/student_model");
const Fine = require("../models/fine_model");
const borrowRuleService = require("./borrowRule_service");
const fineRuleService = require("./fineRule_service");
const Reservation = require("../models/reservation_model");
const reservationService = require("./reservation_service");
const { withTransaction } = require("./transaction_service");
const { getIO } = require("../sockets/socketServer");
const notificationService = require("./notification_service");
const { buildTransactionEntry } = require("../utils/transactionFormatter");
const externalVerifyService = require("./externalVerify_service");
const externalNotifyService = require("./externalNotify_service");
const { parseUserCardPayload } = require("../utils/rfidPayload");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const lookupStudents = async (search) => {
  if (!search || search.trim().length < 2) return [];
  const regex = new RegExp(search.trim(), "i");

  const rollMatches = await Student.find({ roll_number: regex })
    .select("user_id roll_number")
    .limit(10);
  const rollUserIds = rollMatches.map((s) => s.user_id);

  const users = await User.find({
    role: "STUDENT",
    is_deleted: false,
    $or: [
      { name: regex },
      { username: regex },
      { phone: regex },
      { _id: { $in: rollUserIds } },
    ],
  })
    .select("username name")
    .limit(10);

  const students = await Student.find({
    user_id: { $in: users.map((u) => u._id) },
  }).select("user_id roll_number");
  const rollMap = Object.fromEntries(
    students.map((s) => [s.user_id.toString(), s.roll_number]),
  );

  return users.map((u) => ({
    _id: u._id,
    username: u.username,
    name: u.name,
    roll_number: rollMap[u._id.toString()] ?? null,
  }));
};

const getStudentPreview = async (userId) => {
  const user = await User.findOne({
    _id: userId,
    is_deleted: false,
    role: "STUDENT",
  }).populate({
    path: "student",
    populate: { path: "semester", select: "name short_name" },
  });
  if (!user) throw httpError("Student not found.", 404);

  const activeBorrowCount = await Circulation.countDocuments({
    user_id: userId,
    status: "BORROWED",
  });

  const unpaidAgg = await Fine.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId), paid: false } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const fineBalance = unpaidAgg[0]?.total || 0;

  let rule = null;
  let eligibility = "ELIGIBLE";
  const reasons = [];

  if (user.status !== "ACTIVE") {
    eligibility = "BLOCKED";
    reasons.push(`Account status: ${user.status}`);
  }
  if (fineBalance > 0) {
    eligibility = "BLOCKED";
    reasons.push(`Unpaid fine: ${fineBalance} MMK`);
  }

  try {
    const resolved = await borrowRuleService.resolve(userId);
    rule = resolved.rule;
    if (activeBorrowCount >= rule.max_books) {
      eligibility = "BLOCKED";
      reasons.push(`Borrow limit reached (${rule.max_books})`);
    }
  } catch (err) {
    if (err.status === 404) {
      eligibility = "BLOCKED";
      reasons.push("No borrow rule configured.");
    } else throw err;
  }

  return {
    user: {
      _id: user._id,
      username: user.username,
      name: user.name,
      status: user.status,
    },
    student: user.student,
    active_borrow_count: activeBorrowCount,
    max_books: rule?.max_books ?? null,
    loan_period_days: rule?.loan_period_days ?? null,
    fine_balance: fineBalance,
    eligibility,
    reasons,
  };
};

const lookupCopies = async (search) => {
  if (!search || search.trim().length < 2) return [];
  const regex = new RegExp(search.trim(), "i");

  const matchedBooks = await Book.find({ title: regex })
    .select("_id")
    .limit(10);
  const copies = await BookCopy.find({
    $or: [
      { accession_number: regex },
      { rfid_tag_id: regex },
      { book_id: { $in: matchedBooks.map((b) => b._id) } },
    ],
  })
    .populate("book_id", "title author")
    .limit(10);

  return copies.map((c) => ({
    _id: c._id,
    accession_number: c.accession_number,
    status: c.status,
    title: c.book_id?.title ?? null,
    author: c.book_id?.author ?? null,
  }));
};

const getCopyPreview = async (copyId) => {
  const copy = await BookCopy.findById(copyId)
    .populate("book_id", "title author loan_policy")
    .populate("shelf_id", "shelf_code");
  if (!copy) throw httpError("Book copy not found.", 404);

  return {
    copy: {
      _id: copy._id,
      accession_number: copy.accession_number,
      rfid_tag_id: copy.rfid_tag_id,
      status: copy.status,
      shelf_location: copy.shelf_id?.shelf_code ?? null,
    },
    book: copy.book_id
      ? {
          title: copy.book_id.title,
          author: copy.book_id.author,
          loan_policy: copy.book_id.loan_policy,
        }
      : null,
    is_available: ["available", "pending_rfid"].includes(copy.status),
  };
};

const checkout = async (copyId, userId, staffId, dueDateOverride = null) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const copy = await BookCopy.findById(copyId).session(session);
    if (!copy) throw httpError("Book copy not found.", 404);

    let reservationToFulfill = null;
    if (copy.status === "reserved") {
      reservationToFulfill = await Reservation.findOne({
        copy_id: copyId,
        status: "READY_FOR_PICKUP",
      }).session(session);
      if (!reservationToFulfill)
        throw httpError(
          "This copy is on hold but has no active reservation. Contact a librarian.",
          409,
        );
      if (reservationToFulfill.user_id.toString() !== userId.toString()) {
        throw httpError("This book is reserved for another student.", 403);
      }
    } else if (!["available", "pending_rfid"].includes(copy.status)) {
      throw httpError(`Copy is not available (status: ${copy.status}).`, 409);
    }
    const book = await Book.findById(copy.book_id).session(session);
    if (book?.loan_policy === "NOT_LOANABLE")
      throw httpError("This book is not loanable.", 403);

    const eligibility = await checkUserEligibility(userId, session);
    if (!eligibility.eligible) throw httpError(eligibility.reason, 403);
    const user = eligibility.user;

    if (
      book?.loan_policy === "STAFF_ONLY" &&
      ["STUDENT", "GUEST"].includes(user.role)
    )
      throw httpError("This book is restricted to staff/librarian.", 403);

    const { rule } = await borrowRuleService.resolve(userId);
    const activeCount = await Circulation.countDocuments({
      user_id: userId,
      status: "BORROWED",
    }).session(session);
    if (activeCount >= rule.max_books)
      throw httpError(
        `Borrow limit reached (${rule.max_books} books max).`,
        403,
      );

    let due_date;
    if (dueDateOverride) {
      due_date = new Date(dueDateOverride);
      if (isNaN(due_date.getTime())) throw httpError("Invalid due date.", 400);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (due_date < todayStart)
        throw httpError("Due date cannot be in the past.", 400);
    } else {
      due_date = new Date();
      due_date.setDate(due_date.getDate() + rule.loan_period_days);
    }

    const circulation = await new Circulation({
      copy_id: copyId,
      user_id: userId,
      due_date,
      checked_out_by: staffId,
    }).save({ session });
    copy.status = "borrowed";
    await copy.save({ session });

    if (reservationToFulfill) {
      reservationToFulfill.status = "FULFILLED";
      reservationToFulfill.fulfilled_at = new Date();
      reservationToFulfill.circulation_id = circulation._id;
      reservationToFulfill.handled_by = staffId;
      await reservationToFulfill.save({ session });
    }

    registerAfterCommit(async () => {
      try {
        const populated = await Circulation.findById(circulation._id)
          .populate("user_id", "username name role")
          .populate({
            path: "copy_id",
            populate: { path: "book_id", select: "title" },
          });
        const entry = buildTransactionEntry(populated, "CHECKOUT");

        getIO()
          .to("role:LIBRARIAN")
          .to("role:ADMIN")
          .emit("dashboard:transaction", entry);
        getIO()
          .to("role:LIBRARIAN")
          .to("role:ADMIN")
          .emit("circulation:checkout", {
            circulation_id: circulation._id,
            copy_id: copyId,
            user_id: userId,
          });
      } catch (err) {
        console.error("Socket emit failed:", err.message);
      }
    });

    return circulation;
  });
};

const rfidCheckout = async (copyIdentifier, rawUserIdentifier) => {
  const copy = await BookCopy.findOne({
    $or: [
      { accession_number: copyIdentifier },
      { rfid_tag_id: copyIdentifier },
    ],
  });
  if (!copy) throw httpError("Book copy not recognized.", 404);

  const { institutionCode, username } = parseUserCardPayload(rawUserIdentifier);
  if (institutionCode && institutionCode !== process.env.INSTITUTION_CODE) {
    throw httpError(
      "This card is not registered at this library. Please see the librarian for external student services.",
      403,
    );
  }

  const user = await User.findOne({ username, is_deleted: false });
  if (!user) throw httpError("Card not recognized.", 404);

  return await checkout(copy._id, user._id, user._id);
};

const processReturn = async (circulationId, condition, staffId) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const circulation =
      await Circulation.findById(circulationId).session(session);
    if (!circulation) throw httpError("Circulation record not found.", 404);
    if (circulation.status !== "BORROWED")
      throw httpError("This loan is not active.", 400);

    const now = new Date();
    circulation.return_date = now;
    circulation.returned_by = staffId;

    const copyStatusMap = {
      GOOD: "available",
      DAMAGED: "damaged",
      LOST: "lost",
    };
    circulation.status = condition === "LOST" ? "LOST" : "RETURNED";
    await circulation.save({ session });

    const copyDoc = await BookCopy.findById(circulation.copy_id).session(
      session,
    );
    const book = await Book.findById(copyDoc.book_id).session(session);

    if (!copyDoc) throw httpError("Book copy not found.", 404);

    let claimedReservation = null;
    if (condition === "GOOD") {
      claimedReservation = await reservationService.claimCopyForNextReservation(
        copyDoc.book_id,
        circulation.copy_id,
        session,
        registerAfterCommit,
      );
    } else {
      const copyStatusMap = { DAMAGED: "damaged", LOST: "lost" };
      await BookCopy.findByIdAndUpdate(
        circulation.copy_id,
        { status: copyStatusMap[condition] },
        { session },
      );
    }

    // ── Overdue fine ──
    let overdueFine = null,
      fineRuleMissing = false;
    if (now > circulation.due_date) {
      const daysLate = Math.ceil((now - circulation.due_date) / 86400000);
      try {
        const { rule } = await fineRuleService.resolve(
          circulation.user_id,
          "OVERDUE",
        );
        const chargeableDays = Math.max(
          0,
          daysLate - (rule.grace_period_days || 0),
        );
        if (chargeableDays > 0) {
          let amount = chargeableDays * rule.rate_per_day;
          if (rule.max_fine_cap != null)
            amount = Math.min(amount, rule.max_fine_cap);
          overdueFine = await new Fine({
            circulation_id: circulation._id,
            user_id: circulation.user_id,
            fine_type: "OVERDUE",
            amount,
          }).save({ session });

          // FINE_ISSUED notification — overdue fine
          await notificationService.send(
            circulation.user_id,
            "FINE_ISSUED",
            {
              reference_type: "FINE",
              reference_id: overdueFine._id,
              vars: {
                book_title: book?.title ?? "",
                amount: overdueFine.amount,
                reason: `Overdue return (${chargeableDays} day(s) late)`,
              },
            },
            session,
            registerAfterCommit,
          );
        }
      } catch (err) {
        if (err.status === 404) fineRuleMissing = true;
        else throw err;
      }
    }

    // ── Condition fine (DAMAGED / LOST) ──
    let conditionFine = null,
      conditionFineRuleMissing = false;
    if (condition === "DAMAGED" || condition === "LOST") {
      try {
        const { rule } = await fineRuleService.resolve(
          circulation.user_id,
          condition,
        );
        conditionFine = await new Fine({
          circulation_id: circulation._id,
          user_id: circulation.user_id,
          fine_type: condition,
          amount: rule.flat_amount,
        }).save({ session });

        //  FINE_ISSUED notification — condition fine
        await notificationService.send(
          circulation.user_id,
          "FINE_ISSUED",
          {
            reference_type: "FINE",
            reference_id: conditionFine._id,
            vars: {
              book_title: book?.title ?? "",
              amount: conditionFine.amount,
              reason:
                condition === "LOST"
                  ? "Book reported lost"
                  : "Book returned damaged",
            },
          },
          session,
          registerAfterCommit,
        );
      } catch (err) {
        if (err.status === 404) conditionFineRuleMissing = true;
        else throw err;
      }
    }

    registerAfterCommit(async () => {
      try {
        const populated = await Circulation.findById(circulation._id)
          .populate("user_id", "username name role")
          .populate({
            path: "copy_id",
            populate: { path: "book_id", select: "title" },
          })
          .populate("returned_by", "name");
        const type =
          condition === "LOST"
            ? "LOST"
            : condition === "DAMAGED"
              ? "DAMAGED_RETURN"
              : "RETURN";
        const entry = buildTransactionEntry(populated, type, {
          handledBy: populated.returned_by?.name ?? null,
        });

        getIO()
          .to("role:LIBRARIAN")
          .to("role:ADMIN")
          .emit("dashboard:transaction", entry);
        getIO()
          .to("role:LIBRARIAN")
          .to("role:ADMIN")
          .emit("circulation:return", {
            circulation_id: circulation._id,
            condition,
          });
      } catch (err) {
        console.error("Socket emit failed:", err.message);
      }
    });

    return {
      circulation,
      overdueFine,
      conditionFine,
      claimedReservation,
      fineRuleMissing,
      conditionFineRuleMissing,
    };
  });
};

const getById = async (id) =>
  await Circulation.findById(id)
    .populate("user_id", "username name role")
    .populate("checked_out_by", "username name")
    .populate("returned_by", "username name")
    .populate({
      path: "copy_id",
      populate: { path: "book_id", select: "title author" },
    });

const getAll = async (query = {}) => {
  const { page = 1, user_id, status, overdue, copy_id } = query;
  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter = {};
  if (user_id) filter.user_id = user_id;
  if (copy_id) filter.copy_id = copy_id;
  if (status) filter.status = status;
  if (overdue === "true") {
    filter.status = "BORROWED";
    filter.due_date = { $lt: new Date() };
  }

  const [circulations, total] = await Promise.all([
    Circulation.find(filter)
      .populate({
        path: "user_id",
        select: "username name role home_institution",
        populate: { path: "home_institution", select: "full_name code" },
      })
      .populate({
        path: "copy_id",
        populate: { path: "book_id", select: "title author" },
      })
      .sort({ checkout_date: -1 })
      .skip(skip)
      .limit(limit),
    Circulation.countDocuments(filter),
  ]);
  return {
    circulations,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const getHistory = async (query = {}) => {
  const { page = 1, search, status, start_date, end_date, handled_by } = query;
  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const matchStage = { status: { $in: ["RETURNED", "LOST"] } };
  if (start_date || end_date) {
    matchStage.return_date = {};
    if (start_date) matchStage.return_date.$gte = new Date(start_date);
    if (end_date) {
      const e = new Date(end_date);
      e.setHours(23, 59, 59, 999);
      matchStage.return_date.$lte = e;
    }
  }
  if (handled_by)
    matchStage.returned_by = new mongoose.Types.ObjectId(handled_by);

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "bookcopies",
        localField: "copy_id",
        foreignField: "_id",
        as: "copy",
      },
    },
    { $unwind: "$copy" },
    {
      $lookup: {
        from: "books",
        localField: "copy.book_id",
        foreignField: "_id",
        as: "book",
      },
    },
    { $unwind: "$book" },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $lookup: {
        from: "students",
        localField: "user_id",
        foreignField: "user_id",
        as: "studentProfile",
      },
    },
    { $unwind: { path: "$studentProfile", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "returned_by",
        foreignField: "_id",
        as: "handledByUser",
      },
    },
    { $unwind: { path: "$handledByUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "fines",
        localField: "_id",
        foreignField: "circulation_id",
        as: "fines",
      },
    },
    {
      $addFields: {
        has_damaged_fine: {
          $anyElementTrue: {
            $map: {
              input: "$fines",
              as: "f",
              in: { $eq: ["$$f.fine_type", "DAMAGED"] },
            },
          },
        },
        total_fine_collected: { $sum: "$fines.amount" },
      },
    },
    {
      $addFields: {
        return_category: {
          $switch: {
            branches: [
              { case: { $eq: ["$status", "LOST"] }, then: "LOST" },
              { case: "$has_damaged_fine", then: "DAMAGED" },
              { case: { $gt: ["$return_date", "$due_date"] }, then: "OVERDUE" },
            ],
            default: "NORMAL",
          },
        },
      },
    },
  ];

  if (status) pipeline.push({ $match: { return_category: status } });
  if (search) {
    const regex = new RegExp(search, "i");
    pipeline.push({
      $match: {
        $or: [
          { "user.name": regex },
          { "user.username": regex },
          { "studentProfile.roll_number": regex },
          { "book.title": regex },
        ],
      },
    });
  }
  pipeline.push({ $sort: { return_date: -1 } });

  const countResult = await Circulation.aggregate([
    ...pipeline,
    { $count: "total" },
  ]);
  const total = countResult[0]?.total || 0;

  const rows = await Circulation.aggregate([
    ...pipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        checkout_date: 1,
        due_date: 1,
        return_date: 1,
        status: 1,
        return_category: 1,
        "user._id": 1,
        "user.name": 1,
        "user.username": 1,
        "studentProfile.roll_number": 1,
        "book.title": 1,
        "book.author": 1,
        "copy.accession_number": 1,
        "copy.rfid_tag_id": 1,
        "handledByUser.name": 1,
        "handledByUser.username": 1,
        total_fine_collected: 1,
      },
    },
  ]);

  return {
    history: rows,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const getMyLoans = async (userId) => {
  const [active, history] = await Promise.all([
    Circulation.find({ user_id: userId, status: "BORROWED" })
      .populate({
        path: "copy_id",
        populate: { path: "book_id", select: "title author class_number" },
      })
      .sort({ due_date: 1 }),
    Circulation.find({ user_id: userId, status: { $in: ["RETURNED", "LOST"] } })
      .populate({
        path: "copy_id",
        populate: { path: "book_id", select: "title author class_number" },
      })
      .sort({ return_date: -1 })
      .limit(50),
  ]);

  let maxRenewals = 0;
  try {
    const { rule } = await borrowRuleService.resolve(userId);
    maxRenewals = rule.max_renewals;
  } catch {}

  return { active, history, max_renewals: maxRenewals };
};

const getMyDashboard = async (userId) => {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 86400000);

  const [active, unpaidAgg, reservationCounts, totalBorrowed] =
    await Promise.all([
      Circulation.find({ user_id: userId, status: "BORROWED" })
        .populate({
          path: "copy_id",
          populate: { path: "book_id", select: "title author class_number" },
        })
        .sort({ due_date: 1 }),
      Fine.aggregate([
        {
          $match: { user_id: new mongoose.Types.ObjectId(userId), paid: false },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Reservation.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            status: { $in: ["PENDING", "READY_FOR_PICKUP"] },
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Circulation.countDocuments({ user_id: userId }),
    ]);

  const dueSoon = active.filter(
    (c) => c.due_date <= in3Days && c.due_date >= now,
  ).length;
  const overdue = active.filter((c) => c.due_date < now).length;
  const fineBalance = unpaidAgg[0]?.total || 0;
  const rMap = Object.fromEntries(
    reservationCounts.map((r) => [r._id, r.count]),
  );

  return {
    stats: {
      current_loans: active.length,
      due_soon: dueSoon,
      overdue,
      fine_balance: fineBalance,
      reservations: (rMap.PENDING || 0) + (rMap.READY_FOR_PICKUP || 0),
      ready_reservations: rMap.READY_FOR_PICKUP || 0,
      total_borrowed: totalBorrowed,
    },
    active_loans: active,
  };
};

const getMonthlyActivity = async (userId, year = new Date().getFullYear()) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const [borrowedAgg, returnedAgg] = await Promise.all([
    Circulation.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          checkout_date: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: { $month: "$checkout_date" }, count: { $sum: 1 } } },
    ]),
    Circulation.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          return_date: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: { $month: "$return_date" }, count: { $sum: 1 } } },
    ]),
  ]);

  const bMap = Object.fromEntries(borrowedAgg.map((b) => [b._id, b.count]));
  const rMap = Object.fromEntries(returnedAgg.map((r) => [r._id, r.count]));
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return months.map((month, idx) => ({
    month,
    borrowed: bMap[idx + 1] || 0,
    returned: rMap[idx + 1] || 0,
  }));
};

const renew = async (circulationId, requestingUser) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const circulation =
      await Circulation.findById(circulationId).session(session);
    if (!circulation) throw httpError("Circulation record not found.", 404);

    const isOwner =
      circulation.user_id.toString() ===
      (requestingUser.id || requestingUser._id).toString();
    const isStaff = ["STAFF", "LIBRARIAN", "ADMIN"].includes(
      requestingUser.role,
    );
    if (!isOwner && !isStaff)
      throw httpError("Not authorized to renew this loan.", 403);

    if (circulation.status !== "BORROWED")
      throw httpError("Only active loans can be renewed.", 400);
    if (circulation.due_date < new Date())
      throw httpError(
        "Overdue loans cannot be renewed — please return first.",
        400,
      );

    const copy = await BookCopy.findById(circulation.copy_id).session(session);
    const hasWaitingReservation = await Reservation.exists({
      book_id: copy.book_id,
      status: { $in: ["PENDING", "READY_FOR_PICKUP"] },
    }).session(session);
    if (hasWaitingReservation)
      throw httpError(
        "This book has a pending reservation — cannot renew. Please return it.",
        409,
      );

    const { rule } = await borrowRuleService.resolve(circulation.user_id);
    if (circulation.renewed_count >= rule.max_renewals)
      throw httpError(`Renewal limit reached (${rule.max_renewals} max).`, 403);

    circulation.due_date = new Date(
      circulation.due_date.getTime() + rule.loan_period_days * 86400000,
    );
    circulation.renewed_count += 1;
    await circulation.save({ session });
    return circulation;
  });
};

const checkUserEligibility = async (userId, session = null) => {
  let query = User.findOne({ _id: userId, is_deleted: false });
  if (session) query = query.session(session);
  const user = await query;
  if (!user) return { eligible: false, reason: "User not found." };
  if (user.status !== "ACTIVE")
    return {
      eligible: false,
      reason: `Account is ${user.status.toLowerCase()}.`,
    };

  let fineQuery = Fine.exists({ user_id: userId, paid: false });
  if (session) fineQuery = fineQuery.session(session);
  if (await fineQuery)
    return { eligible: false, reason: "Unpaid fines outstanding." };

  return { eligible: true, user };
};

function buildGuestUsername(institutionCode, identifier) {
  return `@guest_${institutionCode.toLowerCase()}_${identifier.replace(/^@/, "").toLowerCase()}`;
}

async function findOrCreateGuestUser(institution, identifier, name) {
  const guestUsername = buildGuestUsername(institution.code, identifier);
  let guest = await User.findOne({ username: guestUsername });
  if (!guest) {
    guest = await User.create({
      username: guestUsername,
      name,
      role: "GUEST",
      status: "ACTIVE",
      home_institution: institution._id,
      home_username: identifier,
    });
  } else if (guest.name !== name) {
    guest.name = name;
    await guest.save();
  }
  return guest;
}

async function countGuestActiveLoans(institutionCode, identifier) {
  const guestUsername = buildGuestUsername(institutionCode, identifier);
  const existingGuest = await User.findOne({ username: guestUsername }).select(
    "_id",
  );
  if (!existingGuest) return 0;
  return await Circulation.countDocuments({
    user_id: existingGuest._id,
    status: "BORROWED",
  });
}

const verifyGuestOnly = async (institutionId, identifier) => {
  const result = await externalVerifyService.verifyExternalUser(
    institutionId,
    identifier,
  );
  if (!result.valid) return { valid: false, reason: result.reason };

  const guestRule = await borrowRuleService.getDefaultForRole("GUEST");
  const maxBooks = guestRule?.max_books ?? 1;

  const activeLoans = await countGuestActiveLoans(
    result.institution.code,
    identifier,
  );
  const remainingQuota = Math.max(0, maxBooks - activeLoans);

  return {
    valid: true,
    name: result.name,
    role: result.role,
    max_books: maxBooks,
    active_loans: activeLoans,
    remaining_quota: remainingQuota,
  };
};

const guestCheckout = async (institutionId, identifier, copyId, staffId) => {
  const verifyResult = await externalVerifyService.verifyExternalUser(
    institutionId,
    identifier,
  );
  if (!verifyResult.valid)
    throw httpError(`Not eligible: ${verifyResult.reason}`, 403);

  const guestUser = await findOrCreateGuestUser(
    verifyResult.institution,
    identifier,
    verifyResult.name,
  );

  const circulation = await checkout(copyId, guestUser._id, staffId, null);

  const copy = await BookCopy.findById(copyId).populate("book_id", "title");
  externalNotifyService.notifyHomeInstitution(verifyResult.institution, {
    username: identifier,
    book_title: copy.book_id?.title ?? "Unknown",
    due_date: circulation.due_date,
  });

  return {
    circulation,
    guest_user: {
      name: guestUser.name,
      home_institution: verifyResult.institution.full_name,
    },
  };
};

module.exports = {
  lookupStudents,
  getStudentPreview,
  lookupCopies,
  getCopyPreview,
  checkout,
  processReturn,
  getById,
  getAll,
  getHistory,
  rfidCheckout,
  getMyLoans,
  getMyDashboard,
  getMonthlyActivity,
  renew,
  checkUserEligibility,
  verifyGuestOnly,
  guestCheckout,
};
