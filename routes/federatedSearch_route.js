const express = require("express");
const router = express.Router();
const controller = require("../controllers/federatedSearch_controller");
const { validateToken } = require(`../${process.env.FACADE_PATH}`);

router.get("/", controller.search);

module.exports = router;
