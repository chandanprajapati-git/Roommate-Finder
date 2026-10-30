const { Router } = require("express");

const {
  sendRequest,
  getReceivedRequests,
  updateRequestStatus,
  getAcceptedUsers,
} = require("../controller/requestController");

const authmiddleware = require("../middleware/authMiddleware");

const router = Router();

router.post("/sendrequest", authmiddleware, sendRequest);

router.get("/received/:userId", authmiddleware, getReceivedRequests);

router.get("/accepted", authmiddleware, getAcceptedUsers);

router.patch("/:requestId/status", authmiddleware, updateRequestStatus);
module.exports = router;
