const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query: db } = require('../config/database');
const { auth, solo } = require('../middleware/auth');

// Feriados fijos chilenos (MM-DD)
const FERIADOS_FIJOS = ['01-01','05-01','05-21','06-29','08-15','09-18','09-19',
  '10-12','10-31','11-01','12-08','12-25'];
// Feriados móviles aproximados 2024-2026
const FERIADOS_MOVILES = ['2024-03-29','2024-03-30','2024-04-19','2024-05-31',
  '2024-06-20','2025-04-18','2025-04-19','2025-06-09','2025-06-20',
  '2026-04-03','2026-04-04','2026-05-25','2026-06-19'];

function esFeriado(fecha) {
  const d = new Date(fecha);
  const mmdd = String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const iso  = d.toISOString().slice(0,10);
  return FERIADOS_FIJOS.includes(mmdd) || FERIADOS_MOVILES.includes(iso);
}

// ── POST /api/calificaciones ──────────────────────────────────────────────
// Negocio o cliente califican a un rider por un pedido
router.post('/',
  [
    body('pedido_id').isUUID(),
    body('tipo').isIn(['negocio','cliente']),
    // negocio
    body('llego_tiempo').optional().isBoolean(),
    body('fue_amable').optional().isBoolean(),
    body('bien_presentado').optional().isBoolean(),
    body('verifico_pedido').optional().isBoolean(),
    // cliente
    body('pedido_buen_estado').optional().isBoolean(),
    body('lo_recomendaria').optional().isBoolean(),
    body('comentario').optional().trim().isLength({ max: 300 }),
  ],
  async (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });

    const { pedido_id, tipo, llego_tiempo, fue_amable, bien_presentado,
            verifico_pedido, pedido_buen_estado, lo_recomendaria, comentario } = req.body;
    try {
      // Verificar que el pedido existe y está entregado
      const { rows: [pedido] } = await db(
        'SELECT id, rider_id, negocio_id, estado FROM pedidos WHERE id = $1',
        [pedido_id]
      );
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.estado !== 'entregado') return res.status(400).json({ error: 'Solo se puede calificar pedidos entregados' });
      if (!pedido.rider_id) return res.status(400).json({ error: 'Este pedido no tiene rider asignado' });

      // Si viene autenticado como negocio, verificar que es su pedido
      if (req.headers.authorization) {
        try {
          const jwt = require('jsonwebtoken');
          const config = require('../config');
          const token = req.headers.authorization.replace('Bearer ', '');
          const decoded = jwt.verify(token, config.JWT_SECRET);
          if (decoded.rol === 'negocio' && tipo !== 'negocio') {
            return res.status(403).json({ error: 'El negocio solo puede calificar como negocio' });
          }
          if (decoded.rol === 'negocio') {
            const { rows: [neg] } = await db(
              'SELECT id FROM negocios WHERE usuario_id = $1', [decoded.id]
            );
            if (!neg || neg.id !== pedido.negocio_id) {
              return res.status(403).json({ error: 'No es tu pedido' });
            }
          }
        } catch {}
      }

      // Guardar calificación (UNIQUE pedido_id + tipo evita duplicados)
      const { rows: [calif] } = await db(
        `INSERT INTO calificaciones
           (pedido_id, rider_id, tipo, llego_tiempo, fue_amable, bien_presentado,
            verifico_pedido, pedido_buen_estado, lo_recomendaria, comentario)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (pedido_id, tipo) DO NOTHING
         RETURNING id`,
        [pedido_id, pedido.rider_id, tipo,
         llego_tiempo ?? null, fue_amable ?? null, bien_presentado ?? null,
         verifico_pedido ?? null, pedido_buen_estado ?? null,
         lo_recomendaria ?? null, comentario || null]
      );

      if (!calif) return res.status(409).json({ error: 'Este pedido ya fue calificado' });
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ── Cálculo de score (reutilizable) ──────────────────────────────────────
async function calcularScore(riderId) {

    // ── 1. Calidad de servicio (60%) ─────────────────────────────────────
    const { rows: califs } = await db(
      `SELECT tipo, llego_tiempo, fue_amable, bien_presentado, verifico_pedido,
              pedido_buen_estado, lo_recomendaria
       FROM calificaciones WHERE rider_id = $1`,
      [riderId]
    );

    const negCalifs = califs.filter(c => c.tipo === 'negocio');
    const cliCalifs = califs.filter(c => c.tipo === 'cliente');

    function promedioSiNo(rows, campos) {
      const vals = rows.flatMap(r => campos.map(c => r[c])).filter(v => v !== null && v !== undefined);
      if (!vals.length) return null;
      return Math.round(vals.filter(Boolean).length / vals.length * 100);
    }

    const scoreNegocio = promedioSiNo(negCalifs, ['llego_tiempo','fue_amable','bien_presentado','verifico_pedido']);
    const scoreCliente = promedioSiNo(cliCalifs, ['llego_tiempo','fue_amable','pedido_buen_estado','lo_recomendaria']);

    let scoreCalidad = null;
    if (scoreNegocio !== null && scoreCliente !== null) scoreCalidad = Math.round((scoreNegocio + scoreCliente) / 2);
    else if (scoreNegocio !== null) scoreCalidad = scoreNegocio;
    else if (scoreCliente !== null) scoreCalidad = scoreCliente;

    // ── 2. Comportamiento plataforma (40%) ───────────────────────────────
    const { rows: [rider] } = await db(
      'SELECT total_entregas, saldo_pendiente FROM riders WHERE id = $1', [riderId]
    );
    if (!rider) return res.status(404).json({ error: 'Rider no encontrado' });

    const { rows: pedidosRider } = await db(
      `SELECT estado, asignado_at, entregado_at, created_at
       FROM pedidos WHERE rider_id = $1 AND created_at > NOW() - INTERVAL '90 days'`,
      [riderId]
    );

    // Pedidos completados (20 entregas = 100 puntos)
    const entregados = pedidosRider.filter(p => p.estado === 'entregado');
    const scoreCompletados = Math.min(100, Math.round(rider.total_entregas / 20 * 100));

    // Tasa de cancelación/liberación (penaliza 25 pts por cada una)
    const { rows: liberados } = await db(
      `SELECT COUNT(*) AS total FROM pedidos
       WHERE rider_id = $1 AND estado IN ('cancelado','pendiente') AND asignado_at IS NOT NULL`,
      [riderId]
    );
    const nLib = parseInt(liberados[0]?.total || 0);
    const scoreCancelaciones = Math.max(0, 100 - nLib * 25);

    // Velocidad promedio de entrega
    const tiempos = entregados
      .filter(p => p.asignado_at && p.entregado_at)
      .map(p => (new Date(p.entregado_at) - new Date(p.asignado_at)) / 60000);
    let scoreVelocidad = null;
    if (tiempos.length > 0) {
      const prom = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
      scoreVelocidad = prom <= 25 ? 100 : prom <= 35 ? 85 : prom <= 45 ? 70 : prom <= 60 ? 50 : 25;
    }

    // Horarios valle (14:00–19:00, excluye peak 12:00-14:00 y 19:00-22:00)
    const enValle = entregados.filter(p => {
      const h = new Date(p.created_at).getHours();
      return h >= 14 && h < 19;
    });
    const totalPedidos90 = pedidosRider.length;
    const scoreValle = totalPedidos90 > 0
      ? Math.min(100, Math.round(enValle.length / totalPedidos90 * 200)) // 50% en valle = 100
      : null;

    // Feriados trabajados (últimos 12 feriados)
    const feriadosUltimos = [...FERIADOS_MOVILES, ...Array.from({length:365}, (_,i) => {
      const d = new Date(); d.setDate(d.getDate()-i);
      const mmdd = String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      return FERIADOS_FIJOS.includes(mmdd) ? d.toISOString().slice(0,10) : null;
    }).filter(Boolean)].sort().reverse().slice(0,12);

    const feriadosTrabajados = feriadosUltimos.filter(f =>
      pedidosRider.some(p => p.created_at && new Date(p.created_at).toISOString().slice(0,10) === f)
    );
    const scoreFeriados = feriadosUltimos.length > 0
      ? Math.round(feriadosTrabajados.length / feriadosUltimos.length * 100)
      : null;

    // Score plataforma = promedio de métricas disponibles
    const metricasPlat = [scoreCompletados, scoreCancelaciones, scoreVelocidad, scoreValle, scoreFeriados]
      .filter(v => v !== null);
    const scorePlataforma = metricasPlat.length > 0
      ? Math.round(metricasPlat.reduce((a,b) => a+b, 0) / metricasPlat.length)
      : null;

    // ── 3. Score final ───────────────────────────────────────────────────
    let scoreFinal = null;
    if (scoreCalidad !== null && scorePlataforma !== null) {
      scoreFinal = Math.round(scoreCalidad * 0.6 + scorePlataforma * 0.4);
    } else if (scoreCalidad !== null) {
      scoreFinal = scoreCalidad;
    } else if (scorePlataforma !== null) {
      scoreFinal = scorePlataforma;
    }

    function nivel(s) {
      if (s === null) return 'Sin calificaciones aún';
      if (s >= 90) return 'Rider estrella ⭐';
      if (s >= 70) return 'Buen trabajo, sigue mejorando';
      if (s >= 50) return 'Necesitas mejorar tu disponibilidad';
      return 'En riesgo — mejora para seguir recibiendo pedidos';
    }

    return {
      score_final: scoreFinal,
      nivel: nivel(scoreFinal),
      calidad: {
        score: scoreCalidad,
        negocio: scoreNegocio,
        cliente: scoreCliente,
        total_negocio: negCalifs.length,
        total_cliente: cliCalifs.length,
      },
      plataforma: {
        score: scorePlataforma,
        completados: { score: scoreCompletados, total: rider.total_entregas },
        cancelaciones: { score: scoreCancelaciones, total: nLib },
        velocidad: { score: scoreVelocidad, minutos: tiempos.length > 0 ? Math.round(tiempos.reduce((a,b)=>a+b,0)/tiempos.length) : null },
        valle: { score: scoreValle },
        feriados: { score: scoreFeriados, trabajados: feriadosTrabajados.length, total: feriadosUltimos.length },
      }
    };
}

// ── GET /api/calificaciones/rider/:id/score ───────────────────────────────
router.get('/rider/:id/score', async (req, res, next) => {
  try {
    const data = await calcularScore(req.params.id);
    if (!data) return res.status(404).json({ error: 'Rider no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/calificaciones/mi-score ─────────────────────────────────────
router.get('/mi-score', auth, solo('rider'), async (req, res, next) => {
  try {
    const { rows: [rider] } = await db(
      'SELECT id FROM riders WHERE usuario_id = $1', [req.usuario.id]
    );
    if (!rider) return res.status(404).json({ error: 'Rider no encontrado' });
    const data = await calcularScore(rider.id);
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
