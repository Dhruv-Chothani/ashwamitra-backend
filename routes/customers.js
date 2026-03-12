const express = require("express");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Get customer profile
router.get("/profile", auth, requireRole("customer"), async (req, res) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) return res.status(404).json({ error: "Customer profile not found." });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update customer profile
router.put("/profile", auth, requireRole("customer"), async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { userId: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Dashboard
router.get("/dashboard", auth, requireRole("customer"), async (req, res) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) return res.status(404).json({ error: "Customer profile not found." });
    const orders = await Order.find({ buyerId: req.user._id }).sort({ createdAt: -1 });

    const totalSpent = orders.filter((o) => o.status === "delivered").reduce((sum, o) => sum + o.totalAmount, 0);
    const totalSavings = customer.totalSavings || 0;
    const savingsPercentage = totalSpent > 0 ? ((totalSavings / (totalSpent + totalSavings)) * 100).toFixed(1) : 0;

    res.json({
      totalPurchases: orders.length,
      totalSpent,
      totalSavings,
      savingsPercentage,
      savingsMessage: `You saved ₹${totalSavings.toLocaleString()} (${savingsPercentage}%) compared to local markets.`,
      recentOrders: orders.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Orders
router.get("/orders", auth, requireRole("customer"), async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user._id })
      .populate("items.productId")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
