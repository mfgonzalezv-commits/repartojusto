const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query: db, transaction } = require('../config/database');
const { auth, solo } = require('../middleware/auth');
const config = require('../config');

const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  next();
};

// Todos los endpoints de admin requieren auth + rol admin
router.use(auth, solo('admin'));

// ── GET /api/admin/metricas ───────────────────────────────────────────────────
// Dashboard: KPIs generales
router.get('/metricas', async (req, res, next) => {
  try {
    const [pedidos, riders, negocios, ingresos] = await Promise.all([
      db(`SELECT
            COUNT(*)                                              AS total,
            COUNT(*) FILTER (WHERE estado = 'pendiente')         AS pendientes,
            COUNT(*) FILTER (WHERE estado = 'en_camino')         AS en_camino,
            COUNT(*) FILTER (WHERE estado = 'entregado')         AS entregados,
            COUNT(*) FILTER (WHERE estado = 'cancelado')         AS cancelados,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24h') AS ultimas_24h
          FROM pedidos`),
      db(`SELECT
            COUNT(*)                                    AS total,
            COUNT(*) FILTER (WHERE disponible = true)  AS disponibles
          FROM riders`),
      db(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE activo = true) AS activos
          FROM negocios`),
      db(`SELECT
            COALESCE(SUM(app_fee),0)         AS app_fee_total,
            COALESCE(SUM(tarifa_entrega),0)  AS tarifas_total,
            COALESCE(AVG(distancia_km),0)    AS distancia_promedio
          FROM pedidos WHERE estado = 'entregado'`)
    ]);

    res.json({
      pedidos: pedidos.rows[0],
      riders: riders.rows[0],
      negocios: negocios.rows[0],
      ingresos: ingresos.rows[0]
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/pedidos ────────────────────────────────────────────────────
// Listado de todos los pedidos con filtros
router.get('/pedidos', async (req, res, next) => {
  const { estado, negocio_id, rider_id, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const filtros = [];

  if (estado)     { params.push(estado);     filtros.push(`p.estado = $${params.length}`); }
  if (negocio_id) { params.push(negocio_id); filtros.push(`p.negocio_id = $${params.length}`); }
  if (rider_id)   { params.push(rider_id);   filtros.push(`p.rider_id = $${params.length}`); }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  params.push(limit, offset);

  try {
    const { rows } = await db(
      `SELECT p.*,
              n.nombre_comercial,
              u_r.nombre AS rider_nombre
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/admin/usuarios ───────────────────────────────────────────────────
router.get('/usuarios', async (req, res, next) => {
  const { rol, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  const params = [limit, offset];
  let filtroRol = '';
  if (rol) { params.unshift(rol); filtroRol = 'WHERE u.rol = $1'; }

  try {
    const { rows } = await db(
      `SELECT DISTINCT ON (u.id) u.id, u.email, u.rol, u.nombre, u.telefono, u.activo, u.created_at,
              n.id AS negocio_id, n.nombre_comercial,
              r.id AS rider_id, r.disponible, r.total_entregas, r.rating
       FROM usuarios u
       LEFT JOIN negocios n ON n.usuario_id = u.id
       LEFT JOIN riders   r ON r.usuario_id = u.id
       ${filtroRol}
       ORDER BY u.id, u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PUT /api/admin/usuarios/:id/activo ────────────────────────────────────────
// Activar / desactivar usuario
router.put('/usuarios/:id/activo',
  [body('activo').isBoolean()],
  validar,
  async (req, res, next) => {
    try {
      const { rows } = await db(
        'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, email, activo',
        [req.body.activo, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// ── GET /api/admin/riders ─────────────────────────────────────────────────────
// Riders con saldo pendiente de liquidación
router.get('/riders', async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT DISTINCT ON (u.id) r.id, r.disponible, r.total_entregas, r.rating, r.saldo_pendiente,
              u.id AS usuario_id, u.nombre, u.email, u.telefono, u.activo
       FROM riders r
       JOIN usuarios u ON u.id = r.usuario_id
       ORDER BY u.id, r.saldo_pendiente DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/admin/liquidar ──────────────────────────────────────────────────
// Genera una liquidación para un rider
router.post('/liquidar',
  [
    body('rider_id').isUUID(),
    body('fecha_desde').isISO8601(),
    body('fecha_hasta').isISO8601(),
  ],
  validar,
  async (req, res, next) => {
    const { rider_id, fecha_desde, fecha_hasta } = req.body;
    try {
      // Calcular monto: suma de tarifas de pedidos entregados en el período
      const { rows: [resumen] } = await db(
        `SELECT COUNT(*) AS pedidos_count,
                COALESCE(SUM(tarifa_entrega - app_fee * $3 / 100), 0) AS monto_total
         FROM pedidos
         WHERE rider_id = $1
           AND estado = 'entregado'
           AND entregado_at BETWEEN $4 AND $5`,
        [rider_id, null, config.RESIDUAL_PCT, fecha_desde, fecha_hasta]
      );

      if (parseInt(resumen.pedidos_count) === 0) {
        return res.status(400).json({ error: 'Sin pedidos entregados en el período' });
      }

      const liquidacion = await transaction(async (client) => {
        const { rows: [liq] } = await client.query(
          `INSERT INTO liquidaciones
             (rider_id, monto_total, pedidos_count, fecha_desde, fecha_hasta, estado)
           VALUES ($1, $2, $3, $4, $5, 'pendiente')
           RETURNING *`,
          [rider_id, Math.round(resumen.monto_total), resumen.pedidos_count, fecha_desde, fecha_hasta]
        );
        await client.query(
          'UPDATE riders SET saldo_pendiente = 0 WHERE id = $1',
          [rider_id]
        );
        return liq;
      });

      res.status(201).json(liquidacion);
    } catch (err) { next(err); }
  }
);

// ── PUT /api/admin/liquidaciones/:id/pagar ────────────────────────────────────
router.put('/liquidaciones/:id/pagar', async (req, res, next) => {
  try {
    const { rows } = await db(
      `UPDATE liquidaciones SET estado = 'pagada', pagada_at = NOW()
       WHERE id = $1 AND estado = 'pendiente'
       RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Liquidación no encontrada o ya pagada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/admin/negocios ───────────────────────────────────────────────────
// Gestión de comercios: listado con actividad
router.get('/negocios', async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT n.id, n.nombre_comercial, n.categoria, n.direccion, n.activo, n.created_at,
              u.email, u.telefono,
              COUNT(p.id) AS total_pedidos,
              COUNT(p.id) FILTER (WHERE p.estado = 'entregado') AS pedidos_entregados,
              COALESCE(SUM(p.app_fee) FILTER (WHERE p.estado = 'entregado'), 0) AS app_fee_generado
       FROM negocios n
       JOIN usuarios u ON u.id = n.usuario_id
       LEFT JOIN pedidos p ON p.negocio_id = n.id
       GROUP BY n.id, u.email, u.telefono
       ORDER BY total_pedidos DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PUT /api/admin/negocios/:id/activo ────────────────────────────────────────
router.put('/negocios/:id/activo',
  [body('activo').isBoolean()],
  validar,
  async (req, res, next) => {
    try {
      const { rows } = await db(
        `UPDATE negocios SET activo = $1 WHERE id = $2 RETURNING id, nombre_comercial, activo`,
        [req.body.activo, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Negocio no encontrado' });
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// ── POST /api/admin/riders/:id/incentivo ──────────────────────────────────────
// Agrega un bono manual al saldo del rider
router.post('/riders/:id/incentivo',
  [
    body('monto').isInt({ min: 1 }),
    body('motivo').trim().notEmpty()
  ],
  validar,
  async (req, res, next) => {
    const { monto, motivo } = req.body;
    try {
      const { rows } = await db(
        `UPDATE riders SET saldo_pendiente = saldo_pendiente + $1 WHERE id = $2
         RETURNING id, saldo_pendiente`,
        [monto, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Rider no encontrado' });

      // Registrar como pago tipo incentivo
      await db(
        `INSERT INTO pagos (pedido_id, rider_id, tipo, monto, estado, metadata)
         SELECT p.id, $1, 'liquidacion', $2, 'completado', $3
         FROM pedidos p WHERE p.rider_id = $1 AND p.estado = 'entregado'
         LIMIT 1`,
        [req.params.id, monto, JSON.stringify({ motivo, tipo: 'incentivo' })]
      ).catch(() => {}); // No falla si no hay pedidos

      res.json({ ok: true, rider_id: req.params.id, monto_agregado: monto, motivo, saldo_nuevo: rows[0].saldo_pendiente });
    } catch (err) { next(err); }
  }
);

// ── GET /api/admin/metricas/ingresos ─────────────────────────────────────────
// Ingresos por día (últimos 30 días)
router.get('/metricas/ingresos', async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT DATE(created_at)  AS fecha,
              COUNT(*)          AS pedidos,
              SUM(app_fee)      AS ingreso_app,
              SUM(tarifa_entrega) AS tarifa_total
       FROM pedidos
       WHERE estado = 'entregado'
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY fecha ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PUT /api/admin/usuarios/:id — editar nombre, email, teléfono, password ──
router.put('/usuarios/:id', auth, solo('admin'), async (req, res, next) => {
  const { nombre, email, telefono, password } = req.body;
  try {
    let passwordHash = null;
    if (password) {
      const bcrypt = require('bcryptjs');
      passwordHash = await bcrypt.hash(password, 10);
    }
    const { rows: [u] } = await db(
      `UPDATE usuarios SET
         nombre   = COALESCE($1, nombre),
         email    = COALESCE($2, email),
         telefono = COALESCE($3, telefono),
         password = COALESCE($4, password)
       WHERE id = $5 RETURNING id, nombre, email, rol`,
      [nombre || null, email || null, telefono || null, passwordHash, req.params.id]
    );
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(u);
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/usuarios/:id — eliminar usuario y datos relacionados ──
router.delete('/usuarios/:id', auth, solo('admin'), async (req, res, next) => {
  try {
    await db(
      `DELETE FROM usuarios WHERE id = $1 AND rol != 'admin'`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
