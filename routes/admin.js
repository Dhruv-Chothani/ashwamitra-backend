const express = require("express");
const User = require("../models/User");
const Farmer = require("../models/Farmer");
const Business = require("../models/Business");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// ========== ADMIN DASHBOARD STATS ==========
router.get("/dashboard", auth, requireRole("admin"), async (req, res) => {
  try {
    const totalFarmers = await User.countDocuments({ role: "farmer" });
    const totalBusinesses = await User.countDocuments({ role: "b2b" });
    const totalCustomers = await User.countDocuments({ role: "customer" });
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();

    const totalRevenue = await Order.aggregate([
      { $match: { status: "delivered" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const pendingApprovals = await User.countDocuments({ status: "pending" });
    const pendingFarmers = await Farmer.countDocuments({ isApproved: false });
    const pendingBusinesses = await Business.countDocuments({ isVerified: false });

    // Monthly transaction trend
    const monthlyTrend = await Order.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          volume: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalFarmers,
      totalBusinesses,
      totalCustomers,
      totalOrders,
      totalProducts,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingApprovals,
      pendingFarmers,
      pendingBusinesses,
      monthlyTrend,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET ALL USERS ==========
router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];

    const skip = (Number(page) - 1) * Number(limit);
    const users = await User.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await User.countDocuments(filter);

    res.json({ users, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== APPROVE / REJECT FARMER ==========
router.put("/farmers/:id/approve", auth, requireRole("admin"), async (req, res) => {
  try {
    const { approved } = req.body;
    const farmer = await Farmer.findById(req.params.id);
    if (!farmer) return res.status(404).json({ error: "Farmer not found." });

    farmer.isApproved = approved;
    await farmer.save();

    await User.findByIdAndUpdate(farmer.userId, { status: approved ? "active" : "inactive", isApproved: approved });

    await new Notification({
      userId: farmer.userId,
      type: "approval",
      title: approved ? "Registration Approved!" : "Registration Rejected",
      message: approved
        ? "Your farmer registration has been approved. You can now list products."
        : "Your farmer registration was not approved. Please contact support.",
    }).save();

    res.json({ message: `Farmer ${approved ? "approved" : "rejected"}.`, farmer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== APPROVE / REJECT BUSINESS ==========
router.put("/businesses/:id/verify", auth, requireRole("admin"), async (req, res) => {
  try {
    const { verified } = req.body;
    const business = await Business.findById(req.params.id);
    if (!business) return res.status(404).json({ error: "Business not found." });

    business.isVerified = verified;
    await business.save();

    await User.findByIdAndUpdate(business.userId, { status: verified ? "active" : "inactive", isApproved: verified });

    await new Notification({
      userId: business.userId,
      type: "approval",
      title: verified ? "Business Verified!" : "Verification Rejected",
      message: verified
        ? "Your business has been verified. You can now place bulk orders."
        : "Your business verification was not approved. Please contact support.",
    }).save();

    res.json({ message: `Business ${verified ? "verified" : "rejected"}.`, business });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SUSPEND / ACTIVATE USER ==========
router.put("/users/:id/status", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.body; // "active", "inactive", "suspended"
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ message: `User status updated to ${status}.`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET ALL FARMERS (with profiles) ==========
router.get("/farmers", auth, requireRole("admin"), async (req, res) => {
  try {
    const farmers = await Farmer.find().populate("userId", "name email phone status createdAt lastActive");
    res.json(farmers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET FARMER BY ID ==========
router.get("/farmers/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id)
      .populate("userId", "name email phone status createdAt lastActive");
    if (!farmer) return res.status(404).json({ error: "Farmer not found." });
    res.json(farmer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET ALL BUSINESSES (with profiles) ==========
router.get("/businesses", auth, requireRole("admin"), async (req, res) => {
  try {
    const businesses = await Business.find().populate("userId", "name email phone status createdAt lastActive");
    res.json(businesses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET BUSINESS BY ID ==========
router.get("/businesses/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const business = await Business.findById(req.params.id)
      .populate("userId", "name email phone status createdAt lastActive");
    if (!business) return res.status(404).json({ error: "Business not found." });
    res.json(business);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET ALL ORDERS ==========
router.get("/orders", auth, requireRole("admin"), async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("buyerId", "name email role")
      .populate("items.productId")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET ALL PAYMENTS ==========
router.get("/payments", auth, requireRole("admin"), async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("orderId")
      .populate("payerId", "name email")
      .populate("receiverId", "name email")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== EXPORT REPORT (JSON) ==========
router.get("/export", auth, requireRole("admin"), async (req, res) => {
  try {
    const { type } = req.query; // "users", "orders", "payments", "farmers", "businesses"

    let data;
    if (type === "users") data = await User.find().select("-password");
    else if (type === "orders") data = await Order.find().populate("buyerId", "name email");
    else if (type === "payments") data = await Payment.find().populate("payerId", "name").populate("receiverId", "name");
    else if (type === "farmers") data = await Farmer.find().populate("userId", "name email phone");
    else if (type === "businesses") data = await Business.find().populate("userId", "name email phone");
    else return res.status(400).json({ error: "Invalid export type." });

    res.json({ exportedAt: new Date().toISOString(), type, count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
