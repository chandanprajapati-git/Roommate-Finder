const mongoose = require("mongoose");
const { performance } = require("node:perf_hooks");

exports.dbConnection = async () => {
  const startedAt = performance.now();
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.info("DATABASE CONNECTED SUCCESSFULLY:", { durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    console.error("DATABASE CONNECTION FAILED:", { durationMs: Math.round(performance.now() - startedAt), message: error.message });
    throw error;
  }
};
