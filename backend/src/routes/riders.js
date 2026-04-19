const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query: db } = require('../config/database');
const { auth, solo } = require('../middleware/auth');

const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  next();
};

// ── GET /api/riders/perfil ────────────────────────────────────────────────
router.get('/perfil', auth, solo('rider'), async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT r.*, u.email, u.nombre, u.telefono,
              (SELECT COUNT(*) FROM pedidos
               WHERE rider_id = r.id
                 AND estado = 'entregado'
                 AND entregado_at >= CURRENT_DATE) AS entregas_hoy,
              (SELECT COALESCE(SUM(tarifa_entrega),0) FROM pedidos
               WHERE rider_id = r.id
                 AND estado = 'entregado'
                 AND entregado_at >= CURRENT_DATE) AS ganado_hoy
       FROM riders r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.usuario_id = $1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Rider no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PUT /api/riders/disponibilidad ────────────────────────────────────────
// El rider activa/desactiva su disponibilidad y actualiza ubicación
router.put('/disponibilidad',
  auth, solo('rider'),
  [
    body('disponible').isBoolean(),
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  ],
  validar,
  async (req, res, next) => {
    const { disponible, lat, lng } = req.body;
    try {
      const { rows } = await db(
        `UPDATE riders
         SET disponible = $1,
             lat = COALESCE($2, lat),
             lng = COALESCE($3, lng)
         WHERE usuario_id = $4
         RETURNING id, disponible, lat, lng`,
        [disponible, lat, lng, req.usuario.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// ── PUT /api/riders/ubicacion ─────────────────────────────────────────────
// Actualización de ubicación en tiempo real (llamado frecuente)
router.put('/ubicacion',
  auth, solo('rider'),
  [
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  ],
  validar,
  async (req, res, next) => {
    const { lat, lng } = req.body;
    try {
      await db(
        'UPDATE riders SET lat = $1, lng = $2 WHERE usuario_id = $3',
        [lat, lng, req.usuario.id]
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ── GET /api/riders/pedidos ───────────────────────────────────────────────
// Historial de pedidos del rider
router.get('/pedidos', auth, solo('rider'), async (req, res, next) => {
  const { estado, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const { rows: [rider] } = await db(
      'SELECT id FROM riders WHERE usuario_id = $1', [req.usuario.id]
    );
    if (!rider) return res.status(404).json({ error: 'Rider no encontrado' });

    const params = [rider.id, limit, offset];
    let filtroEstado = '';
    if (estado) {
      params.push(estado);
      filtroEstado = `AND p.estado = $${params.length}`;
    }

    const { rows } = await db(
      `SELECT p.id, p.cliente_nombre, p.cliente_telefono, p.notas, p.direccion_entrega, p.estado,
              p.tarifa_entrega, p.distancia_km, p.created_at, p.entregado_at,
              p.asignado_at, p.retiro_at, p.lat_entrega, p.lng_entrega,
              n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       WHERE p.rider_id = $1 ${filtroEstado}
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/riders/pedidos/disponibles ───────────────────────────────────
// Pedidos pendientes con indicador de compatibilidad multi-pedido
router.get('/pedidos/disponibles', auth, solo('rider'), async (req, res, next) => {
  try {
    const { rows: [rider] } = await db(
      'SELECT id FROM riders WHERE usuario_id = $1', [req.usuario.id]
    );
    if (!rider) return res.status(404).json({ error: 'Rider no encontrado' });

    // Pedidos activos del rider
    const { rows: activos } = await db(
      `SELECT negocio_id, lat_entrega, lng_entrega
       FROM pedidos WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
      [rider.id]
    );

    const { rows: disponibles } = await db(
      `SELECT p.id, p.cliente_nombre, p.direccion_entrega,
              p.tarifa_entrega, p.distancia_km, p.created_at,
              p.lat_entrega, p.lng_entrega, p.negocio_id,
              n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       WHERE p.estado = 'pendiente'
       ORDER BY p.created_at ASC
       LIMIT 20`
    );

    // Enriquecer con compatibilidad
    const resultado = disponibles.map(p => {
      let compatibilidad = null;
      if (activos.length === 0) {
        compatibilidad = 'libre'; // puede tomar cualquiera
      } else {
        const mismoLocal = activos.some(a => a.negocio_id === p.negocio_id);
        if (mismoLocal) {
          compatibilidad = 'mismo_local';
        } else {
          const cercano = activos.find(a =>
            a.lat_entrega && a.lng_entrega && p.lat_entrega && p.lng_entrega &&
            haversineRiders(a.lat_entrega, a.lng_entrega, p.lat_entrega, p.lng_entrega) <= 3
          );
          if (cercano) compatibilidad = 'ruta_cercana';
        }
      }
      return { ...p, compatibilidad };
    });

    res.json(resultado);
  } catch (err) { next(err); }
});

function haversineRiders(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── POST /api/riders/push-subscription — guardar suscripción Web Push ────────
router.post('/push-subscription', auth, solo('rider'), async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'Suscripción requerida' });
    await db(
      `UPDATE riders SET push_subscription = $1 WHERE usuario_id = $2`,
      [JSON.stringify(subscription), req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── GET /api/riders/vapid-public-key — clave pública para suscripción ────────
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
