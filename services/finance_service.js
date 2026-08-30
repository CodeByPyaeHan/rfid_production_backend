const budgetService = require("./budget_service");
const bookPurchaseService = require("./bookPurchase_service");
const expenditureService = require("./expenditure_service");
const { withTransaction } = require("./transaction_service");

function httpError(msg, status) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

function dateFilter(field, start, end) {
  if (!start && !end) return {};
  const range = {};
  if (start) range.$gte = new Date(start);
  if (end) {
    const e = new Date(end);
    e.setHours(23, 59, 59, 999);
    range.$lte = e;
  }
  return { [field]: range };
}

const checkBudget = async (budgetId, amount, session) => {
  const budget = await budgetService.getById(budgetId, session);
  if (!budget || budget.is_deleted) throw httpError("Budget not found.", 404);
  const remaining = budget.total_amount - budget.used_amount;
  if (remaining < amount)
    throw httpError(
      `Insufficient budget. Remaining: ${remaining}, needed: ${amount}.`,
      400,
    );
  return budget;
};

async function assertNotLinkedToPurchase(expenditureId) {
  const linked = await bookPurchaseService.list({
    expenditure_id: expenditureId,
    is_deleted: false,
  });
  if (linked.length > 0) {
    throw httpError(
      "This expenditure is linked to a book purchase. Edit or delete via Book Purchase instead.",
      409,
    );
  }
}

// ═══════════════════════ BOOK PURCHASE ═══════════════════════

// ★ FIX: total_amount → total_price throughout (field mismatch)
// ★ FIX: expenditure auto-created (required field was never satisfied before)
// ★ FIX: total_price always server-computed (quantity × unit_price)

const createBookPurchase = async (data, userId) => {
  return await withTransaction(async (session) => {
    const total_price = Number((data.quantity * data.unit_price).toFixed(2));
    const budget = await checkBudget(data.budget_id, total_price, session);

    // 1. Auto-create linked Expenditure (repo-level create — no independent budget increment here)
    const expenditure = await expenditureService.create(
      {
        budget_id: data.budget_id,
        category: "BOOK_PURCHASE",
        amount: total_price,
        description: `Book purchase — ${data.vendor_name}`,
        expense_date: data.purchase_date,
        created_by: userId,
      },
      session,
    );

    // 2. Create the purchase, referencing that expenditure
    const purchase = await bookPurchaseService.create(
      {
        expenditure_id: expenditure._id,
        budget_id: data.budget_id,
        book_id: data.book_id,
        quantity: data.quantity,
        unit_price: data.unit_price,
        total_price,
        vendor_name: data.vendor_name.trim(),
        purchase_date: data.purchase_date,
        created_by: userId,
      },
      session,
    );

    // 3. Increment budget ONCE (not per expenditure + per purchase — avoids double count)
    await budgetService.increaseUsedAmount(budget._id, total_price, session);

    return purchase;
  });
};

const updateBookPurchase = async (id, data) => {
  return await withTransaction(async (session) => {
    const oldPurchase = await bookPurchaseService.getById(id, session);
    if (!oldPurchase || oldPurchase.is_deleted)
      throw httpError("Purchase not found.", 404);

    const quantity = data.quantity ?? oldPurchase.quantity;
    const unit_price = data.unit_price ?? oldPurchase.unit_price;
    const newTotal = Number((quantity * unit_price).toFixed(2)); // ★ recomputed, not trusted
    const oldTotal = oldPurchase.total_price;
    const difference = newTotal - oldTotal;

    if (difference > 0) {
      await checkBudget(oldPurchase.budget_id, difference, session);
      await budgetService.increaseUsedAmount(
        oldPurchase.budget_id,
        difference,
        session,
      );
    } else if (difference < 0) {
      await budgetService.decreaseUsedAmount(
        oldPurchase.budget_id,
        Math.abs(difference),
        session,
      );
    }

    // ★ Sync linked expenditure so the two records never drift apart
    await expenditureService.update(
      oldPurchase.expenditure_id,
      {
        amount: newTotal,
        expense_date: data.purchase_date ?? oldPurchase.purchase_date,
        ...(data.vendor_name && {
          description: `Book purchase — ${data.vendor_name}`,
        }),
      },
      session,
    );

    return await bookPurchaseService.update(
      id,
      {
        quantity,
        unit_price,
        total_price: newTotal,
        ...(data.vendor_name && { vendor_name: data.vendor_name.trim() }),
        ...(data.purchase_date && { purchase_date: data.purchase_date }),
        ...(data.book_id && { book_id: data.book_id }),
      },
      session,
    );
  });
};

const softDeleteBookPurchase = async (id) => {
  return await withTransaction(async (session) => {
    const purchase = await bookPurchaseService.getById(id, session);
    if (!purchase || purchase.is_deleted)
      throw httpError("Purchase not found.", 404);

    await budgetService.decreaseUsedAmount(
      purchase.budget_id,
      purchase.total_price,
      session,
    );
    await expenditureService.softDelete(purchase.expenditure_id, session); // ★ cascade
    await bookPurchaseService.softDelete(id, session);
    return purchase;
  });
};

const restoreBookPurchase = async (id) => {
  return await withTransaction(async (session) => {
    const purchase = await bookPurchaseService.getById(id, session);
    if (!purchase) throw httpError("Purchase not found.", 404);
    if (!purchase.is_deleted)
      throw httpError("Purchase is already active.", 400);

    await checkBudget(purchase.budget_id, purchase.total_price, session); // ★ ensure room still exists
    await budgetService.increaseUsedAmount(
      purchase.budget_id,
      purchase.total_price,
      session,
    );
    await expenditureService.restore(purchase.expenditure_id, session);
    return await bookPurchaseService.restore(id, session);
  });
};

const hardDeleteBookPurchase = async (id) => {
  return await withTransaction(async (session) => {
    const purchase = await bookPurchaseService.getById(id, session);
    if (!purchase) throw httpError("Purchase not found.", 404);
    if (!purchase.is_deleted)
      throw httpError("Purchase must be soft-deleted first.", 400);
    await expenditureService.hardDelete(purchase.expenditure_id, session);
    await bookPurchaseService.hardDelete(id, session);
    return purchase;
  });
};

const getPurchaseById = async (id) => {
  const purchase = await bookPurchaseService.getById(id);
  if (!purchase) throw httpError("Purchase not found.", 404);
  return purchase;
};
const getAllPurchases = async (query = {}) =>
  await bookPurchaseService.getAll(query);

// ═══════════════════════ EXPENDITURE (manual, category=OTHERS only) ═══════════════════════

const createExpenditure = async (data, userId) => {
  return await withTransaction(async (session) => {
    const budget = await checkBudget(data.budget_id, data.amount, session);
    const expenditure = await expenditureService.create(
      { ...data, category: "OTHERS", created_by: userId },
      session,
    );
    await budgetService.increaseUsedAmount(budget._id, data.amount, session);
    return expenditure;
  });
};

const updateExpenditure = async (id, data) => {
  return await withTransaction(async (session) => {
    const old = await expenditureService.getById(id, session);
    if (!old || old.is_deleted) throw httpError("Expenditure not found.", 404);
    await assertNotLinkedToPurchase(id); // ★ guard

    const newAmount = data.amount ?? old.amount;
    const difference = newAmount - old.amount;

    if (difference > 0) {
      await checkBudget(old.budget_id, difference, session);
      await budgetService.increaseUsedAmount(
        old.budget_id,
        difference,
        session,
      );
    } else if (difference < 0) {
      await budgetService.decreaseUsedAmount(
        old.budget_id,
        Math.abs(difference),
        session,
      );
    }
    return await expenditureService.update(id, data, session);
  });
};

const softDeleteExpenditure = async (id) => {
  return await withTransaction(async (session) => {
    const expenditure = await expenditureService.getById(id, session);
    if (!expenditure || expenditure.is_deleted)
      throw httpError("Expenditure not found.", 404);
    await assertNotLinkedToPurchase(id); // ★ guard

    await budgetService.decreaseUsedAmount(
      expenditure.budget_id,
      expenditure.amount,
      session,
    );
    return await expenditureService.softDelete(id, session);
  });
};

const restoreExpenditure = async (id) => {
  return await withTransaction(async (session) => {
    const expenditure = await expenditureService.getById(id, session);
    if (!expenditure) throw httpError("Expenditure not found.", 404);
    if (!expenditure.is_deleted)
      throw httpError("Expenditure is already active.", 400);

    await checkBudget(expenditure.budget_id, expenditure.amount, session);
    await budgetService.increaseUsedAmount(
      expenditure.budget_id,
      expenditure.amount,
      session,
    );
    return await expenditureService.restore(id, session);
  });
};

const hardDeleteExpenditure = async (id) => {
  const expenditure = await expenditureService.getById(id);
  if (!expenditure) throw httpError("Expenditure not found.", 404);
  if (!expenditure.is_deleted)
    throw httpError("Expenditure must be soft-deleted first.", 400);
  await assertNotLinkedToPurchase(id);
  await expenditureService.hardDelete(id);
  return expenditure;
};

const getExpenditureById = async (id) => {
  const exp = await expenditureService.getById(id);
  if (!exp) throw httpError("Expenditure not found.", 404);
  return exp;
};
const getAllExpenditures = async (query = {}) =>
  await expenditureService.getAll(query);

// ═══════════════════════ REPORTS / DASHBOARD ═══════════════════════

// ★ FIX: total_expense no longer double-counts (purchases already appear as their
//   own linked expenditure — sum once, break out purchase share separately)
const getDashboard = async (query = {}) => {
  const { budget_id, start_date, end_date } = query;

  const baseFilter = { is_deleted: false, ...(budget_id && { budget_id }) };
  const purchases = await bookPurchaseService.list({
    ...baseFilter,
    ...dateFilter("purchase_date", start_date, end_date),
  });
  const expenditures = await expenditureService.list({
    ...baseFilter,
    ...dateFilter("expense_date", start_date, end_date),
  });

  const purchaseTotal = purchases.reduce((s, x) => s + x.total_price, 0);
  const expenditureTotal = expenditures.reduce((s, x) => s + x.amount, 0); // already includes purchase amounts

  return {
    total_expense: expenditureTotal,
    total_book_purchase: purchaseTotal,
    total_other_expenditure: expenditureTotal - purchaseTotal,
    purchase_count: purchases.length,
    expenditure_count: expenditures.length,
  };
};

// ★ FIX: createdAt → purchase_date/expense_date (business date, not insert timestamp)
const getMonthlyReport = async (year, month) => {
  if (!year || !month) throw httpError("year and month are required.", 400);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const purchases = await bookPurchaseService.list({
    purchase_date: { $gte: start, $lte: end },
    is_deleted: false,
  });
  const expenditures = await expenditureService.list({
    expense_date: { $gte: start, $lte: end },
    is_deleted: false,
  });

  const purchase_amount = purchases.reduce((s, x) => s + x.total_price, 0);
  const expenditure_amount = expenditures.reduce((s, x) => s + x.amount, 0);

  return {
    month,
    year,
    total_expenditure: expenditure_amount,
    book_purchase_amount: purchase_amount,
    other_expenditure_amount: expenditure_amount - purchase_amount,
  };
};

const getCategoryReport = async () => {
  const expenditures = await expenditureService.list({ is_deleted: false });
  const result = {};
  expenditures.forEach((item) => {
    result[item.category] = (result[item.category] || 0) + item.amount;
  });
  return result;
};

// ★ FIX: exclude BOOK_PURCHASE-category expenditures from the feed (already
//   represented as their own BookPurchase entry — prevents duplicate rows)
const getTransactionHistory = async (query = {}) => {
  const { budget_id, start_date, end_date } = query;
  const baseFilter = { is_deleted: false, ...(budget_id && { budget_id }) };

  const purchases = await bookPurchaseService.list({
    ...baseFilter,
    ...dateFilter("purchase_date", start_date, end_date),
  });
  const expenditures = await expenditureService.list({
    ...baseFilter,
    category: "OTHERS",
    ...dateFilter("expense_date", start_date, end_date),
  });

  const transactions = [
    ...purchases.map((item) => ({
      type: "BOOK_PURCHASE",
      amount: item.total_price,
      date: item.purchase_date,
      data: item,
    })),
    ...expenditures.map((item) => ({
      type: "EXPENDITURE",
      amount: item.amount,
      date: item.expense_date,
      data: item,
    })),
  ];
  return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const getBudgetSummary = async (budgetId) => {
  const budget = await budgetService.getById(budgetId);
  if (!budget || budget.is_deleted) throw httpError("Budget not found.", 404);
  const remaining = budget.total_amount - budget.used_amount;
  const usagePercentage =
    budget.total_amount > 0
      ? (budget.used_amount / budget.total_amount) * 100
      : 0; // ★ guard div-by-zero
  return {
    total_amount: budget.total_amount,
    used_amount: budget.used_amount,
    remaining_amount: remaining,
    usage_percentage: Number(usagePercentage.toFixed(2)),
  };
};

module.exports = {
  createBookPurchase,
  updateBookPurchase,
  softDeleteBookPurchase,
  restoreBookPurchase,
  hardDeleteBookPurchase,
  getPurchaseById,
  getAllPurchases,
  createExpenditure,
  updateExpenditure,
  softDeleteExpenditure,
  restoreExpenditure,
  hardDeleteExpenditure,
  getExpenditureById,
  getAllExpenditures,
  checkBudget,
  getBudgetSummary,
  getDashboard,
  getMonthlyReport,
  getCategoryReport,
  getTransactionHistory,
};
