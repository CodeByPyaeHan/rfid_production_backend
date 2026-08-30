const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/external_service");

const searchCatalog = asyncHandler(async (req, res) => {
  Msg(res, "Search results.", await service.searchCatalog(req.query.q));
});
const verifyUser = asyncHandler(async (req, res) => {
  Msg(res, "Verification result.", await service.verifyUser(req.body.username));
});
const notifyCheckout = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Loan recorded.",
    await service.recordExternalLoan(req.callingInstitution, req.body),
  );
});

module.exports = { searchCatalog, verifyUser, notifyCheckout };
