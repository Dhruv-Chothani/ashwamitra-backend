const express = require("express");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Get my wallet
router.get("/my-wallet", auth, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = new Wallet({ userId: req.user._id, balance: 0, transactions: [] });
      await wallet.save();
    }
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Add money to user wallet
router.post("/add-money", auth, requireRole("admin"), async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    const amountValue = Number(amount);
    if (!userId || !Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: "Valid userId and positive amount required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0, transactions: [] });
    }

    wallet.balance += amountValue;
    wallet.transactions.unshift({
      amount: amountValue,
      type: "credit",
      description: description || "Admin wallet credit",
    });
    await wallet.save();

    res.json({ message: "Money added successfully.", wallet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deduct money (used during checkout)
router.post("/deduct", auth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: "Valid positive amount required." });
    }

    let wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet || wallet.balance < amountValue) {
      return res.status(400).json({ error: "Insufficient wallet balance." });
    }

    wallet.balance -= amountValue;
    wallet.transactions.unshift({
      amount: amountValue,
      type: "debit",
      description: description || "Order payment",
    });
    await wallet.save();

    res.json({ message: "Amount deducted.", wallet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all user wallets
router.get("/all", auth, requireRole("admin"), async (req, res) => {
  try {
    const wallets = await Wallet.find().populate("userId", "name email phone role");
    res.json(wallets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
