
const { Router } = require("express");

const {
  sendRequest,
  getReceivedRequests,
  getSentRequests,
  cancelRequest,
  getPendingRequestCount,
  markPendingRequestsRead,
  updateRequestStatus,
  getAcceptedUsers,
  removeAcceptedConnection,
} = require("../controller/requestController");

const authmiddleware = require("../middleware/authMiddleware");

const router = Router();

router.post("/sendrequest", authmiddleware, sendRequest);

router.get("/received/:userId", authmiddleware, getReceivedRequests);

router.get("/sent", authmiddleware, getSentRequests);

router.delete("/:requestId", authmiddleware, cancelRequest);

router.get("/pending-count", authmiddleware, getPendingRequestCount);

router.patch("/read-pending", authmiddleware, markPendingRequestsRead);

router.get("/accepted", authmiddleware, getAcceptedUsers);

router.delete("/accepted/:userId", authmiddleware, removeAcceptedConnection);

router.patch("/:requestId/status", authmiddleware, updateRequestStatus);

module.exports = router;
