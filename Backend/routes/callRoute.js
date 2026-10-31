const { Router } = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getIceServers, getCallHistory } = require("../controller/callController");

const router = Router();
router.get("/ice-servers", authMiddleware, getIceServers);
router.get("/history/:userId", authMiddleware, getCallHistory);

module.exports = router;
