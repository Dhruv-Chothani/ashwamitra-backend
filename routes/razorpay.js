const express = require("express");
const mongoose = require("mongoose");
const RazorpayService = require("../services/razorpayService");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { auth } = require("../middleware/auth");

const router = express.Router();

const canAccessOrder = (user, order) => {
  if (user.role === "admin") return true;
  return String(order.buyerId) === String(user._id);
};

const canAccessPayment = (user, payment) => {
  if (user.role === "admin") return true;
  return String(payment.payerId) === String(user._id);
};

const resolveReceiverUserId = async (order) => {
  if (!order.items?.length) return null;
  const firstProduct = await Product.findById(order.items[0].productId).populate("farmerId");
  return firstProduct?.farmerId?.userId || null;
};

// Expose public key for checkout.
router.get("/config", auth, (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({ error: "Razorpay key is not configured." });
  }

  res.json({ keyId: process.env.RAZORPAY_KEY_ID });
});

// Create Razorpay order from an existing marketplace order.
router.post("/create-order", auth, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Valid orderId is required." });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (!canAccessOrder(req.user, order)) {
      return res.status(403).json({ error: "Unauthorized access to order." });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ error: "Order is already paid." });
    }

    // Enforce one unpaid Razorpay order per buyer at a time.
    // If historical duplicates exist, only the oldest pending order can proceed.
    const oldestPendingRazorpayOrder = await Order.findOne({
      buyerId: order.buyerId,
      paymentMethod: "razorpay",
      paymentStatus: { $ne: "paid" },
      status: { $ne: "cancelled" },
    })
      .sort({ createdAt: 1 })
      .select("_id");

    if (
      oldestPendingRazorpayOrder &&
      String(oldestPendingRazorpayOrder._id) !== String(order._id)
    ) {
      return res.status(409).json({
        error: "You already have a pending Razorpay order. Complete it before paying another Razorpay order.",
        pendingOrderId: oldestPendingRazorpayOrder._id,
      });
    }

    const receiverId = await resolveReceiverUserId(order);
    if (!receiverId) {
      return res.status(400).json({ error: "Could not resolve payment receiver for this order." });
    }

    const razorpayOrder = await RazorpayService.createOrder({
      amount: order.totalAmount,
      receipt: `ord_${order._id.toString().slice(-10)}`,
      notes: {
        orderId: order._id.toString(),
        buyerId: String(order.buyerId),
      },
    });

    let payment = await Payment.findOne({ orderId: order._id, providerOrderId: razorpayOrder.id });

    if (!payment) {
      payment = new Payment({
        orderId: order._id,
        payerId: order.buyerId,
        receiverId,
        amount: order.totalAmount,
        method: "razorpay",
        status: "processing",
        providerOrderId: razorpayOrder.id,
        metadata: { razorpayOrder },
        updatedAt: new Date(),
      });
      await payment.save();
    }

    order.paymentMethod = "razorpay";
    order.paymentStatus = "pending";
    order.updatedAt = new Date();
    await order.save();

    res.json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      paymentRecordId: payment._id,
      marketplaceOrderId: order._id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create Razorpay order." });
  }
});

// Verify payment signature and finalize payment/order status.
router.post("/verify", auth, async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Valid orderId is required." });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: "Missing Razorpay payment fields." });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (!canAccessOrder(req.user, order)) {
      return res.status(403).json({ error: "Unauthorized access to order." });
    }

    const isValid = RazorpayService.verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    let payment = await Payment.findOne({ orderId: order._id, providerOrderId: razorpayOrderId });
    if (!payment) {
      const receiverId = await resolveReceiverUserId(order);
      if (!receiverId) {
        return res.status(400).json({ error: "Could not resolve payment receiver for this order." });
      }

      payment = new Payment({
        orderId: order._id,
        payerId: order.buyerId,
        receiverId,
        amount: order.totalAmount,
        method: "razorpay",
        status: "pending",
        providerOrderId: razorpayOrderId,
      });
    }

    if (payment.status === "completed" && payment.providerPaymentId === razorpayPaymentId) {
      return res.json({
        success: true,
        message: "Payment already verified.",
        payment,
        order,
      });
    }

    payment.status = "completed";
    payment.transactionId = razorpayPaymentId;
    payment.providerPaymentId = razorpayPaymentId;
    payment.providerSignature = razorpaySignature;
    payment.updatedAt = new Date();
    payment.settledAt = new Date();
    await payment.save();

    order.paymentMethod = "razorpay";
    order.paymentStatus = "paid";
    if (["pending", "cancelled"].includes(order.status)) {
      order.status = "confirmed";
    }
    order.updatedAt = new Date();
    await order.save();

    await new Notification({
      userId: payment.receiverId,
      type: "payment_received",
      title: "Payment Received",
      message: `₹${order.totalAmount.toLocaleString()} received for order #${order._id.toString().slice(-6)}.`,
      data: { paymentId: payment._id, orderId: order._id },
    }).save();

    res.json({
      success: true,
      message: "Payment verified successfully.",
      payment,
      order,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to verify Razorpay payment." });
  }
});

// Refund Razorpay payment.
router.post("/refund", auth, async (req, res) => {
  try {
    const { paymentId, amount } = req.body;

    if (!paymentId || !mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ error: "Valid paymentId is required." });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found." });
    }

    if (payment.method !== "razorpay") {
      return res.status(400).json({ error: "Only Razorpay payments can be refunded here." });
    }

    if (!canAccessPayment(req.user, payment)) {
      return res.status(403).json({ error: "Unauthorized refund request." });
    }

    if (!payment.providerPaymentId) {
      return res.status(400).json({ error: "Payment provider reference is missing." });
    }

    const refund = await RazorpayService.createRefund({
      paymentId: payment.providerPaymentId,
      amount,
      notes: {
        paymentId: payment._id.toString(),
        requestedBy: req.user._id.toString(),
      },
    });

    payment.status = "refunded";
    payment.refundId = refund.id;
    payment.refundAmount = refund.amount / 100;
    payment.updatedAt = new Date();
    await payment.save();

    await Order.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "refunded",
      updatedAt: new Date(),
    });

    res.json({ refund, payment });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to process refund." });
  }
});

module.exports = router;
