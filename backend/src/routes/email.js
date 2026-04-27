const express = require('express');
const nodemailer = require('nodemailer');
const { auth, solo } = require('../middleware/auth');

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// POST /api/email/enviar — solo admin
router.post('/enviar', auth, solo('admin'), async (req, res, next) => {
  try {
    const { para, asunto, cuerpo } = req.body;
    if (!para || !asunto || !cuerpo) {
      return res.status(400).json({ error: 'Faltan campos: para, asunto, cuerpo' });
    }
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return res.status(503).json({ error: 'Email no configurado en el servidor' });
    }
    await transporter.sendMail({
      from: `RepartoJusto <${process.env.GMAIL_USER}>`,
      to: para,
      subject: asunto,
      text: cuerpo
    });
    res.json({ ok: true, mensaje: `Email enviado a ${para}` });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
