import express from "express";
import User from "./models/User.js";

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: String(password), // NOTE: plain text for simplicity; hash in real apps
    });

    res.status(201).json({ id: user.email, name: user.name, email: user.email });
  } catch (e) {
    console.error("Register error", e);
    res.status(500).json({ error: "Failed to register" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.password !== String(password)) {
      return res.status(401).json({ error: "Incorrect email or password" });
    }

    res.json({ id: user.email, name: user.name, email: user.email });
  } catch (e) {
    console.error("Login error", e);
    res.status(500).json({ error: "Failed to login" });
  }
});

export default router;
