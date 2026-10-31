const Request = require("../model/request");
const User = require("../model/user");
const { getIO, onlineUsers } = require("../config/socket");

const isRequirementFulfilled = (user) =>
  Number.isInteger(user?.totalBeds) && user.totalBeds > 0 &&
  Number.isInteger(user?.occupiedBeds) && user.occupiedBeds >= user.totalBeds;

// Send roommate request
const sendRequest = async (req, res) => {
  try {
    const sender = req.userId;
    const { receiver } = req.body;
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";

    if (!sender || !receiver) {
      return res.status(400).json({
        message: "Sender and receiver are required",
      });
    }

    if (note.length > 300) {
      return res.status(400).json({ message: "Request note must be 300 characters or fewer" });
    }

    if (sender.toString() === receiver.toString()) {
      return res.status(400).json({
        message: "You cannot send request to yourself",
      });
    }

    const receiverUser = await User.findById(receiver);

    if (!receiverUser) {
      return res.status(404).json({
        message: "Receiver not found",
      });
    }

    const senderUser = await User.findById(sender).select("blockedUsers");
    if (
      receiverUser.blockedUsers?.some((id) => id.toString() === sender.toString()) ||
      senderUser?.blockedUsers?.some((id) => id.toString() === receiver.toString())
    ) {
      return res.status(403).json({ message: "Unable to send request. You cannot contact this user." });
    }

    if (isRequirementFulfilled(receiverUser)) {
      return res.status(409).json({
        code: "ROOMMATE_REQUIREMENT_FULFILLED",
        message: "This roommate's room is full and they are not accepting new requests.",
      });
    }

    const existingRequest = await Request.findOne({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
      status: { $in: ["pending", "accepted"] },
    });

    if (existingRequest) {
      return res.status(409).json({
        message: "Request already exists",
      });
    }

    // Recheck immediately before writing so a newly recorded block cannot be
    // bypassed by a request form that was already open in another tab.
    const [latestSender, latestReceiver] = await Promise.all([
      User.findById(sender).select("blockedUsers"),
      User.findById(receiver).select("blockedUsers"),
    ]);
    if (
      latestReceiver?.blockedUsers?.some((id) => id.toString() === sender.toString()) ||
      latestSender?.blockedUsers?.some((id) => id.toString() === receiver.toString())
    ) {
      return res.status(403).json({ message: "Unable to send request. You cannot contact this user." });
    }

    const pairKey = [String(sender), String(receiver)].sort().join(":");
    let newRequest;
    try {
      newRequest = await Request.create({ sender, receiver, pairKey, note: note || undefined });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: "Request already exists" });
      }
      throw error;
    }

    // Real-time notification to receiver
    const io = getIO();
    const receiverSockets = onlineUsers.get(receiver.toString());

    if (io && receiverSockets) {
      receiverSockets.forEach((socketId) => {
        io.to(socketId).emit("newRoommateRequest", {
          request: newRequest,
        });
      });
    }

    return res.status(201).json({
      message: "Request sent successfully",
      request: newRequest,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get requests received by the logged-in user
const getReceivedRequests = async (req, res) => {
  try {
    const userId = req.userId;

    const requests = await Request.find({
      receiver: userId,
    })
      .populate("sender", "name city state age gender profileImage totalBeds occupiedBeds")
      .sort({ createdAt: -1 });

    const unreadCount = await Request.countDocuments({ receiver: userId, status: "pending", isRead: { $ne: true } });
    return res.status(200).json({
      message: "Received requests fetched successfully",
      requests,
      unreadCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get requests sent by the logged-in user
const getSentRequests = async (req, res) => {
  try {
    const requests = await Request.find({
      sender: req.userId,
    })
      .populate("receiver", "name city state age gender profileImage totalBeds occupiedBeds")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Sent requests fetched successfully",
      requests,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Cancel a pending request sent by the logged-in user
const cancelRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        message: "Request not found",
      });
    }

    if (request.sender.toString() !== req.userId.toString()) {
      return res.status(403).json({
        message: "You cannot cancel this request",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Only pending requests can be cancelled",
      });
    }

    const receiverId = request.receiver.toString();

    const deletedRequest = await Request.findOneAndDelete({
      _id: requestId,
      sender: req.userId,
      status: "pending",
    });
    if (!deletedRequest) {
      return res.status(409).json({ message: "Only pending requests can be cancelled" });
    }

    // Notify receiver so their requests list can refresh
    const io = getIO();
    const receiverSockets = onlineUsers.get(receiverId);

    if (io && receiverSockets) {
      receiverSockets.forEach((socketId) => {
        io.to(socketId).emit("roommateRequestCancelled", {
          requestId,
          senderId: req.userId,
        });
      });
    }

    return res.status(200).json({
      message: "Request cancelled successfully",
      requestId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get pending request count
const getPendingRequestCount = async (req, res) => {
  try {
    const count = await Request.countDocuments({
      receiver: req.userId,
      status: "pending",
      isRead: { $ne: true },
    });

    return res.status(200).json({
      count,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

const markPendingRequestsRead = async (req, res) => {
  try {
    const result = await Request.updateMany(
      { receiver: req.userId, status: "pending", isRead: { $ne: true } },
      { $set: { isRead: true } }
    );
    const userSockets = onlineUsers.get(req.userId.toString());
    userSockets?.forEach((socketId) => getIO()?.to(socketId).emit("pendingRequestsRead"));
    return res.status(200).json({ message: "Pending requests marked as read", modifiedCount: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Accept or reject a received request
const updateRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be accepted or rejected",
      });
    }

    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        message: "Request not found",
      });
    }

    if (request.receiver.toString() !== req.userId.toString()) {
      return res.status(403).json({
        message: "You cannot update this request",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Request already processed",
      });
    }

    if (status === "accepted") {
      const acceptingUser = await User.findById(req.userId).select("totalBeds occupiedBeds");
      if (isRequirementFulfilled(acceptingUser)) {
        return res.status(409).json({
          code: "ROOMMATE_REQUIREMENT_FULFILLED",
          message: "Your room is full. Update your room availability before accepting another request.",
        });
      }
    }

    const updatedRequest = await Request.findOneAndUpdate(
      { _id: requestId, receiver: req.userId, status: "pending" },
      { $set: { status }, $unset: { pairKey: 1 } },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(409).json({ message: "Request has already been processed" });
    }

    await updatedRequest.populate([
      { path: "sender", select: "name city state profileImage totalBeds occupiedBeds" },
      { path: "receiver", select: "name city state profileImage totalBeds occupiedBeds" },
    ]);

    const senderId = updatedRequest.sender?._id?.toString() || request.sender.toString();
    const acceptedBy = updatedRequest.receiver;
    const io = getIO();
    onlineUsers.get(senderId)?.forEach((socketId) => {
      io?.to(socketId).emit("roommateRequestStatusUpdated", {
        requestId: updatedRequest._id,
        senderId,
        receiverId: acceptedBy?._id?.toString() || req.userId.toString(),
        status,
      });
      if (status === "accepted") {
        io?.to(socketId).emit("roommateRequestAccepted", {
          requestId: updatedRequest._id,
          senderId,
          acceptedBy,
        });
      }
    });

    return res.status(200).json({
      message: `Request ${status} successfully`,
      request: updatedRequest,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get users whose requests have been accepted
const getAcceptedUsers = async (req, res) => {
  try {
    const userId = req.userId;

    const requests = await Request.find({
      status: "accepted",
      $or: [
        { sender: userId },
        { receiver: userId },
      ],
    })
      .populate("sender", "name email city state locality age gender profileImage totalBeds occupiedBeds")
      .populate("receiver", "name email city state locality age gender profileImage totalBeds occupiedBeds");

    const users = [...new Map(requests
      .map((request) => {
        if (!request.sender || !request.receiver) {
          return null;
        }

        return request.sender._id.toString() === userId.toString()
          ? request.receiver
          : request.sender;
      })
      .filter(Boolean)
      .map((user) => [user._id.toString(), user])).values()];

    return res.status(200).json({
      message: "Accepted users fetched successfully",
      users,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// End an accepted roommate connection by either participant.
const removeAcceptedConnection = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId.toString();

    if (currentUserId === userId) {
      return res.status(400).json({ message: "You cannot remove yourself" });
    }

    const result = await Request.deleteMany({
      status: "accepted",
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Accepted connection not found" });
    }

    const io = getIO();
    const currentUserSockets = onlineUsers.get(currentUserId);
    const otherUserSockets = onlineUsers.get(userId);

    currentUserSockets?.forEach((socketId) => {
      io?.to(socketId).emit("roommateConnectionRemoved", { userId });
    });
    otherUserSockets?.forEach((socketId) => {
      io?.to(socketId).emit("roommateConnectionRemoved", { userId: currentUserId });
    });

    return res.status(200).json({ message: "Roommate connection removed" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  sendRequest,
  getReceivedRequests,
  getSentRequests,
  cancelRequest,
  getPendingRequestCount,
  markPendingRequestsRead,
  updateRequestStatus,
  getAcceptedUsers,
  removeAcceptedConnection,
};
