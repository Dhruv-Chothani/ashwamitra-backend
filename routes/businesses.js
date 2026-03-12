const express = require("express");
const Business = require("../models/Business");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Get business profile
router.get("/profile", auth, requireRole("b2b"), async (req, res) => {
  try {
    const business = await Business.findOne({ userId: req.user._id });
    if (!business) return res.status(404).json({ error: "Business profile not found." });
    res.json(business);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update business profile
router.put("/profile", auth, requireRole("b2b"), async (req, res) => {
  try {
    const business = await Business.findOneAndUpdate(
      { userId: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    res.json(business);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B2B Dashboard stats
router.get("/dashboard", auth, requireRole("b2b"), async (req, res) => {
  try {
    const business = await Business.findOne({ userId: req.user._id });
    if (!business) return res.status(404).json({ error: "Business profile not found." });
    const orders = await Order.find({ buyerId: req.user._id }).sort({ createdAt: -1 });
    const payments = await Payment.find({ payerId: req.user._id });

    const totalPurchases = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalPaid = payments.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount, 0);
    const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;

    // Monthly procurement data
    const monthlyData = {};
    orders.forEach((order) => {
      const month = new Date(order.createdAt).toLocaleString("default", { month: "short" });
      if (!monthlyData[month]) monthlyData[month] = { spend: 0, orders: 0 };
      monthlyData[month].spend += order.totalAmount;
      monthlyData[month].orders += 1;
    });

    res.json({
      totalPurchases,
      totalPaid,
      activeOrders,
      totalOrders: orders.length,
      recentOrders: orders.slice(0, 10),
      monthlyData: Object.entries(monthlyData).map(([month, data]) => ({ month, ...data })),
      isVerified: business.isVerified,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B2B Orders
router.get("/orders", auth, requireRole("b2b"), async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user._id })
      .populate("items.productId")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B2B Payments
router.get("/payments", auth, requireRole("b2b"), async (req, res) => {
  try {
    const payments = await Payment.find({ payerId: req.user._id })
      .populate("orderId")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
