const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  pricePerUnit: { type: Number, required: true },
  total: { type: Number, required: true },
});

const orderSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  buyerRole: { type: String, enum: ["b2b", "customer"], required: true },
  
  items: [orderItemSchema],
  
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "processing", "shipped", "in_transit", "delivered", "cancelled"],
    default: "pending",
  },
  
  deliveryAddress: { type: String, required: true },
  deliveryLatitude: { type: Number, default: null },
  deliveryLongitude: { type: Number, default: null },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  paymentMethod: { type: String, enum: ["upi", "bank_transfer", "card", "cod", "wallet", "razorpay"], default: "upi" },
  
  // Tracking
  trackingNumber: { type: String, default: "" },
  deliveryPartner: { type: String, default: "" },
  estimatedDelivery: { type: Date },
  actualDelivery: { type: Date },
  
  notes: { type: String, default: "" },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", orderSchema);
