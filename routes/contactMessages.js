const express = require("express");
const ContactMessage = require("../models/ContactMessage");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public: submit contact message
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !email || !phone || !message) {
      return res.status(400).json({ error: "Name, email, phone, and message are required." });
    }

    if (String(message).trim().length < 10) {
      return res.status(400).json({ error: "Message must be at least 10 characters." });
    }

    const contactMessage = await ContactMessage.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      message: String(message).trim(),
    });

    res.status(201).json({
      message: "Message submitted successfully. Our team will contact you shortly.",
      contactMessage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list contact messages
router.get("/", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && ["pending", "read", "responded"].includes(String(status))) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const messages = await ContactMessage.find(filter)
      .populate("handledBy", "name email")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update status
router.put("/:id/status", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "read", "responded"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const message = await ContactMessage.findById(req.params.id);
    if (!message) return res.status(404).json({ error: "Contact message not found." });

    message.status = status;
    message.handledBy = req.user._id;
    await message.save();

    res.json({ message: "Contact message status updated.", contactMessage: message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
