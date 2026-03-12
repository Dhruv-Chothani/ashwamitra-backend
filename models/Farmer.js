const mongoose = require("mongoose");

const farmerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  
  // Location
  village: { type: String, default: "" },
  district: { type: String, default: "" },
  state: { type: String, default: "" },
  pinCode: { type: String, default: "" },
  fullAddress: { type: String, default: "" },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  
  // Identity & Transaction
  upiId: { type: String, default: "" },
  bankAccountNumber: { type: String, default: "" },
  ifscCode: { type: String, default: "" },
  panNumber: { type: String, default: "" },
  
  // Category: "smallholder" (UPI) or "bulk" (Bank transfer)
  category: { type: String, enum: ["smallholder", "bulk"], default: "smallholder" },
  transactionMode: { type: String, enum: ["upi", "bank"], default: "upi" },
  
  // Stats
  totalProducts: { type: Number, default: 0 },
  totalSold: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  
  isApproved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Farmer", farmerSchema);
