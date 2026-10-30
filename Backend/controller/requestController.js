
const Request = require("../model/request");
const User = require("../model/user");

const sendRequest = async (req, res) => {
  try {
    const sender = req.userId;
    const { receiver, note } = req.body;

    if (!sender || !receiver) {
      return res.status(400).json({
        message: "Sender and receiver are required",
      });
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

    const newRequest = await Request.create({
      sender,
      receiver,
      note,
    });

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

const getReceivedRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.userId.toString() !== userId) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    const requests = await Request.find({
      receiver: userId,
    })
      .populate("sender", "name email city state")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Received requests fetched successfully",
      requests,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

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

    request.status = status;
    await request.save();

    return res.status(200).json({
      message: `Request ${status} successfully`,
      request,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Get accepted roommate users for Chat sidebar
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
      .populate("sender", "name email city state age")
      .populate("receiver", "name email city state age");

    const users = requests
      .map((request) => {
        if (!request.sender || !request.receiver) {
          return null;
        }

        return request.sender._id.toString() === userId.toString()
          ? request.receiver
          : request.sender;
      })
      .filter(Boolean);

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

module.exports = {
  sendRequest,
  getReceivedRequests,
  updateRequestStatus,
  getAcceptedUsers,
};
