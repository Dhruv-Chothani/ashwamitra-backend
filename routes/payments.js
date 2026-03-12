const express = require("express");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { auth } = require("../middleware/auth");

const router = express.Router();

const PAYMENT_METHODS = ["upi", "bank_transfer", "card", "cod", "wallet", "razorpay"];

const resolveReceiverUserId = async (order) => {
  if (!order.items?.length) return null;
  const firstProduct = await Product.findById(order.items[0].productId).populate("farmerId");
  return firstProduct?.farmerId?.userId || null;
};

const canAccessPayment = (user, payment) => {
  if (user.role === "admin") return true;
  return String(payment.payerId) === String(user._id) || String(payment.receiverId) === String(user._id);
};

// ========== CREATE PAYMENT ==========
router.post("/", auth, async (req, res) => {
  try {
    const { orderId, method, upiTransactionId, bankReference } = req.body;
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Valid orderId is required." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found." });

    const isOwner = String(order.buyerId) === String(req.user._id);
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized access to order." });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ error: "Order is already paid." });
    }

    const paymentMethod = method || order.paymentMethod || "upi";
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method." });
    }

    const receiverId = await resolveReceiverUserId(order);
    if (!receiverId) {
      return res.status(400).json({ error: "Could not resolve payment receiver for this order." });
    }

    const payment = new Payment({
      orderId: order._id,
      payerId: order.buyerId,
      receiverId,
      amount: order.totalAmount,
      method: paymentMethod,
      upiTransactionId: upiTransactionId || "",
      bankReference: bankReference || "",
      status: "processing",
      updatedAt: new Date(),
    });

    await payment.save();

    // Update order payment status to processing until settlement/verification.
    order.paymentStatus = "pending";
    order.updatedAt = new Date();
    await order.save();

    // Notify farmer
    await new Notification({
      userId: receiverId,
      type: "payment_received",
      title: "Payment Initiated",
      message: `Payment initiated for order #${order._id.toString().slice(-6)}.`,
      data: { paymentId: payment._id, orderId: order._id },
    }).save();

    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET MY PAYMENTS ==========
router.get("/my-payments", auth, async (req, res) => {
  try {
    const payments = await Payment.find({
      $or: [{ payerId: req.user._id }, { receiverId: req.user._id }],
    })
      .populate("orderId")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET PAYMENT BY ID ==========
router.get("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid payment id." });
    }

    const payment = await Payment.findById(req.params.id)
      .populate("orderId")
      .populate("payerId", "name email")
      .populate("receiverId", "name email");

    if (!payment) return res.status(404).json({ error: "Payment not found." });

    if (!canAccessPayment(req.user, payment)) {
      return res.status(403).json({ error: "Access denied." });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SETTLE PAYMENT (Admin) ==========
router.put("/:id/settle", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: "Payment not found." });

    payment.status = "completed";
    payment.settledAt = new Date();
    payment.updatedAt = new Date();
    await payment.save();

    await Order.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "paid",
      updatedAt: new Date(),
    });

    res.json({ message: "Payment settled.", payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
