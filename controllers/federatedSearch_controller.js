const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/federatedSearch_service");

const search = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Federated search results.",
    await service.searchAcrossInstitutions(req.query.q),
  );
});
module.exports = { search };
