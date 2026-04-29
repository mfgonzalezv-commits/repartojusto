const express = require('express');
const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');
const { auth, solo } = require('../middleware/auth');

const dnsLookup = promisify(dns.lookup);
const router = express.Router();

// POST /api/email/enviar — solo admin
router.post('/enviar', auth, solo('admin'), async (req, res) => {
  const { para, asunto, cuerpo } = req.body;
  if (!para || !asunto || !cuerpo) {
    return res.status(400).json({ error: 'Faltan campos: para, asunto, cuerpo' });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(503).json({ error: 'Email no configurado en el servidor' });
  }
  try {
    // Forzar IPv4: resolver hostname antes de conectar
    const { address: smtpIp } = await dnsLookup('smtp.gmail.com', { family: 4 });
    const transporter = nodemailer.createTransport({
      host: smtpIp,
      port: 587,
      secure: false,
      tls: { servername: 'smtp.gmail.com' },
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    await transporter.sendMail({
      from: `RepartoJusto <${process.env.GMAIL_USER}>`,
      to: para,
      subject: asunto,
      text: cuerpo
    });
    res.json({ ok: true, mensaje: `Email enviado a ${para}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
