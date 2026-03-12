const crypto = require("crypto");
const Razorpay = require("razorpay");

const hasConfig = () => !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

const razorpay = hasConfig()
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

class RazorpayService {
  static ensureConfigured() {
    if (!razorpay) {
      throw new Error("Razorpay is not configured. Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET.");
    }
  }

  static async createOrder({ amount, currency = "INR", receipt, notes = {} }) {
    this.ensureConfigured();
    const amountInPaise = Math.round(Number(amount) * 100);

    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      throw new Error("Amount must be a positive number.");
    }

    return razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes,
    });
  }

  static verifyPaymentSignature({ orderId, paymentId, signature }) {
    this.ensureConfigured();
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    return expected === signature;
  }

  static async createRefund({ paymentId, amount = null, notes = {} }) {
    this.ensureConfigured();

    const payload = { notes };
    if (amount !== null && amount !== undefined) {
      const amountInPaise = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
        throw new Error("Refund amount must be a positive number.");
      }
      payload.amount = amountInPaise;
    }

    return razorpay.payments.refund(paymentId, payload);
  }
}

module.exports = RazorpayService;
