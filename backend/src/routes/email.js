const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, solo } = require('../middleware/auth');

const router = express.Router();

// Rate limiter: máx 10 emails/hora por admin (previene abuso de cuota Resend)
const _emailStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of _emailStore) if (now - e.t >= 3600000) _emailStore.delete(k);
}, 30 * 60 * 1000).unref();
function emailRateLimit(req, res, next) {
  const userId = req.usuario?.id;
  const now = Date.now();
  const entry = _emailStore.get(userId);
  if (entry && now - entry.t < 3600000) {
    if (entry.n >= 10) return res.status(429).json({ error: 'Límite de 10 emails por hora alcanzado.' });
    entry.n++;
  } else {
    _emailStore.set(userId, { n: 1, t: now });
  }
  next();
}

// POST /api/email/enviar — solo admin
router.post('/enviar',
  auth, solo('admin'),
  emailRateLimit,
  [
    body('para').isEmail().normalizeEmail().withMessage('Email de destino inválido'),
    body('asunto').trim().notEmpty().isLength({ max: 200 }).withMessage('Asunto requerido (máx 200 chars)'),
    body('cuerpo').trim().notEmpty().isLength({ max: 5000 }).withMessage('Cuerpo requerido (máx 5000 chars)'),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
    const { para, asunto, cuerpo } = req.body;
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
