const { Router } = require('express');
const { notifyTelegram, sendCustomerEmail } = require('../utils/notify');

// Public "Contact Us" enquiry endpoint for the website. Mounted at
// /api/enquiries, added to the PIN-gate exclusion list in server/index.js
// alongside /customers and /shop — real website visitors reach this with
// no login at all.
//
// Notification path: reuses notifyTelegram (already proven for order
// alerts) rather than building new infrastructure — KT and Janice already
// get Telegram push notifications on their phones, which is genuinely
// faster than checking email, per the earlier discussion about live chat
// alternatives.
module.exports = function(db) {
  const router = Router();

  // POST /api/enquiries — submit a new enquiry.
  router.post('/', async (req, res) => {
    const { name, email, phone, message } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });

    const result = db.run(`
      INSERT INTO enquiries (name, email, phone, message) VALUES (?, ?, ?, ?)
    `, [name?.trim() || null, email.trim(), phone?.trim() || null, message.trim()]);

    // Fire-and-forget notifications — never let a Telegram/email hiccup
    // block the customer's actual submission from succeeding, same
    // principle used everywhere else notifications are sent in this app.
    const telegramText =
      `📬 *New enquiry from Pawvy.co*\n` +
      `From: ${name?.trim() || 'Unknown'} (${email.trim()})` +
      (phone ? `\nPhone: ${phone.trim()}` : '') +
      `\n\n${message.trim()}`;
    notifyTelegram(telegramText).catch(err => console.error('⚠️  Enquiry Telegram notify failed:', err.message));

    sendCustomerEmail(
      email.trim(),
      'We got your message — Pawvy',
      "Thanks for reaching out! We've received your message and will get back to you soon.",
      "<p>Thanks for reaching out! We've received your message and will get back to you soon.</p>"
    ).catch(err => console.error('⚠️  Enquiry confirmation email failed:', err.message));

    res.status(201).json({ ok: true, id: result.lastID });
  });

  return router;
};
