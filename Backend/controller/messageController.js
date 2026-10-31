
const Message = require("../model/message");
const Request = require("../model/request");
const User = require("../model/user");
const { getIO, onlineUsers, emitUnreadCounts } = require("../config/socket");
const cloudinary = require("../config/cloudinary");
const { performance } = require("node:perf_hooks");

const deliverToConnectedSockets = (message, receiverId) => {
  const io = getIO();
  const receiverSockets = onlineUsers.get(String(receiverId));
  if (!io || !receiverSockets?.size) {
    console.info("Message recipient is currently offline:", { messageId: message._id.toString(), receiverId: String(receiverId) });
    return;
  }

  const emitStartedAt = performance.now();
  receiverSockets.forEach((socketId) => io.to(socketId).emit("receiveMessage", message));
  console.info("Message emitted to receiver:", { messageId: message._id.toString(), receiverId: String(receiverId), socketCount: receiverSockets.size, emitDurationMs: Math.round(performance.now() - emitStartedAt) });
};

const sendMessage = async (req, res) => {
  const startedAt = performance.now();
  try {
    const sender = req.userId;
    const { receiver, message, image, attachment, clientMessageId } = req.body;

    if (!receiver || (!message?.trim() && !image && !attachment?.url)) {
      return res.status(400).json({
        message: "Receiver and message or attachment are required",
      });
    }

    if (sender.toString() === receiver.toString()) {
      return res.status(400).json({
        message: "You cannot send a message to yourself",
      });
    }

    if (clientMessageId !== undefined && (typeof clientMessageId !== "string" || !clientMessageId.trim() || clientMessageId.length > 100)) {
      return res.status(400).json({ message: "Invalid client message ID" });
    }

    const validationStartedAt = performance.now();
    const [receiverUser, senderUser, acceptedRequest] = await Promise.all([
      User.findById(receiver).select("blockedUsers"),
      User.findById(sender).select("blockedUsers"),
      Request.findOne({
        status: "accepted",
        $or: [{ sender, receiver }, { sender: receiver, receiver: sender }],
      }).select("_id"),
    ]);
    const validationDurationMs = Math.round(performance.now() - validationStartedAt);

    if (!receiverUser) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    if (
      receiverUser.blockedUsers?.some((id) => id.toString() === sender.toString()) ||
      senderUser?.blockedUsers?.some((id) => id.toString() === receiver.toString())
    ) {
      return res.status(403).json({ message: "You cannot message this user" });
    }

    if (!acceptedRequest) {
      return res.status(403).json({
        message: "Chat is allowed only when request is accepted",
      });
    }

    const saveStartedAt = performance.now();
    let newMessage;
    let reusedExistingMessage = false;
    try {
      newMessage = await Message.create({
        sender,
        receiver,
        clientMessageId,
        message: message?.trim() || "",
        image: image || null,
        attachment: attachment?.url ? {
          url: attachment.url,
          name: attachment.name || "Attachment",
          mimeType: attachment.mimeType || "application/octet-stream",
          kind: ["image", "video", "audio", "document"].includes(attachment.kind)
            ? attachment.kind
            : "document",
          publicId: attachment.publicId || "",
          resourceType: ["image", "video", "raw"].includes(attachment.resourceType)
            ? attachment.resourceType
            : null,
        } : undefined,
      });
    } catch (error) {
      // A parallel retry may pass the lookup above and race on the unique key.
      if (error.code !== 11000 || !clientMessageId) throw error;
      newMessage = await Message.findOne({ sender, clientMessageId });
      if (!newMessage) throw error;
      reusedExistingMessage = true;
    }
    const saveDurationMs = Math.round(performance.now() - saveStartedAt);

    console.info(reusedExistingMessage ? "Idempotent message request reused:" : "Message saved successfully:", { messageId: newMessage._id.toString(), senderId: sender.toString(), receiverId: receiver.toString(), validationDurationMs, saveDurationMs, totalDurationMs: Math.round(performance.now() - startedAt) });

    // Persist first, then emit to every active session for this user.
    deliverToConnectedSockets(newMessage, receiver);

    return res.status(200).json({
      message: "Message sent successfully",
      data: newMessage,
    });

  } catch (error) {
    console.log("Send Message Error:", error.message);

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};


// FETCH CHAT MESSAGES
const getMessages = async (req, res) => {
  try {
    const sender = req.userId;
    const { userId } = req.params;

    const acceptedRequest = await Request.findOne({
      status: "accepted",
      $or: [
        { sender, receiver: userId },
        { sender: userId, receiver: sender },
      ],
    });

    if (!acceptedRequest) {
      return res.status(403).json({
        message: "Chat access denied",
      });
    }

    const messages = await Message.find({
      $or: [
        { sender, receiver: userId },
        { sender: userId, receiver: sender },
      ],
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      message: "Messages fetched successfully",
      messages,
    });

  } catch (error) {
    console.log("Get Messages Error:", error.message);

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete the conversation's messages for both participants.
const deleteConversation = async (req, res) => {
  try {
    const currentUserId = req.userId.toString();
    const { userId } = req.params;

    if (currentUserId === userId) {
      return res.status(400).json({ message: "Invalid conversation" });
    }

    const acceptedRequest = await Request.findOne({
      status: "accepted",
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    });

    if (!acceptedRequest) {
      return res.status(403).json({ message: "Chat access denied" });
    }

    const conversationFilter = {
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    };
    const conversationMessages = await Message.find(conversationFilter).select("image attachment");
    const assets = new Map();

    const getAsset = (message) => {
      if (message.attachment?.publicId) {
        return {
          public_id: message.attachment.publicId,
          resource_type: message.attachment.resourceType || "image",
        };
      }

      const url = message.attachment?.url || message.image;
      if (!url) return null;
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname !== "res.cloudinary.com") return null;
        const parts = parsedUrl.pathname.split("/").filter(Boolean);
        const uploadIndex = parts.findIndex((part, index) =>
          part === "upload" && ["image", "video", "raw"].includes(parts[index - 1])
        );
        if (uploadIndex < 0) return null;
        const resourceType = parts[uploadIndex - 1];
        const publicIdParts = parts.slice(uploadIndex + 1);
        if (publicIdParts[0]?.startsWith("v") && /^[0-9]+$/.test(publicIdParts[0].slice(1))) {
          publicIdParts.shift();
        }
        if (!publicIdParts.length) return null;
        let publicId = publicIdParts.join("/");
        if (resourceType !== "raw") {
          const extensionIndex = publicId.lastIndexOf(".");
          if (extensionIndex > publicId.lastIndexOf("/")) {
            publicId = publicId.slice(0, extensionIndex);
          }
        }
        return { public_id: publicId, resource_type: resourceType };
      } catch {
        return null;
      }
    };

    conversationMessages.forEach((message) => {
      const asset = getAsset(message);
      if (asset) assets.set(`${asset.resource_type}:${asset.public_id}`, asset);
    });

    const assetResults = await Promise.allSettled(
      [...assets.values()].map((asset) =>
        cloudinary.uploader.destroy(asset.public_id, {
          resource_type: asset.resource_type,
          invalidate: true,
        })
      )
    );
    const mediaDeleteFailures = assetResults.filter((result) =>
      result.status === "rejected" || result.value?.result !== "ok"
    ).length;
    const result = await Message.deleteMany(conversationFilter);

    await emitUnreadCounts(currentUserId);
    await emitUnreadCounts(userId);

    const io = getIO();
    const recipientSockets = onlineUsers.get(userId);
    recipientSockets?.forEach((socketId) => {
      io?.to(socketId).emit("chatDeleted", { userId: currentUserId });
    });
    const currentUserSockets = onlineUsers.get(currentUserId);
    currentUserSockets?.forEach((socketId) => {
      io?.to(socketId).emit("chatDeleted", { userId });
    });

    return res.status(200).json({
      message: "Chat deleted",
      deletedCount: result.deletedCount,
      mediaDeleteFailures,
    });
  } catch (error) {
    console.log("Delete Chat Error:", error.message);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  deleteConversation,
};
