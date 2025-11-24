import express from "express";
import Category from "./models/Category.js";
import Task from "./models/Task.js";

const router = express.Router();

// Get categories for a user
router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const categories = await Category.find({ userId }).sort({ createdAt: 1 });
    res.json(categories);
  } catch (e) {
    console.error("List categories error", e);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Create category
router.post("/", async (req, res) => {
  try {
    const { name, userId } = req.body || {};
    if (!name || !userId) {
      return res.status(400).json({ error: "name and userId are required" });
    }

    const category = await Category.create({
      name: String(name).trim(),
      userId: String(userId),
    });

    res.status(201).json(category);
  } catch (e) {
    console.error("Create category error", e);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// Rename category (and update tasks that reference it by name)
router.put("/:id", async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: "Category not found" });

    const oldName = category.name;
    category.name = String(name).trim();
    await category.save();

    // Update tasks that used the old category name for this user
    await Task.updateMany(
      { userId: category.userId, category: oldName },
      { $set: { category: category.name } }
    );

    res.json(category);
  } catch (e) {
    console.error("Update category error", e);
    res.status(500).json({ error: "Failed to update category" });
  }
});

// Delete category and its tasks
router.delete("/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: "Category not found" });

    await Task.deleteMany({ userId: category.userId, category: category.name });
    await category.deleteOne();

    res.json({ message: "Category and tasks deleted" });
  } catch (e) {
    console.error("Delete category error", e);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;
