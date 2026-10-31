const { model, Schema } = require("mongoose");

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    locality: { type: String, trim: true, maxlength: 100, default: "" },

    age: {
      type: Number,
      required: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
      required: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    totalBeds: {
      type: Number,
      min: 1,
      validate: { validator: Number.isInteger, message: "Total beds must be a whole number" },
    },

    occupiedBeds: {
      type: Number,
      min: 0,
      validate: [
        { validator: Number.isInteger, message: "Occupied beds must be a whole number" },
        {
          validator(value) { return this.totalBeds == null || value <= this.totalBeds; },
          message: "Occupied beds cannot exceed total beds",
        },
      ],
    },

    blockedUsers: [{
      type: Schema.Types.ObjectId,
      ref: "User",
    }],

    password: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.virtual("requirementFulfilled").get(function requirementFulfilled() {
  return Number.isInteger(this.totalBeds) && this.totalBeds > 0 &&
    Number.isInteger(this.occupiedBeds) && this.occupiedBeds >= this.totalBeds;
});

userSchema.pre("validate", function validateRoomCapacity() {
  if ((this.totalBeds == null) !== (this.occupiedBeds == null)) {
    this.invalidate("occupiedBeds", "Set both total beds and occupied beds");
  }
});

module.exports = model("User", userSchema);
