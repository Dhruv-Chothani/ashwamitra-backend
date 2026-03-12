const express = require("express");
const Farmer = require("../models/Farmer");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Get farmer profile
router.get("/profile", auth, requireRole("farmer"), async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ userId: req.user._id });
    if (!farmer) return res.status(404).json({ error: "Farmer profile not found." });
    res.json(farmer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update farmer profile
router.put("/profile", auth, requireRole("farmer"), async (req, res) => {
  try {
    const farmer = await Farmer.findOneAndUpdate(
      { userId: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    res.json(farmer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get farmer dashboard stats
router.get("/dashboard", auth, requireRole("farmer"), async (req, res) => {
  try {
    console.log("Dashboard request for user:", req.user._id);
    let farmer = await Farmer.findOne({ userId: req.user._id });
    console.log("Farmer found:", farmer ? "Yes" : "No");
    
    if (!farmer) {
      console.log("Creating missing farmer profile for user:", req.user._id);
      // Create a basic farmer profile if it doesn't exist
      farmer = new Farmer({
        userId: req.user._id,
        village: "",
        district: "",
        state: "",
        pinCode: "",
        fullAddress: "",
        upiId: "",
        bankAccountNumber: "",
        ifscCode: "",
        panNumber: "",
        category: "smallholder",
        transactionMode: "upi",
      });
      await farmer.save();
      console.log("Farmer profile created successfully");
    }
    
    console.log("Fetching products for farmer:", farmer._id);
    const products = await Product.find({ farmerId: farmer._id });
    console.log("Products fetched:", products.length);
    const totalProducts = products.length;
    const totalAvailable = products.filter((p) => p.isAvailable).length;

    // Get orders containing farmer's products
    const productIds = products.map((p) => p._id);
    console.log("Product IDs for orders:", productIds);
    
    try {
      const orders = await Order.find({ "items.productId": { $in: productIds } });
      console.log("Orders found:", orders.length);
      
      const totalSold = orders.filter((o) => o.status === "delivered").length;
      const pendingOrders = orders.filter((o) => ["pending", "confirmed", "processing"].includes(o.status)).length;

      // Calculate earnings
      const totalEarnings = orders
        .filter((o) => o.status === "delivered")
        .reduce((sum, o) => {
          const farmerItems = o.items.filter((i) => productIds.some((pid) => pid.equals(i.productId)));
          return sum + farmerItems.reduce((s, i) => s + i.total, 0);
        }, 0);

      // Pending payments
      try {
        const payments = await Payment.find({ receiverId: req.user._id });
        console.log("Payments found:", payments.length);
        const pendingPayments = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);

        res.json({
          totalProducts,
          totalAvailable,
          totalSold,
          pendingOrders,
          totalEarnings,
          pendingPayments,
          rating: farmer.rating,
          isApproved: farmer.isApproved,
        });
      } catch (paymentError) {
        console.error("Payment query error:", paymentError);
        res.json({
          totalProducts,
          totalAvailable,
          totalSold,
          pendingOrders,
          totalEarnings,
          pendingPayments: 0,
          rating: farmer.rating,
          isApproved: farmer.isApproved,
        });
      }
    } catch (orderError) {
      console.error("Order query error:", orderError);
      res.json({
        totalProducts,
        totalAvailable,
        totalSold: 0,
        pendingOrders: 0,
        totalEarnings: 0,
        pendingPayments: 0,
        rating: farmer.rating,
        isApproved: farmer.isApproved,
      });
    }
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get farmer's orders
router.get("/orders", auth, requireRole("farmer"), async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ userId: req.user._id });
    if (!farmer) {
      return res.status(404).json({ error: "Farmer profile not found." });
    }
    const products = await Product.find({ farmerId: farmer._id });
    const productIds = products.map((p) => p._id);

    const orders = await Order.find({ "items.productId": { $in: productIds } })
      .populate("buyerId", "name email phone")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get farmer's payments
router.get("/payments", auth, requireRole("farmer"), async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ userId: req.user._id }).select("_id");
    if (!farmer) {
      return res.status(404).json({ error: "Farmer profile not found." });
    }
    const payments = await Payment.find({ receiverId: req.user._id })
      .populate("orderId")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
