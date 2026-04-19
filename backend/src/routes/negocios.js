const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const { query: db } = require('../config/database');
const { auth, solo } = require('../middleware/auth');
const config = require('../config');

// ── Mock cobros (sandbox) — reemplazar con Flow/Stripe en producción ──────
const cobros = {
  async registrarTarjeta({ negocio_id, email }) {
    if (config.FLOW_ENVIRONMENT === 'sandbox') {
      return { customerId: `CUST_${negocio_id.substring(0, 8)}` };
    }
    throw new Error('Integración producción no implementada');
  },
  async cobrar({ customerId, monto }) {
    if (config.FLOW_ENVIRONMENT === 'sandbox') {
      return { ok: true, transaccion_id: `TXN_${Date.now()}` };
    }
    throw new Error('Integración producción no implementada');
  },
};

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

// ── Helper: calcula cargo_negocio y cargo_cliente según estrategia ────────
const ESTRATEGIAS_VALIDAS = [
  'todo_incluido', 'cliente_paga_todo', 'fee_negocio_envio_cliente',
  'mitad_mitad', 'personalizado'
];
function calcularCargos(tarifa_entrega, app_fee, estrategia, pct_negocio) {
  const total = tarifa_entrega + app_fee;
  switch (estrategia) {
    case 'todo_incluido':          return { cargo_negocio: total,                      cargo_cliente: 0 };
    case 'cliente_paga_todo':      return { cargo_negocio: 0,                          cargo_cliente: total };
    case 'fee_negocio_envio_cliente': return { cargo_negocio: app_fee,                 cargo_cliente: tarifa_entrega };
    case 'mitad_mitad':            return { cargo_negocio: Math.round(total / 2),      cargo_cliente: Math.round(total / 2) };
    case 'personalizado': {
      const pct = Math.max(0, Math.min(100, pct_negocio || 100));
      return { cargo_negocio: Math.round(total * pct / 100), cargo_cliente: Math.round(total * (100 - pct) / 100) };
    }
    default: return { cargo_negocio: total, cargo_cliente: 0 };
  }
}

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
    body('estrategia_cobro').optional().isIn(ESTRATEGIAS_VALIDAS),
    body('pct_negocio').optional().isInt({ min: 0, max: 100 }),
    body('mostrar_costo_seguimiento').optional().isBoolean(),
  ],
  validar,
  async (req, res, next) => {
    const { nombre_comercial, descripcion, direccion, lat, lng, categoria,
            estrategia_cobro, pct_negocio, mostrar_costo_seguimiento } = req.body;
    try {
      const { rows } = await db(
        `UPDATE negocios
         SET nombre_comercial           = COALESCE($1,  nombre_comercial),
             descripcion                = COALESCE($2,  descripcion),
             direccion                  = COALESCE($3,  direccion),
             lat                        = COALESCE($4,  lat),
             lng                        = COALESCE($5,  lng),
             categoria                  = COALESCE($6,  categoria),
             estrategia_cobro           = COALESCE($8,  estrategia_cobro),
             pct_negocio                = COALESCE($9,  pct_negocio),
             mostrar_costo_seguimiento  = COALESCE($10, mostrar_costo_seguimiento)
         WHERE usuario_id = $7
         RETURNING *`,
        [nombre_comercial, descripcion, direccion, lat, lng, categoria,
         req.usuario.id, estrategia_cobro, pct_negocio,
         mostrar_costo_seguimiento === undefined ? null : mostrar_costo_seguimiento]
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

// ── GET /api/negocios/tarjeta ─────────────────────────────────────────────
// Estado de la tarjeta registrada del negocio
router.get('/tarjeta', auth, solo('negocio'), async (req, res, next) => {
  try {
    const { rows: [neg] } = await db(
      `SELECT tarjeta_ultimos4, tarjeta_marca, tarjeta_exp, tarjeta_registrada_at
       FROM negocios WHERE usuario_id = $1`,
      [req.usuario.id]
    );
    if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });
    const tiene = !!neg.tarjeta_ultimos4;
    res.json({ tiene, ...neg });
  } catch (err) { next(err); }
});

// ── POST /api/negocios/tarjeta ────────────────────────────────────────────
// Registrar tarjeta (en sandbox acepta datos directamente)
router.post('/tarjeta',
  auth, solo('negocio'),
  [
    body('ultimos4').isLength({ min: 4, max: 4 }).isNumeric(),
    body('marca').trim().notEmpty(),
    body('exp').matches(/^\d{2}\/\d{4}$/),
  ],
  async (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });

    const { ultimos4, marca, exp } = req.body;
    try {
      const { rows: [neg] } = await db(
        'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
      );
      if (!neg) return res.status(404).json({ error: 'Negocio no encontrado' });

      const { customerId } = await cobros.registrarTarjeta({
        negocio_id: neg.id,
        email: req.usuario.email,
      });

      await db(
        `UPDATE negocios
         SET tarjeta_customer_id   = $1,
             tarjeta_token         = $2,
             tarjeta_ultimos4      = $3,
             tarjeta_marca         = $4,
             tarjeta_exp           = $5,
             tarjeta_registrada_at = NOW()
         WHERE id = $6`,
        [customerId, crypto.randomUUID(), ultimos4, marca, exp, neg.id]
      );

      res.json({ ok: true, ultimos4, marca, exp });
    } catch (err) { next(err); }
  }
);

// ── DELETE /api/negocios/tarjeta ──────────────────────────────────────────
router.delete('/tarjeta', auth, solo('negocio'), async (req, res, next) => {
  try {
    await db(
      `UPDATE negocios
       SET tarjeta_customer_id = NULL, tarjeta_token = NULL,
           tarjeta_ultimos4 = NULL, tarjeta_marca = NULL,
           tarjeta_exp = NULL, tarjeta_registrada_at = NULL
       WHERE usuario_id = $1`,
      [req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/negocios/clientes ─────────────────────────────────────────────
router.get('/clientes', auth, solo('negocio'), async (req, res, next) => {
  try {
    const neg = await _getNegocio(req.user.id);
    const { rows } = await db(
      `SELECT c.*, COUNT(p.id) AS pedidos_count,
              MAX(p.created_at) AS ultimo_pedido
       FROM clientes c
       LEFT JOIN pedidos p ON p.cliente_id = c.id
       WHERE c.negocio_id = $1
       GROUP BY c.id
       ORDER BY MAX(p.created_at) DESC NULLS LAST`,
      [neg.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/negocios/resumen?periodo=hoy|semana|mes|todo ─────────────────
router.get('/resumen', auth, solo('negocio'), async (req, res, next) => {
  try {
    const neg = await _getNegocio(req.user.id);
    const periodo = req.query.periodo || 'mes';
    const filtros = {
      hoy:    `AND p.created_at >= CURRENT_DATE`,
      semana: `AND p.created_at >= date_trunc('week', NOW())`,
      mes:    `AND p.created_at >= date_trunc('month', NOW())`,
      todo:   '',
    };
    const filtro = filtros[periodo] || filtros.mes;

    const { rows: [kpi] } = await db(
      `SELECT
         COUNT(*) FILTER (WHERE p.estado = 'entregado')                        AS entregados,
         COUNT(*) FILTER (WHERE p.estado = 'cancelado')                        AS cancelados,
         COUNT(*) FILTER (WHERE p.estado NOT IN ('entregado','cancelado'))      AS en_curso,
         COALESCE(SUM(p.cargo_negocio) FILTER (WHERE p.estado = 'entregado'),0) AS gasto_total,
         COALESCE(SUM(500)             FILTER (WHERE p.estado = 'entregado'),0) AS gasto_plataforma,
         COALESCE(SUM(p.tarifa_entrega) FILTER (WHERE p.estado = 'entregado'),0) AS gasto_envios
       FROM pedidos p
       WHERE p.negocio_id = $1 ${filtro}`,
      [neg.id]
    );

    const { rows: porDia } = await db(
      `SELECT DATE(p.created_at) AS dia, COUNT(*) AS total
       FROM pedidos p
       WHERE p.negocio_id = $1 AND p.estado = 'entregado' ${filtro}
       GROUP BY dia ORDER BY dia`,
      [neg.id]
    );

    res.json({ kpi, porDia });
  } catch (err) { next(err); }
});

// Exportar cobros y calcularCargos para usar en pedidos.js
module.exports = router;
module.exports.cobros = cobros;
module.exports.calcularCargos = calcularCargos;
