const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { dbConnection } = require("./config/dbConn");
const uploadRoute = require("./routes/uploadRoute");
const app = express();
const http = require("http");
const { initSocket } = require("./config/socket");
const Message = require("./model/message");

const userRoute = require("./routes/userRoute");
const requestRoute = require("./routes/requestRoute");
const messageRoute = require("./routes/messageRoute");
const callRoute = require("./routes/callRoute");

const server = http.createServer(app);
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL || "https://roommate-finder-frontend-liart.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

initSocket(server);
const startServer = async () => {
  await dbConnection();
  await Message.init();
  server.listen(PORT, () => {
    console.log(`Server Started on Port number ${PORT}`);
  });
};

app.use("/api/message", messageRoute);
app.use("/api/request", requestRoute);
app.use("/api/user", userRoute);
app.use("/api/upload", uploadRoute);
app.use("/api/calls", callRoute);

app.get("/", (req, res) => {
  res.send("Welcome to Home page");
});

const PORT = process.env.PORT || 5001;
startServer().catch((error) => {
  console.error("Server startup aborted because the database is unavailable:", error.message);
  process.exit(1);
});
