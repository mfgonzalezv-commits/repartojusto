const express = require('express');
const nodemailer = require('nodemailer');
const { auth, solo } = require('../middleware/auth');

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
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      family: 4,
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
