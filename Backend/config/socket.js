
const { Server } = require("socket.io");
const Message = require("../model/message");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const User = require("../model/user");
const Request = require("../model/request");
const Call = require("../model/call");


let io;
const onlineUsers = new Map();
const activeCalls = new Map();
const activeCallByUser = new Map();
const reservedCallUsers = new Set();
const CALL_RING_TIMEOUT_MS = 45000;

const emitToUser = (userId, event, payload) => {
  onlineUsers.get(String(userId))?.forEach((socketId) => io?.to(socketId).emit(event, payload));
};

const signalingObjectIsValid = (value, type) => value && typeof value === "object" &&
  value.type === type && typeof value.sdp === "string" && value.sdp.length > 0 && value.sdp.length <= 150000;

const terminateCall = async (callId, status, eventName, message) => {
  const call = activeCalls.get(callId);
  if (!call || call.ending) return;
  call.ending = true;
  clearTimeout(call.timer);
  activeCalls.delete(callId);
  if (activeCallByUser.get(call.callerId) === callId) activeCallByUser.delete(call.callerId);
  if (activeCallByUser.get(call.receiverId) === callId) activeCallByUser.delete(call.receiverId);
  const endedAt = new Date();
  const duration = call.connectedAt ? Math.max(0, Math.floor((endedAt.getTime() - call.connectedAt) / 1000)) : 0;
  try { await Call.findByIdAndUpdate(call.historyId, { status, endedAt, duration }); }
  catch (error) { console.error("Call history update failed:", error.message); }
  const payload = { callId, callerId: call.callerId, receiverId: call.receiverId, status, message };
  emitToUser(call.callerId, eventName, payload);
  emitToUser(call.receiverId, eventName, payload);
};


// ==================================
// GET AND SEND UNREAD MESSAGE COUNTS
// ==================================

const emitUnreadCounts = async (userId) => {
  try {
    const unreadMessages = await Message.aggregate([
      {
        $match: {
          receiver: new mongoose.Types.ObjectId(userId),
          status: { $ne: "read" },
        },
      },
      {
        $group: {
          _id: "$sender",
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadCounts = {};

    unreadMessages.forEach((item) => {
      unreadCounts[item._id.toString()] = item.count;
    });

    const userSockets = onlineUsers.get(userId.toString());

    if (userSockets && io) {
      userSockets.forEach((socketId) => {
        io.to(socketId).emit("unreadCounts", unreadCounts);
      });
    }

  } catch (error) {
    console.log("Unread Count Error:", error.message);
  }
};


// ==================================
// INITIALIZE SOCKET.IO
// ==================================

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });


  // SOCKET AUTHENTICATION
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication token missing"));
      }

      const decoded = jwt.verify(
        token,
        process.env.SECRET_KEY
      );

      socket.userId = decoded.userId;

      next();

    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });


  // USER CONNECTION
  io.on("connection", (socket) => {
    const userId = socket.userId.toString();

    console.log("User connected:", userId);


    // STORE ONLINE USER
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socket.id);

    io.emit("onlineUsers", Array.from(onlineUsers.keys()));


    // SEND ONLINE USERS
    socket.on("getOnlineUsers", () => {
      socket.emit(
        "onlineUsers",
        Array.from(onlineUsers.keys())
      );
    });


    // SEND INITIAL UNREAD COUNTS
    emitUnreadCounts(userId);


    // ALLOW FRONTEND TO REQUEST UNREAD COUNTS
    socket.on("getUnreadCounts", () => {
      emitUnreadCounts(userId);
    });

    // WebRTC signaling. Media always travels peer-to-peer or through TURN, never Socket.IO.
    socket.on("callUser", async (payload = {}, acknowledge = () => {}) => {
      const receiverId = typeof payload.receiverId === "string" ? payload.receiverId : "";
      const callType = payload.callType;
      const offer = payload.offer;
      const reply = (result) => { if (typeof acknowledge === "function") acknowledge(result); };
      if (!mongoose.isValidObjectId(receiverId) || receiverId === userId || !["audio", "video"].includes(callType) || !signalingObjectIsValid(offer, "offer")) {
        reply({ ok: false, message: "Invalid call request." });
        socket.emit("callFailed", { message: "Invalid call request." });
        return;
      }
      if (activeCallByUser.has(userId) || activeCallByUser.has(receiverId) || reservedCallUsers.has(userId) || reservedCallUsers.has(receiverId)) {
        reply({ ok: false, busy: true, message: "One of you is already on a call." });
        socket.emit("userBusy", { receiverId, message: "This user is busy." });
        return;
      }

      reservedCallUsers.add(userId);
      reservedCallUsers.add(receiverId);
      let reserved = true;
      const releaseReservations = () => {
        if (!reserved) return;
        reservedCallUsers.delete(userId);
        reservedCallUsers.delete(receiverId);
        reserved = false;
      };
      try {
        const [friendship, caller, receiver] = await Promise.all([
          Request.findOne({ status: "accepted", $or: [{ sender: userId, receiver: receiverId }, { sender: receiverId, receiver: userId }] }).select("_id"),
          User.findById(userId).select("name profileImage blockedUsers"),
          User.findById(receiverId).select("blockedUsers"),
        ]);
        const blocked = caller?.blockedUsers?.some((id) => id.toString() === receiverId) ||
          receiver?.blockedUsers?.some((id) => id.toString() === userId);
        if (!friendship || blocked || !caller || !receiver) {
          releaseReservations();
          reply({ ok: false, message: "You cannot call this user." });
          socket.emit("callFailed", { message: "You cannot call this user." });
          return;
        }
        if (!onlineUsers.has(receiverId)) {
          await Call.create({ caller: userId, receiver: receiverId, callType, status: "missed", startedAt: new Date(), endedAt: new Date(), duration: 0 });
          releaseReservations();
          reply({ ok: false, offline: true, message: "This user is offline." });
          socket.emit("callFailed", { message: "This user is offline." });
          return;
        }

        const callId = randomUUID();
        const history = await Call.create({ caller: userId, receiver: receiverId, callType, status: "missed", startedAt: new Date() });
        const call = { callId, callerId: userId, receiverId, callerSocketId: socket.id, receiverSocketId: null, callType, status: "ringing", historyId: history._id, timer: null, connectedAt: null, ending: false };
        activeCalls.set(callId, call);
        activeCallByUser.set(userId, callId);
        activeCallByUser.set(receiverId, callId);
        releaseReservations();
        call.timer = setTimeout(() => { void terminateCall(callId, "missed", "callTimeout", "No answer."); }, CALL_RING_TIMEOUT_MS);
        emitToUser(receiverId, "incomingCall", {
          callId, callerId: userId, caller: { _id: userId, name: caller.name, profileImage: caller.profileImage || "" },
          receiverId, callType, offer,
        });
        reply({ ok: true, callId });
      } catch (error) {
        releaseReservations();
        console.error("Call setup failed:", error.message);
        reply({ ok: false, message: "Unable to start the call." });
        socket.emit("callFailed", { message: "Unable to start the call." });
      }
    });

    socket.on("acceptCall", async ({ callId, answer } = {}, acknowledge = () => {}) => {
      const call = activeCalls.get(callId);
      if (!call || call.receiverId !== userId || call.status !== "ringing" || !signalingObjectIsValid(answer, "answer")) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, message: "This call is no longer available." });
        return;
      }
      call.status = "connecting";
      call.receiverSocketId = socket.id;
      clearTimeout(call.timer);
      emitToUser(call.callerId, "callAccepted", { callId, answer, acceptedBy: userId });
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    });

    socket.on("rejectCall", ({ callId } = {}) => {
      const call = activeCalls.get(callId);
      if (call?.receiverId === userId && call.status === "ringing") void terminateCall(callId, "rejected", "callRejected", "Call declined.");
    });

    socket.on("iceCandidate", ({ callId, candidate } = {}) => {
      const call = activeCalls.get(callId);
      if (!call || (userId !== call.callerId && userId !== call.receiverId) || !candidate || typeof candidate.candidate !== "string" || candidate.candidate.length > 4096) return;
      const receiverId = userId === call.callerId ? call.receiverId : call.callerId;
      emitToUser(receiverId, "iceCandidate", { callId, candidate, fromUserId: userId });
    });

    socket.on("callConnected", ({ callId } = {}) => {
      const call = activeCalls.get(callId);
      if (!call || !["connecting", "connected"].includes(call.status) || (userId !== call.callerId && userId !== call.receiverId)) return;
      if (!call.connectedAt) call.connectedAt = Date.now();
      call.status = "connected";
      emitToUser(userId === call.callerId ? call.receiverId : call.callerId, "callConnected", { callId });
    });

    socket.on("endCall", ({ callId } = {}) => {
      const call = activeCalls.get(callId);
      if (!call || (userId !== call.callerId && userId !== call.receiverId)) return;
      const status = call.status === "connected" ? "completed" : "failed";
      void terminateCall(callId, status, "callEnded", "Call ended.");
    });

    socket.on("callFailed", ({ callId } = {}) => {
      const call = activeCalls.get(callId);
      if (call && (userId === call.callerId || userId === call.receiverId)) void terminateCall(callId, "failed", "callFailed", "The call could not connect.");
    });


    // ==============================
    // TYPING INDICATOR
    // ==============================

    socket.on("typing", (receiverId) => {
      if (!receiverId) return;

      const receiverSockets = onlineUsers.get(
        receiverId.toString()
      );

      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("userTyping", {
            userId,
          });
        });
      }
    });


    socket.on("stopTyping", (receiverId) => {
      if (!receiverId) return;

      const receiverSockets = onlineUsers.get(
        receiverId.toString()
      );

      if (receiverSockets) {
        receiverSockets.forEach((socketId) => {
          io.to(socketId).emit("userStoppedTyping", {
            userId,
          });
        });
      }
    });


    // ==============================
    // MESSAGE DELIVERY STATUS
    // ==============================

    socket.on("messageDelivered", async (messageId) => {
      try {
        const message = await Message.findById(messageId);

        if (!message) return;

        // ONLY RECEIVER CAN MARK MESSAGE DELIVERED
        if (message.receiver.toString() !== userId) {
          return;
        }

        if (message.status === "sent") {
          message.status = "delivered";
          await message.save();
        }

        // UPDATE SENDER STATUS
        const senderSockets = onlineUsers.get(
          message.sender.toString()
        );

        if (senderSockets) {
          senderSockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", {
              messageId: message._id,
              status: message.status,
            });
          });
        }

        // UPDATE RECEIVER UNREAD COUNTS
        await emitUnreadCounts(userId);

        console.log("Message delivered:", messageId);

      } catch (error) {
        console.log("Delivery error:", error.message);
      }
    });


    // ==============================
    // MESSAGE READ STATUS
    // ==============================

    socket.on("messageRead", async (messageId) => {
      try {
        const message = await Message.findById(messageId);

        if (!message) return;

        // ONLY RECEIVER CAN MARK MESSAGE READ
        if (message.receiver.toString() !== userId) {
          return;
        }

        if (message.status !== "read") {
          message.status = "read";
          await message.save();
        }

        // UPDATE SENDER STATUS
        const senderSockets = onlineUsers.get(
          message.sender.toString()
        );

        if (senderSockets) {
          senderSockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", {
              messageId: message._id,
              status: "read",
            });
          });
        }

        // UPDATE RECEIVER UNREAD COUNTS
        await emitUnreadCounts(userId);

        console.log("Message read:", messageId);

      } catch (error) {
        console.log("Read error:", error.message);
      }
    });


    // ==============================
    // USER DISCONNECTION
    // ==============================

    socket.on("disconnect", () => {
      for (const call of activeCalls.values()) {
        if ((call.callerId === userId && call.callerSocketId === socket.id) ||
            (call.receiverId === userId && call.receiverSocketId === socket.id)) {
          void terminateCall(call.callId, call.connectedAt ? "completed" : "failed", "callEnded", "The other participant disconnected.");
        }
      }
      const userSockets = onlineUsers.get(userId);

      if (userSockets) {
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
        }
      }

      io.emit("onlineUsers", Array.from(onlineUsers.keys()));

      console.log("User disconnected:", userId);
      console.log("Online Users:", onlineUsers);
    });

  });

  return io;
};


// GET SOCKET INSTANCE
const getIO = () => io;


module.exports = {
  initSocket,
  getIO,
  onlineUsers,
  emitUnreadCounts,
};
