const express = require("express");
const router = express.Router();
const controller = require("../controllers/notification_controller");
const { validateToken } = require(`../${process.env.FACADE_PATH}`);

router.get("/", validateToken, controller.getAll);
router.patch("/:id/read", validateToken, controller.markRead);
router.patch("/read-all", validateToken, controller.markAllRead);
router.delete("/:id", validateToken, controller.remove);
module.exports = router;
