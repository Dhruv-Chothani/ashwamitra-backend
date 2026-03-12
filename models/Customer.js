const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  
  deliveryAddress: { type: String, default: "" },
  paymentPreference: { type: String, enum: ["upi", "card", "netbanking", "cod"], default: "upi" },
  
  // Stats
  totalPurchases: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  totalSavings: { type: Number, default: 0 },
  savingsPercentage: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Customer", customerSchema);
