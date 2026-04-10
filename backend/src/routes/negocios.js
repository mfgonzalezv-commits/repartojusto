const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query: db } = require('../config/database');
const { auth, solo } = require('../middleware/auth');

const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  next();
};

// ── GET /api/negocios/perfil ──────────────────────────────────────────────
// Perfil del negocio autenticado
router.get('/perfil', auth, solo('negocio'), async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT n.*, u.email, u.telefono
       FROM negocios n
       JOIN usuarios u ON u.id = n.usuario_id
       WHERE n.usuario_id = $1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Negocio no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PUT /api/negocios/perfil ──────────────────────────────────────────────
router.put('/perfil',
  auth, solo('negocio'),
  [
    body('nombre_comercial').optional().trim().notEmpty(),
    body('descripcion').optional().trim(),
    body('direccion').optional().trim().notEmpty(),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('categoria').optional().trim(),
  ],
  validar,
  async (req, res, next) => {
    const { nombre_comercial, descripcion, direccion, lat, lng, categoria } = req.body;
    try {
      const { rows } = await db(
        `UPDATE negocios
         SET nombre_comercial = COALESCE($1, nombre_comercial),
             descripcion      = COALESCE($2, descripcion),
             direccion        = COALESCE($3, direccion),
             lat              = COALESCE($4, lat),
             lng              = COALESCE($5, lng),
             categoria        = COALESCE($6, categoria)
         WHERE usuario_id = $7
         RETURNING *`,
        [nombre_comercial, descripcion, direccion, lat, lng, categoria, req.usuario.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// ── GET /api/negocios/pedidos ─────────────────────────────────────────────
// Pedidos del negocio (con paginación simple)
router.get('/pedidos', auth, solo('negocio'), async (req, res, next) => {
  const { estado, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    // Obtener negocio_id
    const { rows: [negocio] } = await db(
      'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
    );
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const params = [negocio.id, limit, offset];
    let filtroEstado = '';
    if (estado) {
      params.push(estado);
      filtroEstado = `AND p.estado = $${params.length}`;
    }

    const { rows } = await db(
      `SELECT p.*,
              r_u.nombre AS rider_nombre, r_u.telefono AS rider_telefono
       FROM pedidos p
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios r_u ON r_u.id = ri.usuario_id
       WHERE p.negocio_id = $1 ${filtroEstado}
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/negocios/pedidos/:id ─────────────────────────────────────────
router.get('/pedidos/:id', auth, solo('negocio'), async (req, res, next) => {
  try {
    const { rows: [negocio] } = await db(
      'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
    );
    const { rows } = await db(
      `SELECT p.*,
              r_u.nombre AS rider_nombre, r_u.telefono AS rider_telefono,
              ri.vehiculo_tipo, ri.rating AS rider_rating
       FROM pedidos p
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios r_u ON r_u.id = ri.usuario_id
       WHERE p.id = $1 AND p.negocio_id = $2`,
      [req.params.id, negocio.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
