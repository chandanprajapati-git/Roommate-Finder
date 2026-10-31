const User = require("../model/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Request = require("../model/request");
const { getIO, onlineUsers } = require("../config/socket");

// Get users by location while excluding the current user and block relationships.
// Never return email, phone or password here.
const getUserByLocation = async (req, res) => {
  try {
    const { state, city } = req.query;
    if (req.query.locality !== undefined && typeof req.query.locality !== "string") return res.status(400).json({ message: "Area / locality is invalid" });
    const locality = typeof req.query.locality === "string" ? req.query.locality.replace(/\s+/g, " ").trim() : "";
    if (locality.length > 100) return res.status(400).json({ message: "Area / locality must be 100 characters or fewer" });

    if (!state || !city) {
      return res.status(400).json({
        message: "State and City are required",
      });
    }

    const parseInteger = (value, label, max) => {
      if (value === undefined || value === "") return undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new Error(`${label} must be a whole number between 0 and ${max}`);
      return parsed;
    };
    let minAge;
    let maxAge;
    let minVacancies;
    try {
      minAge = parseInteger(req.query.minAge, "Minimum age", 120);
      maxAge = parseInteger(req.query.maxAge, "Maximum age", 120);
      minVacancies = parseInteger(req.query.minVacancies, "Minimum vacancies", 1000);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
      return res.status(400).json({ message: "Minimum age cannot exceed maximum age" });
    }
    const allowedGenders = ["Male", "Female", "Other", "Prefer not to say"];
    const gender = req.query.gender || undefined;
    if (gender && !allowedGenders.includes(gender)) return res.status(400).json({ message: "Gender filter is invalid" });
    if (req.query.activeOnly !== undefined && !["true", "false"].includes(req.query.activeOnly)) {
      return res.status(400).json({ message: "Active requirement filter must be true or false" });
    }

    const currentUser = await User.findById(req.userId).select("blockedUsers");
    const blockedByCurrentUser = currentUser?.blockedUsers || [];
    const filters = {
      state,
      city,
      _id: { $nin: [...blockedByCurrentUser, req.userId] },
      blockedUsers: { $ne: req.userId },
    };
    if (locality) filters.locality = { $regex: `^${locality.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
    if (gender) filters.gender = gender;
    if (minAge !== undefined || maxAge !== undefined) {
      filters.age = {};
      if (minAge !== undefined) filters.age.$gte = minAge;
      if (maxAge !== undefined) filters.age.$lte = maxAge;
    }
    const availabilityExpressions = [];
    const activeOnly = req.query.activeOnly === undefined ? true : req.query.activeOnly === "true";
    if (activeOnly) availabilityExpressions.push({ $gt: [{ $subtract: ["$totalBeds", "$occupiedBeds"] }, 0] });
    if (minVacancies > 0) availabilityExpressions.push({ $gte: [{ $subtract: ["$totalBeds", "$occupiedBeds"] }, minVacancies] });
    if (availabilityExpressions.length === 1) filters.$expr = availabilityExpressions[0];
    else if (availabilityExpressions.length > 1) filters.$expr = { $and: availabilityExpressions };

    const users = await User.find(filters).select("name age gender city state locality profileImage totalBeds occupiedBeds");

    return res.status(200).json({
      message: "Users fetched successfully",
      users,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

const blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.userId.toString();
    if (id === currentUserId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const target = await User.findById(id).select("_id");
    if (!target) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndUpdate(currentUserId, { $addToSet: { blockedUsers: id } });
    await Request.deleteMany({
      status: { $in: ["pending", "accepted"] },
      $or: [
        { sender: currentUserId, receiver: id },
        { sender: id, receiver: currentUserId },
      ],
    });

    const io = getIO();
    onlineUsers.get(currentUserId)?.forEach((socketId) => {
      io?.to(socketId).emit("roommateConnectionRemoved", { userId: id });
    });
    onlineUsers.get(id)?.forEach((socketId) => {
      io?.to(socketId).emit("roommateConnectionRemoved", { userId: currentUserId });
    });

    return res.status(200).json({ message: "User blocked" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const unblockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $pull: { blockedUsers: req.params.id },
    });
    return res.status(200).json({ message: "User unblocked" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate(
      "blockedUsers",
      "name city state profileImage"
    );
    return res.status(200).json({ users: user?.blockedUsers || [] });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("-password -blockedUsers");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User found",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Authenticated profile reads use the JWT identity rather than a client supplied id.
const getOwnProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password -blockedUsers");
    if (!user) return res.status(404).json({ message: "User does not exist" });
    return res.status(200).json({ message: "Profile fetched successfully", user });
  } catch (error) {
    return res.status(500).json({ message: "Could not load profile" });
  }
};

// Update own profile
const updateUserById = async (req, res) => {
  try {
    const id = req.params.id || req.userId.toString();

    if (req.params.id && req.userId.toString() !== id) {
      return res.status(403).json({
        message: "You can only update your own account",
      });
    }

    const allowedFields = [
      "name",
      "email",
      "phone",
      "age",
      "state",
      "city",
      "locality",
      "gender",
      "profileImage",
      "totalBeds",
      "occupiedBeds",
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });
    if (typeof updateData.locality === "string") updateData.locality = updateData.locality.replace(/\s+/g, " ").trim();

    if (Object.keys(updateData).length === 0) return res.status(400).json({ message: "No profile fields were provided" });
    for (const field of ["name", "email", "phone", "state", "city"]) {
      if (updateData[field] !== undefined && (typeof updateData[field] !== "string" || !updateData[field].trim())) {
        return res.status(400).json({ message: `${field[0].toUpperCase()}${field.slice(1)} cannot be empty` });
      }
    }
    for (const field of ["name", "phone", "state", "city"]) {
      if (typeof updateData[field] === "string") updateData[field] = updateData[field].trim();
    }
    if (typeof updateData.email === "string") {
      updateData.email = updateData.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email)) return res.status(400).json({ message: "Enter a valid email address" });
    }
    if (updateData.age !== undefined) {
      updateData.age = Number(updateData.age);
      if (!Number.isInteger(updateData.age) || updateData.age < 0 || updateData.age > 120) return res.status(400).json({ message: "Age must be a whole number between 0 and 120" });
    }
    if (updateData.gender !== undefined && !["Male", "Female", "Other", "Prefer not to say"].includes(updateData.gender)) {
      return res.status(400).json({ message: "Gender selection is invalid" });
    }
    if (updateData.locality !== undefined && (typeof updateData.locality !== "string" || updateData.locality.length > 100)) {
      return res.status(400).json({ message: "Area / locality must be 100 characters or fewer" });
    }

    const totalBeds = updateData.totalBeds !== undefined ? Number(updateData.totalBeds) : undefined;
    const occupiedBeds = updateData.occupiedBeds !== undefined ? Number(updateData.occupiedBeds) : undefined;
    if (updateData.totalBeds !== undefined && (!Number.isInteger(totalBeds) || totalBeds < 1)) {
      return res.status(400).json({ message: "Total beds must be a whole number greater than zero" });
    }
    if (updateData.occupiedBeds !== undefined && (!Number.isInteger(occupiedBeds) || occupiedBeds < 0)) {
      return res.status(400).json({ message: "Occupied beds must be a non-negative whole number" });
    }
    if (updateData.totalBeds !== undefined) updateData.totalBeds = totalBeds;
    if (updateData.occupiedBeds !== undefined) updateData.occupiedBeds = occupiedBeds;

    if (updateData.totalBeds !== undefined || updateData.occupiedBeds !== undefined) {
      const existingCapacity = await User.findById(id).select("totalBeds occupiedBeds");
      const nextTotal = updateData.totalBeds ?? existingCapacity?.totalBeds;
      const nextOccupied = updateData.occupiedBeds ?? existingCapacity?.occupiedBeds;
      if ((nextTotal == null) !== (nextOccupied == null)) {
        return res.status(400).json({ message: "Set both total beds and occupied beds" });
      }
      if (nextTotal != null && nextOccupied != null && nextOccupied > nextTotal) {
        return res.status(400).json({ message: "Occupied beds cannot exceed total beds" });
      }
    }

    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password -blockedUsers");

    if (!user) {
      return res.status(404).json({
        message: "User does not exist",
      });
    }

    if (updateData.totalBeds !== undefined || updateData.occupiedBeds !== undefined) {
      getIO()?.emit("roomAvailabilityUpdated", {
        userId: user._id.toString(),
        totalBeds: user.totalBeds,
        occupiedBeds: user.occupiedBeds,
        requirementFulfilled: user.requirementFulfilled,
      });
    }

    return res.status(200).json({
      message: "User details updated successfully",
      user,
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That email address is already in use" });
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: error.message });
    return res.status(500).json({
      message: "Could not update profile",
    });
  }
};

// Delete user
const deleteUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.userId.toString() !== id) {
      return res.status(403).json({
        message: "You can only delete your own account",
      });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        message: "User does not exist",
      });
    }

    return res.status(200).json({
      message: "User deleted successfully",
      user,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Signup
const signup = async (req, res) => {
  try {
    const {
      email,
      phone,
      name,
      city,
      locality,
      state,
      age,
      gender,
      password,
    } = req.body;

    if (
      !email ||
      !phone ||
      !name ||
      !city ||
      !state ||
      !age ||
      !gender ||
      !password
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      age: Number(age),
      city: city.trim(),
      locality: typeof locality === "string" ? locality.replace(/\s+/g, " ").trim().slice(0, 100) : "",
      state: state.trim(),
      gender,
      password: hashedPassword,
    });

    const { password: _, ...userData } = newUser.toObject();

    return res.status(201).json({
      message: "User created successfully",
      user: userData,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.SECRET_KEY,
      { expiresIn: "1d" }
    );

    const { password: _, ...userData } = user.toObject();

    return res.status(200).json({
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getUserByLocation,
  getUserById,
  getOwnProfile,
  login,
  updateUserById,
  signup,
  deleteUserById,
  blockUser,
  unblockUser,
  getBlockedUsers,
};
