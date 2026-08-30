const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const budgetService = require("../services/budget_service");
const { logAudit } = require("../utils/audit");
const { getIO } = require("../sockets/socketServer");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
function getUserId(req) {
  return req.user.id || req.user._id;
}

function emitBudgetUpdate() {
  try {
    getIO().to("role:ADMIN").emit("dashboard:budget-updated");
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }
}

const getAll = asyncHandler(async (req, res) => {
  const budgets = await budgetService.getAll(
    req.query.includeDeleted === "true",
  );
  Msg(res, "Budget list retrieved.", budgets);
});

const getById = asyncHandler(async (req, res) => {
  const budget = await budgetService.getById(req.params.id);
  if (!budget) throw httpError("Budget not found.", 404);
  Msg(res, "Budget retrieved.", budget);
});

const create = asyncHandler(async (req, res) => {
  const exist = await budgetService.getByFiscalYear(req.body.fiscal_year);
  if (exist)
    throw httpError(
      `Budget for fiscal year ${req.body.fiscal_year} already exists.`,
      409,
    );

  const budget = await budgetService.create({
    fiscal_year: req.body.fiscal_year,
    total_amount: req.body.total_amount,
    notes: req.body.notes,
    created_by: getUserId(req),
  });

  await logAudit(req, {
    action: "BUDGET_CREATED",
    resource: `budget:${budget._id}`,
  });
  emitBudgetUpdate();

  Msg(res, "Budget created.", budget, 201);
});

const update = asyncHandler(async (req, res) => {
  const budget = await budgetService.getById(req.params.id);
  if (!budget || budget.is_deleted) throw httpError("Budget not found.", 404);

  const allowed = {};
  if (req.body.total_amount !== undefined) {
    if (req.body.total_amount < budget.used_amount) {
      throw httpError(
        `total_amount cannot be less than already-used amount (${budget.used_amount}).`,
        400,
      );
    }
    allowed.total_amount = req.body.total_amount;
  }
  if (req.body.notes !== undefined) allowed.notes = req.body.notes;

  const updated = await budgetService.update(req.params.id, allowed);
  await logAudit(req, {
    action: "BUDGET_UPDATED",
    resource: `budget:${req.params.id}`,
  });
  emitBudgetUpdate();
  Msg(res, "Budget updated.", updated);
});

const softDelete = asyncHandler(async (req, res) => {
  const budget = await budgetService.getById(req.params.id);
  if (!budget || budget.is_deleted) throw httpError("Budget not found.", 404);
  if (budget.used_amount > 0)
    throw httpError("Cannot delete a budget with recorded spending.", 409);

  await budgetService.softDelete(req.params.id);
  await logAudit(req, {
    action: "BUDGET_DELETED",
    resource: `budget:${req.params.id}`,
    severity: "WARNING",
  });
  emitBudgetUpdate();

  Msg(res, `Budget for fiscal year ${budget.fiscal_year} deleted.`);
});

const restore = asyncHandler(async (req, res) => {
  const budget = await budgetService.getById(req.params.id);
  if (!budget) throw httpError("Budget not found.", 404);
  if (!budget.is_deleted) throw httpError("Budget is already active.", 400);
  await budgetService.restore(req.params.id);
  await logAudit(req, {
    action: "BUDGET_RESTORED",
    resource: `budget:${req.params.id}`,
    severity: "INFO",
  });
  emitBudgetUpdate();
  Msg(res, `Budget for fiscal year ${budget.fiscal_year} restored.`);
});

const hardDelete = asyncHandler(async (req, res) => {
  const budget = await budgetService.getById(req.params.id);
  if (!budget) throw httpError("Budget not found.", 404);
  if (!budget.is_deleted)
    throw httpError("Budget must be soft-deleted first.", 400);
  await budgetService.hardDelete(req.params.id);
  await logAudit(req, {
    action: "BUDGET_PERMANENTLY_DELETED",
    resource: `budget:${req.params.id}`,
    severity: "CRITICAL",
  });
  emitBudgetUpdate();
  Msg(res, `Budget for fiscal year ${budget.fiscal_year} permanently deleted.`);
});

module.exports = {
  getAll,
  getById,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
};
