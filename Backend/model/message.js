
const { Schema, model } = require("mongoose");

const messageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    clientMessageId: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    message: {
      type: String,
      trim: true,
      default: ""
    },

    image: {
      type: String,
      default: null
    },

    attachment: {
      url: { type: String, default: null },
      name: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      kind: { type: String, enum: ["image", "video", "audio", "document"], default: null },
      publicId: { type: String, default: "" },
      resourceType: { type: String, enum: ["image", "video", "raw"], default: null },
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent"
    }
  },
  {
    timestamps: true
  }
);

messageSchema.index(
  { sender: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: "string" } } }
);

messageSchema.pre("validate", function () {
  if (!this.message?.trim() && !this.image && !this.attachment?.url) {
    this.invalidate(
      "message",
      "A message or image is required"
    );
  }
});

module.exports = model("Message", messageSchema);
