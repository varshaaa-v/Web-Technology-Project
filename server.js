import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import taskRoutes from "./routes.js";
import authRoutes from "./authRoutes.js";
import categoryRoutes from "./categoryRoutes.js";

dotenv.config();
const app = express();

// Middlewares
app.use(cors());
// Allow larger JSON payloads so base64-encoded task images work
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// DB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("🔗 MongoDB Connected"))
  .catch((err) => console.log("❌ DB Error:", err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/tasks", taskRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`ðŸš€ Server running on port ${PORT}`));
