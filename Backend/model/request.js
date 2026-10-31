const { Schema, model } = require("mongoose");

const requestSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    pairKey: {
      type: String,
      select: false,
      unique: true,
      sparse: true,
    },

    note: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("Request", requestSchema);
