const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  
  businessName: { type: String, required: true },
  gstin: { type: String, unique: true, sparse: true, default: undefined },
  contactPerson: { type: String, required: true },
  officialEmail: { type: String, required: true },
  officeAddress: { type: String, required: true },
  warehouseAddress: { type: String, default: "" },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  
  // Payment
  bankAccountNumber: { type: String, required: true },
  ifscCode: { type: String, required: true },
  upiId: { type: String, default: "" },
  panNumber: { type: String, required: true },
  
  // Stats
  totalPurchases: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Business", businessSchema);
