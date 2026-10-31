const { model, Schema } = require("mongoose");

const callSchema = new Schema({
  caller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  receiver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  callType: { type: String, enum: ["audio", "video"], required: true },
  status: { type: String, enum: ["completed", "missed", "rejected", "failed"], default: "missed", required: true },
  startedAt: { type: Date, default: Date.now, required: true },
  endedAt: { type: Date, default: null },
  duration: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

callSchema.index({ caller: 1, receiver: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });

module.exports = model("Call", callSchema);
