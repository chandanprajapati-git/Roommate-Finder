const { Server } = require("socket.io");
const Message = require("../model/message");
const jwt = require("jsonwebtoken");

require("dotenv").config();

let io;
const onlineUsers = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication token missing"));
      }
      const decoded = jwt.verify(token, process.env.SECRET_KEY);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId.toString();
    console.log("User connected:", userId);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);
    io.emit("onlineUsers", Array.from(onlineUsers.keys()));

    socket.on("getOnlineUsers", () => {
      socket.emit("onlineUsers", Array.from(onlineUsers.keys()));
    });

    socket.on("messageDelivered", async (messageId) => {
      try {
        const message = await Message.findById(messageId);

        if (!message) return;
        if (message.receiver.toString() !== userId) {
          return;
        }
        if (message.status === "sent") {
          message.status = "delivered";
          await message.save();
        }

        const senderSockets = onlineUsers.get(message.sender.toString());

        if (senderSockets) {
          senderSockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", {
              messageId: message._id,
              status: message.status,
            });
          });
        }
        console.log("Message delivered:", messageId);
      } catch (error) {
        console.log("Delivery error:", error.message);
      }
    });

    socket.on("messageRead", async (messageId) => {
      try {
        const message = await Message.findById(messageId);

        if (!message) return;
        if (message.receiver.toString() !== userId) {
          return;
        }

        if (message.status !== "read") {
          message.status = "read";
          await message.save();
        }

        const senderSockets = onlineUsers.get(message.sender.toString());

        if (senderSockets) {
          senderSockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", {
              messageId: message._id,
              status: "read",
            });
          });
        }
        console.log("Message read:", messageId);
      } catch (error) {
        console.log("Read error:", error.message);
      }
    });

    socket.on("disconnect", () => {
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

const getIO = () => io;
module.exports = { initSocket, getIO, onlineUsers };
