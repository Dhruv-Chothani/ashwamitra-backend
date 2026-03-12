const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ["grains", "vegetables", "spices", "fruits", "pulses", "dairy", "other", "Vegetables", "Grains", "Spices", "Fruits", "Pulses", "Dairy", "Other"], required: true },
  description: { type: String, default: "" },
  
  pricePerUnit: { type: Number, required: true },
  unit: { type: String, enum: ["kg", "gram", "quintal", "ton", "piece", "dozen", "litre", "KG", "Gram", "Quintal", "Ton", "Piece", "Dozen", "Litre"], required: true },
  availableQuantity: { type: Number, required: true },
  minimumOrder: { type: Number, default: 1 },
  
  // New fields
  quality: { type: String, enum: ["Standard", "Premium", "Organic"], default: "Standard" },
  imageUrl: { type: String, default: "" },
  isOrganic: { type: Boolean, default: false },
  
  // Location (inherited from farmer but can override)
  village: { type: String },
  district: { type: String },
  state: { type: String },
  
  images: [{ type: String }],
  
  marketPrice: { type: Number, default: 0 }, // local market comparison price
  isAvailable: { type: Boolean, default: true },
  
  totalSold: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ category: 1, state: 1, district: 1, village: 1 });

module.exports = mongoose.model("Product", productSchema);
