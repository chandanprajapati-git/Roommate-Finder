const mongoose = require("mongoose");
const User = require("../model/user");
const Call = require("../model/call");

const getIceServers = (req, res) => {
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL;
  if (!username || !credential) {
    return res.status(503).json({ message: "Calling is not configured. Add TURN_USERNAME and TURN_CREDENTIAL to the backend environment." });
  }

  res.set("Cache-Control", "no-store, private");
  return res.status(200).json({
    iceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username, credential },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username, credential },
      { urls: "turn:global.relay.metered.ca:443", username, credential },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username, credential },
    ],
    iceTransportPolicy: "all",
  });
};

const getCallHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: "Invalid conversation user" });
    const calls = await Call.find({
      $or: [
        { caller: req.userId, receiver: userId },
        { caller: userId, receiver: req.userId },
      ],
    }).sort({ createdAt: -1 }).limit(100).select("caller receiver callType status startedAt endedAt duration createdAt");
    return res.status(200).json({ calls });
  } catch {
    return res.status(500).json({ message: "Could not load call history" });
  }
};

module.exports = { getIceServers, getCallHistory };
