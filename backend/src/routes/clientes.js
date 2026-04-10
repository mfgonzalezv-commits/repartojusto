const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query: db } = require('../config/database');
const { auth, solo } = require('../middleware/auth');

const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  next();
};

// Helper: obtener negocio_id del usuario autenticado
async function getNegocioId(usuario_id) {
  const { rows } = await db('SELECT id FROM negocios WHERE usuario_id = $1', [usuario_id]);
  return rows[0]?.id || null;
}

// ── GET /api/clientes?telefono=56912345678 ────────────────────────────────────
// Buscar cliente por teléfono (para autocompletar)
router.get('/', auth, solo('negocio'), async (req, res, next) => {
  const { telefono, q } = req.query;
  try {
    const negocio_id = await getNegocioId(req.usuario.id);
    if (!negocio_id) return res.status(404).json({ error: 'Negocio no encontrado' });

    if (telefono) {
      const { rows } = await db(
        'SELECT * FROM clientes WHERE negocio_id = $1 AND telefono = $2',
        [negocio_id, telefono]
      );
      return res.json(rows[0] || null);
    }

    if (q) {
      const { rows } = await db(
        `SELECT * FROM clientes
         WHERE negocio_id = $1 AND (nombre ILIKE $2 OR telefono ILIKE $2)
         ORDER BY total_pedidos DESC LIMIT 10`,
        [negocio_id, `%${q}%`]
      );
      return res.json(rows);
    }

    const { rows } = await db(
      'SELECT * FROM clientes WHERE negocio_id = $1 ORDER BY total_pedidos DESC LIMIT 50',
      [negocio_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/clientes ────────────────────────────────────────────────────────
// Crear o actualizar cliente (upsert por teléfono)
router.post('/',
  auth, solo('negocio'),
  [
    body('nombre').trim().notEmpty(),
    body('telefono').trim().notEmpty(),
    body('direccion').optional().trim(),
    body('lat').optional().isFloat(),
    body('lng').optional().isFloat(),
    body('notas').optional().trim(),
  ],
  validar,
  async (req, res, next) => {
    const { nombre, telefono, direccion, lat, lng, notas } = req.body;
    try {
      const negocio_id = await getNegocioId(req.usuario.id);
      if (!negocio_id) return res.status(404).json({ error: 'Negocio no encontrado' });

      const { rows: [cliente] } = await db(
        `INSERT INTO clientes (negocio_id, nombre, telefono, direccion, lat, lng, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (negocio_id, telefono) DO UPDATE
           SET nombre    = EXCLUDED.nombre,
               direccion = COALESCE(EXCLUDED.direccion, clientes.direccion),
               lat       = COALESCE(EXCLUDED.lat, clientes.lat),
               lng       = COALESCE(EXCLUDED.lng, clientes.lng),
               notas     = COALESCE(EXCLUDED.notas, clientes.notas),
               updated_at = NOW()
         RETURNING *`,
        [negocio_id, nombre, telefono, direccion, lat, lng, notas]
      );
      res.status(201).json(cliente);
    } catch (err) { next(err); }
  }
);

module.exports = router;
