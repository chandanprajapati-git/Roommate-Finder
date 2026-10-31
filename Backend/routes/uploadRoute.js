const express = require("express");
const multer = require("multer");

const { uploadFile } = require("../controller/uploadController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 - 1,
  },
  fileFilter: (req, file, cb) => {
    const type = file.mimetype;
    const supported =
      type.startsWith("image/") ||
      type.startsWith("video/") ||
      type.startsWith("audio/") ||
      [
        "application/pdf",
        "application/msword",
        "application/rtf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
      ].includes(type);

    if (supported) {
      cb(null, true);
    } else {
      cb(new Error("Choose an image, video, audio, PDF, or Office document."));
    }
  },
});

router.post("/", authMiddleware, (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.code === "LIMIT_FILE_SIZE"
          ? "Files must be smaller than 5 MB."
          : error.message,
      });
    }
    next();
  });
}, uploadFile);

module.exports = router;
