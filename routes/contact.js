const express = require('express');
const Contact = require('../models/Contact');

const router = express.Router();

// POST /api/contact - visitor / user submits contact inquiry
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, subject, message, preferredCloud } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Please provide your name, email address, and a message.'
      });
    }

    const contactDoc = await Contact.create({
      name,
      email,
      phone,
      subject,
      message,
      preferredCloud
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your inquiry has been received. Our engineering team will assist your app setup promptly.',
      contactId: contactDoc._id
    });
  } catch (err) {
    console.error('[Contact Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/contact - view submitted inquiries
router.get('/', async (req, res) => {
  try {
    const inquiries = await Contact.listAll();
    return res.json({ success: true, count: inquiries.length, inquiries });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

