const router = require('express').Router();
const crypto = require('crypto');
const { query: db, transaction } = require('../config/database');
const { auth, solo } = require('../middleware/auth');
const config = require('../config');

// ── Helpers Flow (modo sandbox/mock) ─────────────────────────────────────────
// En producción reemplazar con llamadas reales a api.flow.cl
const flow = {
  /**
   * Crea una orden de pago en Flow y devuelve el token + url de pago.
   * En sandbox retorna datos simulados.
   */
  async crearOrden({ pedido_id, monto, email, descripcion }) {
    if (config.FLOW_ENVIRONMENT === 'sandbox') {
      const token = `SANDBOX_${crypto.randomUUID()}`;
      return {
        token,
        url: `https://sandbox.flow.cl/app/web/pay.php?token=${token}`,
        flow_order: `MOCK_${Date.now()}`
      };
    }

    // TODO: integración real con Flow API
    // const params = buildFlowParams({ ... });
    // const res = await fetch('https://www.flow.cl/api/payment/create', { ... });
    throw new Error('Integración Flow producción no implementada');
  },

  /**
   * Consulta el estado de un pago en Flow por token.
   */
  async consultarPago(token) {
    if (config.FLOW_ENVIRONMENT === 'sandbox') {
      return { status: 2, amount: 0, token }; // status 2 = pagado en Flow
    }
    throw new Error('Integración Flow producción no implementada');
  }
};

// ── POST /api/pagos/crear ─────────────────────────────────────────────────────
// El negocio inicia el pago de un pedido
router.post('/crear', auth, solo('negocio'), async (req, res, next) => {
  const { pedido_id } = req.body;
  if (!pedido_id) return res.status(400).json({ error: 'pedido_id requerido' });

  try {
    // Verificar que el pedido pertenece al negocio
    const { rows: [negocio] } = await db(
      'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
    );
    if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

    const { rows: [pedido] } = await db(
      `SELECT * FROM pedidos WHERE id = $1 AND negocio_id = $2`,
      [pedido_id, negocio.id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.estado === 'cancelado') return res.status(400).json({ error: 'Pedido cancelado' });

    // Verificar si ya existe un pago pendiente o completado
    const { rows: [pagoExistente] } = await db(
      `SELECT * FROM pagos WHERE pedido_id = $1 AND estado IN ('pendiente','pagado')`,
      [pedido_id]
    );
    if (pagoExistente) {
      return res.json({ token: pagoExistente.flow_token, url: pagoExistente.metadata?.url });
    }

    const monto = pedido.tarifa_entrega + pedido.app_fee;
    const { token, url, flow_order } = await flow.crearOrden({
      pedido_id,
      monto,
      email: req.usuario.email || 'pagos@repartojusto.cl',
      descripcion: `Pedido ${pedido_id.substring(0, 8)} — RepartoJusto`
    });

    await db(
      `INSERT INTO pagos (pedido_id, flow_order_id, flow_token, monto, estado, metadata)
       VALUES ($1, $2, $3, $4, 'pendiente', $5)`,
      [pedido_id, flow_order, token, monto, JSON.stringify({ url })]
    );

    res.json({ token, url, monto });
  } catch (err) { next(err); }
});

// ── GET /api/pagos/confirmar ──────────────────────────────────────────────────
// Flow llama a este endpoint cuando el pago se completa (return URL)
router.get('/confirmar', async (req, res, next) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  try {
    const { rows: [pago] } = await db(
      'SELECT * FROM pagos WHERE flow_token = $1', [token]
    );
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.estado === 'pagado') return res.json({ ok: true, estado: 'pagado' });

    const estadoFlow = await flow.consultarPago(token);

    if (estadoFlow.status === 2) {
      // Pago exitoso
      await transaction(async (client) => {
        await client.query(
          `UPDATE pagos SET estado = 'pagado', pagado_at = NOW() WHERE id = $1`,
          [pago.id]
        );
        await client.query(
          `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1 AND estado = 'pendiente'`,
          [pago.pedido_id]
        );
      });
      return res.json({ ok: true, estado: 'pagado' });
    }

    res.json({ ok: false, estado: 'pendiente', flow_status: estadoFlow.status });
  } catch (err) { next(err); }
});

// ── POST /api/pagos/webhook ───────────────────────────────────────────────────
// Flow notifica el resultado del pago (server-to-server)
router.post('/webhook', async (req, res, next) => {
  const { token } = req.body;
  if (!token) return res.status(400).end();

  try {
    const estadoFlow = await flow.consultarPago(token);
    const { rows: [pago] } = await db(
      'SELECT * FROM pagos WHERE flow_token = $1', [token]
    );
    if (!pago) return res.status(404).end();

    if (estadoFlow.status === 2 && pago.estado !== 'pagado') {
      await db(
        `UPDATE pagos SET estado = 'pagado', pagado_at = NOW() WHERE id = $1`,
        [pago.id]
      );
    } else if (estadoFlow.status === 3) {
      await db(
        `UPDATE pagos SET estado = 'fallido' WHERE id = $1`,
        [pago.id]
      );
    }

    res.status(200).end();
  } catch (err) { next(err); }
});

// ── GET /api/pagos/liquidaciones ──────────────────────────────────────────────
// Historial de liquidaciones del rider autenticado
router.get('/liquidaciones', auth, solo('rider'), async (req, res, next) => {
  try {
    const { rows: [rider] } = await db(
      'SELECT id FROM riders WHERE usuario_id = $1', [req.usuario.id]
    );
    if (!rider) return res.status(404).json({ error: 'Rider no encontrado' });

    const { rows } = await db(
      `SELECT * FROM liquidaciones
       WHERE rider_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [rider.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/pagos/saldo ──────────────────────────────────────────────────────
// Saldo pendiente de liquidación del rider
router.get('/saldo', auth, solo('rider'), async (req, res, next) => {
  try {
    const { rows: [rider] } = await db(
      'SELECT id, saldo_pendiente, total_entregas FROM riders WHERE usuario_id = $1',
      [req.usuario.id]
    );
    if (!rider) return res.status(404).json({ error: 'Rider no encontrado' });
    res.json(rider);
  } catch (err) { next(err); }
});

module.exports = router;
