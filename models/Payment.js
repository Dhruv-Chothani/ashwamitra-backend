const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  payerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
  amount: { type: Number, required: true },
  method: { type: String, enum: ["upi", "bank_transfer", "card", "cod", "razorpay"], required: true },
  
  // UPI details
  upiTransactionId: { type: String, default: "" },
  
  // Bank transfer details
  bankReference: { type: String, default: "" },

  // External payment provider references
  transactionId: { type: String, default: "" },
  providerOrderId: { type: String, default: "" },
  providerPaymentId: { type: String, default: "" },
  providerSignature: { type: String, default: "" },
  refundId: { type: String, default: "" },
  refundAmount: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  
  status: { type: String, enum: ["pending", "processing", "completed", "failed", "refunded"], default: "pending" },
  
  settledAt: { type: Date },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Payment", paymentSchema);
