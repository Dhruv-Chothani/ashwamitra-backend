const express = require("express");
const multer = require("multer");
const Product = require("../models/Product");
const Farmer = require("../models/Farmer");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/products"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ========== CREATE PRODUCT (Farmer only) ==========
router.post("/", auth, requireRole("farmer"), upload.array("images", 5), async (req, res) => {
  try {
    console.log("Product creation request:", req.body);
    console.log("Files:", req.files);
    
    const farmer = await Farmer.findOne({ userId: req.user._id });
    if (!farmer) return res.status(404).json({ error: "Farmer profile not found." });

    // Map frontend field names to backend schema
    const { name, category, quantity, unit, price, description, minimumOrder, marketPrice, quality, imageUrl, isOrganic } = req.body;
    
    // Validate required fields with frontend field names
    if (!name || !category || !price || !unit || !quantity) {
      return res.status(400).json({ 
        error: "Missing required fields",
        required: { name, category, price, unit, quantity },
        message: "Please provide name, category, price, unit, and quantity"
      });
    }

    // Convert and validate numeric values
    const pricePerUnit = Number(price);
    const availableQuantity = Number(quantity);
    const minOrder = Number(minimumOrder) || 1;
    const marketPriceValue = Number(marketPrice) || 0;
    
    console.log("Numeric conversions:", {
      originalPrice: price,
      convertedPrice: pricePerUnit,
      originalQuantity: quantity,
      convertedQuantity: availableQuantity,
      priceIsNaN: isNaN(pricePerUnit),
      quantityIsNaN: isNaN(availableQuantity)
    });

    if (isNaN(pricePerUnit) || pricePerUnit <= 0) {
      return res.status(400).json({ error: "Price must be a valid positive number" });
    }
    
    if (isNaN(availableQuantity) || availableQuantity <= 0) {
      return res.status(400).json({ error: "Quantity must be a valid positive number" });
    }

    const product = new Product({
      farmerId: farmer._id,
      name: name,
      category: category,
      description: description || "",
      pricePerUnit: pricePerUnit,
      unit: unit,
      availableQuantity: availableQuantity,
      minimumOrder: minOrder,
      village: farmer.village,
      district: farmer.district,
      state: farmer.state,
      marketPrice: marketPriceValue,
      quality: quality || "Standard",
      imageUrl: imageUrl || "",
      isOrganic: isOrganic === "true" || isOrganic === true,
      images: req.files ? req.files.map((f) => `/uploads/products/${f.filename}`) : [],
    });

    console.log("Product before save:", {
      pricePerUnit: product.pricePerUnit,
      availableQuantity: product.availableQuantity,
      quality: product.quality,
      imageUrl: product.imageUrl,
      isOrganic: product.isOrganic,
      types: {
        pricePerUnitType: typeof product.pricePerUnit,
        availableQuantityType: typeof product.availableQuantity
      }
    });

    await product.save();
    console.log("Product created successfully:", {
      id: product._id,
      pricePerUnit: product.pricePerUnit,
      availableQuantity: product.availableQuantity,
      quality: product.quality,
      imageUrl: product.imageUrl,
      isOrganic: product.isOrganic
    });

    // Update farmer stats
    farmer.totalProducts += 1;
    await farmer.save();

    res.status(201).json(product);
  } catch (err) {
    console.error("Product creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET ALL PRODUCTS (with filters) ==========
router.get("/", async (req, res) => {
  try {
    const { category, state, district, village, search, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query;

    const filter = { isAvailable: true };
    if (category) filter.category = category;
    if (state) filter.state = { $regex: state, $options: "i" };
    if (district) filter.district = { $regex: district, $options: "i" };
    if (village) filter.village = { $regex: village, $options: "i" };
    if (search) filter.name = { $regex: search, $options: "i" };
    if (minPrice || maxPrice) {
      filter.pricePerUnit = {};
      if (minPrice) filter.pricePerUnit.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerUnit.$lte = Number(maxPrice);
    }

    let sortOption = { createdAt: -1 };
    if (sort === "price_asc") sortOption = { pricePerUnit: 1 };
    if (sort === "price_desc") sortOption = { pricePerUnit: -1 };
    if (sort === "popular") sortOption = { totalSold: -1 };

    const skip = (Number(page) - 1) * Number(limit);
    const products = await Product.find(filter)
      .populate("farmerId", "village district state rating")
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(filter);

    res.json({ products, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET FARMER'S PRODUCTS ==========
router.get("/farmer/my-products", auth, requireRole("farmer"), async (req, res) => {
  try {
    let farmer = await Farmer.findOne({ userId: req.user._id });

    if (!farmer) {
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
    }

    const products = await Product.find({ farmerId: farmer._id }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET SINGLE PRODUCT ==========
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("farmerId");
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== UPDATE PRODUCT (Farmer only) ==========
router.put("/:id", auth, requireRole("farmer"), async (req, res) => {
  try {
    console.log("Product update request:", req.params.id, req.body);
    
    const farmer = await Farmer.findOne({ userId: req.user._id });
    const product = await Product.findOne({ _id: req.params.id, farmerId: farmer._id });
    if (!product) return res.status(404).json({ error: "Product not found or not yours." });

    // Map frontend field names and update fields
    const { name, category, quantity, unit, price, description, minimumOrder, marketPrice, quality, imageUrl, isOrganic } = req.body;
    
    // Update basic fields
    if (name) product.name = name;
    if (category) product.category = category;
    if (description !== undefined) product.description = description;
    
    // Update numeric fields with validation
    if (price !== undefined) {
      const pricePerUnit = Number(price);
      if (isNaN(pricePerUnit) || pricePerUnit <= 0) {
        return res.status(400).json({ error: "Price must be a valid positive number" });
      }
      product.pricePerUnit = pricePerUnit;
    }
    
    if (quantity !== undefined) {
      const availableQuantity = Number(quantity);
      if (isNaN(availableQuantity) || availableQuantity <= 0) {
        return res.status(400).json({ error: "Quantity must be a valid positive number" });
      }
      product.availableQuantity = availableQuantity;
    }
    
    if (unit) product.unit = unit;
    if (minimumOrder !== undefined) product.minimumOrder = Number(minimumOrder) || 1;
    if (marketPrice !== undefined) product.marketPrice = Number(marketPrice) || 0;
    
    // Update new fields
    if (quality) product.quality = quality;
    if (imageUrl !== undefined) product.imageUrl = imageUrl;
    if (isOrganic !== undefined) product.isOrganic = isOrganic === "true" || isOrganic === true;
    
    product.updatedAt = new Date();
    
    console.log("Product before update save:", {
      pricePerUnit: product.pricePerUnit,
      availableQuantity: product.availableQuantity,
      quality: product.quality,
      imageUrl: product.imageUrl,
      isOrganic: product.isOrganic
    });
    
    await product.save();
    console.log("Product updated successfully:", product._id);
    
    res.json(product);
  } catch (err) {
    console.error("Product update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== DELETE PRODUCT (Farmer only) ==========
router.delete("/:id", auth, requireRole("farmer"), async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ userId: req.user._id });
    const product = await Product.findOneAndDelete({ _id: req.params.id, farmerId: farmer._id });
    if (!product) return res.status(404).json({ error: "Product not found or not yours." });

    farmer.totalProducts = Math.max(0, farmer.totalProducts - 1);
    await farmer.save();

    res.json({ message: "Product deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
