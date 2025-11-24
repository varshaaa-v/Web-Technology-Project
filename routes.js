import express from "express";
import Task from "./models/Task.js";

const router = express.Router();

const ALLOWED_PRIORITIES = ["low", "medium", "high"];

// CREATE
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    const rawTitle = body.title || body.name;
    if (!rawTitle || typeof rawTitle !== "string" || !rawTitle.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!body.userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const category =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : "General";

    const priority =
      typeof body.priority === "string" && ALLOWED_PRIORITIES.includes(body.priority)
        ? body.priority
        : "medium";

    const taskData = {
      title: rawTitle.trim(),
      category,
      priority,
      userId: String(body.userId),
    };

    if (typeof body.isComplete === "boolean") {
      taskData.isComplete = body.isComplete;
    }

    if (body.dueDate) {
      const parsedDate = new Date(body.dueDate);
      if (!isNaN(parsedDate)) {
        taskData.dueDate = parsedDate;
      }
    }

    if (body.image) {
      taskData.image = String(body.image);
    }

    const task = await Task.create(taskData);
    res.status(201).json(task);
  } catch (e) {
    console.error("Create task error", e);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// READ
router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const tasks = await Task.find({ userId }).sort({ _id: -1 });
    res.json(tasks);
  } catch (e) {
    console.error("List tasks error", e);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }

    if (typeof body.category === "string") {
      updates.category = body.category.trim() || "General";
    }

    if (typeof body.priority === "string" && ALLOWED_PRIORITIES.includes(body.priority)) {
      updates.priority = body.priority;
    }

    if (typeof body.isComplete === "boolean") {
      updates.isComplete = body.isComplete;
    }

    if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
      if (!body.dueDate) {
        updates.dueDate = null;
      } else {
        const parsedDate = new Date(body.dueDate);
        if (!isNaN(parsedDate)) {
          updates.dueDate = parsedDate;
        }
      }
    }

    if (typeof body.image === "string") {
      updates.image = body.image;
    }

    const task = await Task.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (e) {
    console.error("Update task error", e);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Task.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task deleted successfully" });
  } catch (e) {
    console.error("Delete task error", e);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
