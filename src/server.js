const express = require("express");
const cors = require("cors");
require("dotenv").config();

const importRoutes = require("./routes/importRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/import", importRoutes);

app.get("/", (req, res) => {
  res.json({ message: "EventFlow API is running" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`EventFlow API running on port ${PORT}`);
});


const authRoutes = require("./routes/authRoutes");
const eventsRoutes = require("./routes/eventsRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/events", eventsRoutes);