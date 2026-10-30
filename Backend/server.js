const express = require("express");
const cors = require("cors");
const { dbConnection } = require("./config/dbConn");
require("dotenv").config();

const app = express();
const http = require("http");
const { initSocket } = require("./config/socket");

const userRoute = require("./routes/userRoute");
const requestRoute = require("./routes/requestRoute");
const messageRoute = require("./routes/messageRoute");

const server = http.createServer(app);

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

initSocket(server);
dbConnection();

app.use("/api/message", messageRoute);
app.use("/api/request", requestRoute);
app.use("/api/user", userRoute);

app.get("/", (req, res) => {
  res.send("Welcome to Home page");
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`Server Started on Port number ${PORT}`);
});
