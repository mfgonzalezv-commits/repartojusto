const express = require('express');
const { auth, solo } = require('../middleware/auth');

const router = express.Router();

// POST /api/email/enviar — solo admin
router.post('/enviar', auth, solo('admin'), async (req, res) => {
  const { para, asunto, cuerpo } = req.body;
  if (!para || !asunto || !cuerpo) {
    return res.status(400).json({ error: 'Faltan campos: para, asunto, cuerpo' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email no configurado (falta RESEND_API_KEY)' });
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'RepartoJusto <onboarding@resend.dev>',
        to: para,
        subject: asunto,
        text: cuerpo
      })
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(500).json({ error: data.message || 'Error al enviar' });
    res.json({ ok: true, mensaje: `Email enviado a ${para}`, id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
