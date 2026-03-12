const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Farmer = require("../models/Farmer");
const Business = require("../models/Business");
const Customer = require("../models/Customer");
const { auth } = require("../middleware/auth");

const router = express.Router();
const PUBLIC_ROLES = ["farmer", "b2b", "customer", "admin"];

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

// Generate JWT
const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ========== REGISTER ==========
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, role, ...profileData } = req.body;
    const normalizedRole = normalizeString(role).toLowerCase();
    const normalizedName = normalizeString(name);
    const normalizedEmail = normalizeString(email).toLowerCase();
    const normalizedPhone = normalizeString(phone);

    if (!PUBLIC_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ error: "Invalid role selected for self-registration." });
    }
    if (!normalizedName || !normalizedEmail || !normalizedPhone || !password) {
      return res.status(400).json({ error: "Name, email, phone and password are required." });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    if (normalizedRole === "b2b") {
      const requiredB2BFields = ["businessName", "contactPerson", "officeAddress", "bankAccountNumber", "ifscCode", "panNumber"];
      const missing = requiredB2BFields.filter((field) => !normalizeString(profileData[field]));
      if (missing.length) {
        return res.status(400).json({ error: `Missing required business fields: ${missing.join(", ")}` });
      }
    }

    // Check existing user
    const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { phone: normalizedPhone }] });
    if (existingUser) {
      return res.status(400).json({ error: "Email or phone already registered." });
    }

    // Create user
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      role: normalizedRole,
      status: normalizedRole === "customer" ? "active" : "pending",
    });

    // Create role-specific profile
    try {
      if (normalizedRole === "farmer") {
        await Farmer.create({
          userId: user._id,
          village: profileData.village || "",
          district: profileData.district || "",
          state: profileData.state || "",
          pinCode: profileData.pinCode || "",
          fullAddress: profileData.fullAddress || "",
          upiId: profileData.upiId || "",
          bankAccountNumber: profileData.bankAccountNumber || "",
          ifscCode: profileData.ifscCode || "",
          panNumber: profileData.panNumber || "",
          category: profileData.bankAccountNumber ? "bulk" : "smallholder",
          transactionMode: profileData.bankAccountNumber ? "bank" : "upi",
        });
      } else if (normalizedRole === "b2b") {
        await Business.create({
          userId: user._id,
          businessName: profileData.businessName || "",
          gstin: profileData.gstin || "",
          contactPerson: profileData.contactPerson || normalizedName,
          officialEmail: profileData.officialEmail || normalizedEmail,
          officeAddress: profileData.officeAddress || "",
          warehouseAddress: profileData.warehouseAddress || "",
          bankAccountNumber: profileData.bankAccountNumber || "",
          ifscCode: profileData.ifscCode || "",
          upiId: profileData.upiId || "",
          panNumber: profileData.panNumber || "",
        });
      } else if (normalizedRole === "customer") {
        await Customer.create({
          userId: user._id,
          deliveryAddress: profileData.deliveryAddress || "",
          paymentPreference: profileData.paymentPreference || "upi",
        });
      }
    } catch (profileError) {
      await User.deleteOne({ _id: user._id });
      throw profileError;
    }

    const token = generateToken(user);
    res.status(201).json({
      message: "Registration successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== LOGIN ==========
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const normalizedEmail = normalizeString(email).toLowerCase();
    const normalizedRole = normalizeString(role).toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: "Invalid email or password." });
    if (normalizedRole && user.role !== normalizedRole) return res.status(401).json({ error: `This account is not a ${normalizedRole} account.` });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: "Invalid email or password." });

    if (user.status === "suspended") return res.status(403).json({ error: "Account suspended. Contact admin." });
    if (["inactive", "pending"].includes(user.status) && user.role !== "customer") {
      return res.status(403).json({ error: "Account is pending approval. Please contact support." });
    }

    // Update last active
    user.lastActive = new Date();
    await user.save();

    const token = generateToken(user);
    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== GET CURRENT USER ==========
router.get("/me", auth, async (req, res) => {
  try {
    let profile = null;
    if (req.user.role === "farmer") {
      profile = await Farmer.findOne({ userId: req.user._id });
    }
    else if (req.user.role === "b2b") {
      profile = await Business.findOne({ userId: req.user._id });
    }
    else if (req.user.role === "customer") {
      profile = await Customer.findOne({ userId: req.user._id });
    }

    res.json({ user: req.user, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CHANGE PASSWORD ==========
router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords are required." });
    if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters long." });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ error: "Current password is incorrect." });

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
