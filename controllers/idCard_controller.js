const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/idCard_service");

const getBulkCardData = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Card data fetched.",
    await service.getBulkCardData(req.body.user_ids),
  );
});

const getCardDataForUser = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Card data fetched.",
    await service.getCardDataForUser(req.params.userId),
  );
});

module.exports = { getBulkCardData, getCardDataForUser };
