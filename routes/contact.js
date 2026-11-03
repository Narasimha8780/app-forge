const express = require("express");
const Contact = require("../models/Contact");

const router = express.Router();

// POST /api/contact - visitor / user submits contact inquiry
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, subject, message, preferredCloud } = req.body;

    if (
      ![name, email, message].every(
        (v) => typeof v === "string" && v.trim() && v.length <= 4000,
      ) ||
      [phone, subject, preferredCloud].some(
        (v) => v !== undefined && (typeof v !== "string" || v.length > 254),
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "Please provide your name, email address, and a message.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254 || name.length > 120) {
      return res.status(400).json({ success: false, error: "Provide a valid email address and a name of up to 120 characters." });
    }
    const contactDoc = await Contact.create({
      name,
      email,
      phone,
      subject,
      message,
      preferredCloud,
    });

    return res.status(201).json({
      success: true,
      message:
        "Thank you! Your inquiry has been received. Our team will review it and follow up using the contact details you provided.",
      contactId: contactDoc._id,
    });
  } catch (err) {
    console.error("[Contact Error]:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Contact submissions are private; no public inbox endpoint.
module.exports = router;
