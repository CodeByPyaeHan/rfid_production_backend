const Reservation = require("../models/reservation_model");
const BookCopy = require("../models/bookCopy_model");
const Book = require("../models/book_model");
const User = require("../models/user_model");
const Circulation = require("../models/circulation_model");
const Fine = require("../models/fine_model");
const borrowRuleService = require("./borrowRule_service");
const notificationService = require("./notification_service");
const { withTransaction } = require("./transaction_service");
const { getIO } = require("../sockets/socketServer");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

function emitQueueUpdate(registerAfterCommit) {
  registerAfterCommit(async () => {
    try {
      const counts = await getPendingCount();
      getIO()
        .to("role:LIBRARIAN")
        .to("role:ADMIN")
        .emit("reservation:queue-updated");
      getIO()
        .to("role:LIBRARIAN")
        .to("role:ADMIN")
        .emit("reservation:pending-count-updated", counts);
    } catch (err) {
      console.error("Socket emit failed:", err.message);
    }
  });
}

function emitMyUpdate(userId, registerAfterCommit) {
  registerAfterCommit(() => {
    try {
      getIO().to(`user:${userId}`).emit("reservation:my-updated");
    } catch (err) {
      console.error("Socket emit failed:", err.message);
    }
  });
}

const getQueuePosition = async (bookId, reservedAt, session = null) => {
  let q = Reservation.countDocuments({
    book_id: bookId,
    status: "PENDING",
    reserved_at: { $lt: reservedAt },
  });
  if (session) q = q.session(session);
  return (await q) + 1;
};

const create = async (bookId, userId) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const book = await Book.findById(bookId).session(session);
    if (!book) throw httpError("Book not found.", 404);

    if (book.loan_policy === "NOT_LOANABLE") {
      throw httpError(
        "This book is for library use only and cannot be reserved.",
        403,
      );
    }

    const availableCount = await BookCopy.countDocuments({
      book_id: bookId,
      status: "available",
    }).session(session);
    if (availableCount > 0)
      throw httpError(
        "This book has available copies — please check out directly.",
        400,
      );

    const user = await User.findOne({ _id: userId, is_deleted: false }).session(
      session,
    );
    if (!user) throw httpError("User not found.", 404);

    if (book.loan_policy === "STAFF_ONLY" && user.role === "STUDENT") {
      throw httpError(
        "This book is restricted to staff/librarian borrowers.",
        403,
      );
    }

    if (user.status !== "ACTIVE")
      throw httpError(
        `Account is ${user.status.toLowerCase()} — cannot reserve.`,
        403,
      );

    const hasUnpaidFine = await Fine.exists({
      user_id: userId,
      paid: false,
    }).session(session);
    if (hasUnpaidFine)
      throw httpError("Unpaid fines must be cleared before reserving.", 403);

    const alreadyReserved = await Reservation.exists({
      book_id: bookId,
      user_id: userId,
      status: { $in: ["PENDING", "READY_FOR_PICKUP"] },
    }).session(session);
    if (alreadyReserved)
      throw httpError(
        "You already have an active reservation for this book.",
        409,
      );

    const bookCopies = await BookCopy.find({ book_id: bookId })
      .session(session)
      .select("_id");
    const alreadyBorrowing = await Circulation.exists({
      user_id: userId,
      status: "BORROWED",
      copy_id: { $in: bookCopies.map((c) => c._id) },
    }).session(session);
    if (alreadyBorrowing)
      throw httpError("You are already borrowing a copy of this book.", 409);

    const { rule } = await borrowRuleService.resolve(userId);
    const activeReservationCount = await Reservation.countDocuments({
      user_id: userId,
      status: { $in: ["PENDING", "READY_FOR_PICKUP"] },
    }).session(session);
    if (activeReservationCount >= rule.reserve_limit)
      throw httpError(
        `Reservation limit reached (${rule.reserve_limit} max).`,
        403,
      );

    const reservation = await new Reservation({
      book_id: bookId,
      user_id: userId,
      reserved_at: new Date(),
    }).save({ session });

    emitQueueUpdate(registerAfterCommit);
    emitMyUpdate(userId, registerAfterCommit);
    return reservation;
  });
};

const claimCopyForNextReservation = async (
  bookId,
  copyId,
  session,
  registerAfterCommit,
) => {
  const next = await Reservation.findOne({ book_id: bookId, status: "PENDING" })
    .sort({ reserved_at: 1 })
    .session(session);

  if (!next) {
    const copy = await BookCopy.findById(copyId).session(session);
    const nextStatus = copy?.is_rfid_written ? "available" : "pending_rfid";
    await BookCopy.findByIdAndUpdate(
      copyId,
      { status: nextStatus },
      { session },
    );
    return null;
  }

  let holdDays = 3;
  try {
    const { rule } = await borrowRuleService.resolve(next.user_id);
    holdDays = rule?.hold_period_days ?? 3;
  } catch {}

  const ready_at = new Date();
  const hold_expires_at = new Date(ready_at.getTime() + holdDays * 86400000);

  next.status = "READY_FOR_PICKUP";
  next.copy_id = copyId;
  next.ready_at = ready_at;
  next.hold_expires_at = hold_expires_at;
  await next.save({ session });

  await BookCopy.findByIdAndUpdate(copyId, { status: "reserved" }, { session });

  const [book, user] = await Promise.all([
    Book.findById(bookId).session(session),
    User.findById(next.user_id).session(session),
  ]);

  await notificationService.send(
    next.user_id,
    "RESERVATION_READY",
    {
      reference_type: "RESERVATION",
      reference_id: next._id,
      vars: {
        student_name: user?.name ?? "Student",
        book_title: book?.title ?? "",
        hold_days: holdDays,
        hold_expires_at: hold_expires_at.toDateString(),
      },
    },
    session,
    registerAfterCommit,
  );

  emitQueueUpdate(registerAfterCommit);
  emitMyUpdate(next.user_id, registerAfterCommit);

  return next;
};

const fulfill = async (reservationId, staffId) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const reservation =
      await Reservation.findById(reservationId).session(session);
    if (!reservation) throw httpError("Reservation not found.", 404);
    if (reservation.status !== "READY_FOR_PICKUP")
      throw httpError("This reservation is not ready for pickup.", 400);

    const user = await User.findOne({
      _id: reservation.user_id,
      is_deleted: false,
    }).session(session);
    if (!user) throw httpError("User not found.", 404);
    if (user.status !== "ACTIVE")
      throw httpError(
        `User account is ${user.status.toLowerCase()} — cannot issue.`,
        403,
      );

    const hasUnpaidFine = await Fine.exists({
      user_id: reservation.user_id,
      paid: false,
    }).session(session);
    if (hasUnpaidFine)
      throw httpError("User has unpaid fines — resolve before issuing.", 403);

    const { rule } = await borrowRuleService.resolve(reservation.user_id);
    const activeCount = await Circulation.countDocuments({
      user_id: reservation.user_id,
      status: "BORROWED",
    }).session(session);
    if (activeCount >= rule.max_books)
      throw httpError(`Borrow limit reached (${rule.max_books} max).`, 403);

    const due_date = new Date();
    due_date.setDate(due_date.getDate() + rule.loan_period_days);

    const circulation = await new Circulation({
      copy_id: reservation.copy_id,
      user_id: reservation.user_id,
      due_date,
      checked_out_by: staffId,
    }).save({ session });
    await BookCopy.findByIdAndUpdate(
      reservation.copy_id,
      { status: "borrowed" },
      { session },
    );

    reservation.status = "FULFILLED";
    reservation.fulfilled_at = new Date();
    reservation.circulation_id = circulation._id;
    reservation.handled_by = staffId;
    await reservation.save({ session });

    emitQueueUpdate(registerAfterCommit);
    emitMyUpdate(reservation.user_id, registerAfterCommit);

    return { reservation, circulation };
  });
};

const cancel = async (reservationId, actingUser) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const reservation =
      await Reservation.findById(reservationId).session(session);
    if (!reservation) throw httpError("Reservation not found.", 404);
    if (!["PENDING", "READY_FOR_PICKUP"].includes(reservation.status))
      throw httpError("This reservation cannot be cancelled.", 400);

    const isOwner =
      reservation.user_id.toString() ===
      (actingUser.id || actingUser._id).toString();
    const isStaff = ["STAFF", "LIBRARIAN", "ADMIN"].includes(actingUser.role);
    if (!isOwner && !isStaff)
      throw httpError("Not authorized to cancel this reservation.", 403);

    const wasReady = reservation.status === "READY_FOR_PICKUP";
    const heldCopyId = reservation.copy_id;
    const bookId = reservation.book_id;

    reservation.status = "CANCELLED";
    reservation.cancelled_at = new Date();
    await reservation.save({ session });

    const [book, user] = await Promise.all([
      Book.findById(bookId).session(session),
      User.findById(reservation.user_id).session(session),
    ]);

    await notificationService.send(
      reservation.user_id,
      "RESERVATION_CANCELLED",
      {
        reference_type: "RESERVATION",
        reference_id: reservation._id,
        vars: {
          student_name: user?.name ?? "Student",
          book_title: book?.title ?? "",
        },
      },
      session,
      registerAfterCommit,
    );

    if (wasReady && heldCopyId)
      await claimCopyForNextReservation(bookId, heldCopyId, session);

    getIO()
      .to("role:LIBRARIAN")
      .to("role:ADMIN")
      .emit("reservation:pending-count-updated", await getPendingCount());

    emitQueueUpdate(registerAfterCommit);
    emitMyUpdate(reservation.user_id, registerAfterCommit);

    return reservation;
  });
};

const expireOverdueHolds = async () => {
  const overdue = await Reservation.find({
    status: "READY_FOR_PICKUP",
    hold_expires_at: { $lt: new Date() },
  });
  let expiredCount = 0;
  for (const reservation of overdue) {
    try {
      await withTransaction(async (session, registerAfterCommit) => {
        const heldCopyId = reservation.copy_id;
        const bookId = reservation.book_id;
        reservation.status = "EXPIRED";
        await reservation.save({ session });

        const [book, user] = await Promise.all([
          Book.findById(bookId).session(session),
          User.findById(reservation.user_id).session(session),
        ]);
        await notificationService.secnd(
          reservation.user_id,
          "RESERVATION_EXPIRED",
          {
            reference_type: "RESERVATION",
            reference_id: reservation._id,
            vars: {
              student_name: user?.name ?? "Student",
              book_title: book?.title ?? "",
            },
          },
          session,
          registerAfterCommit,
        );
        emitQueueUpdate(registerAfterCommit);
        emitMyUpdate(reservation.user_id, registerAfterCommit);
        if (heldCopyId)
          await claimCopyForNextReservation(
            bookId,
            heldCopyId,
            session,
            registerAfterCommit,
          );
      });
      expiredCount++;
    } catch (err) {
      console.error(
        `Failed to expire reservation ${reservation._id}:`,
        err.message,
      );
    }
  }
  return { expiredCount };
};

const getById = async (id) =>
  await Reservation.findById(id)
    .populate("book_id", "title author")
    .populate("user_id", "username name role")
    .populate("copy_id", "accession_number")
    .populate("handled_by", "username name");

const getMyReservations = async (userId) => {
  const reservations = await Reservation.find({
    user_id: userId,
    status: { $in: ["PENDING", "READY_FOR_PICKUP", "EXPIRED"] },
  })
    .populate("book_id", "title author")
    .sort({ created_at: -1 });

  return await Promise.all(
    reservations.map(async (r) => ({
      ...r.toObject(),
      queue_position:
        r.status === "PENDING"
          ? await getQueuePosition(r.book_id._id, r.reserved_at)
          : null,
    })),
  );
};

const getQueue = async (query = {}) => {
  const { page = 1, status, search } = query;
  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const matchStage = {};
  matchStage.status = status
    ? status
    : { $in: ["PENDING", "READY_FOR_PICKUP", "EXPIRED"] };

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "books",
        localField: "book_id",
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
        from: "bookcopies",
        localField: "copy_id",
        foreignField: "_id",
        as: "copy",
      },
    },
    { $unwind: { path: "$copy", preserveNullAndEmptyArrays: true } },
  ];

  if (search) {
    const regex = new RegExp(search, "i");
    pipeline.push({
      $match: {
        $or: [
          { "user.name": regex },
          { "studentProfile.roll_number": regex },
          { "book.title": regex },
          { "copy.accession_number": regex },
        ],
      },
    });
  }

  pipeline.push({ $sort: { reserved_at: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      status: 1,
      queue_position: 1,
      reserved_at: 1,
      hold_expires_at: 1,
      user_id: "$user",
      book_id: "$book",
      copy_id: "$copy",
      studentProfile: 1,
    },
  });
  const countResult = await Reservation.aggregate([
    ...pipeline,
    { $count: "total" },
  ]);
  const total = countResult[0]?.total || 0;
  const rows = await Reservation.aggregate([
    ...pipeline,
    { $skip: skip },
    { $limit: limit },
  ]);

  for (const r of rows)
    r.queue_position =
      r.status === "PENDING"
        ? await getQueuePosition(r.book_id, r.reserved_at)
        : null;

  return {
    reservations: rows,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const getPendingCount = async () => {
  const [pending, ready] = await Promise.all([
    Reservation.countDocuments({ status: "PENDING" }),
    Reservation.countDocuments({ status: "READY_FOR_PICKUP" }),
  ]);
  return { pending_count: pending, ready_count: ready };
};

module.exports = {
  create,
  claimCopyForNextReservation,
  fulfill,
  cancel,
  expireOverdueHolds,
  getById,
  getMyReservations,
  getQueue,
  getQueuePosition,
  getPendingCount,
};
