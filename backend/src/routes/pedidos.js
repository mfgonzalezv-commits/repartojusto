const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query: db, transaction } = require('../config/database');
const { auth, solo } = require('../middleware/auth');
const config = require('../config');
const { iniciarCascada, cancelarCascada } = require('../sockets/asignacion');
const { cobros, calcularCargos } = require('./negocios');

const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  next();
};

// tarifa_entrega = lo que recibe el rider:
//   $1.100 fijo + $350 × km (redondeado al entero más cercano)
// app_fee = uso plataforma cobrado al negocio = $500
const calcularTarifa = (distancia_km) => {
  return Math.round(config.TARIFA_FIJA_CLP + config.TARIFA_KM_CLP * distancia_km);
};

// ── POST /api/pedidos ─────────────────────────────────────────────────────
// El negocio crea un pedido
router.post('/',
  auth, solo('negocio'),
  [
    body('cliente_nombre').trim().notEmpty(),
    body('cliente_telefono').trim().notEmpty().isLength({ min: 8, max: 20 }),
    body('direccion_entrega').trim().notEmpty(),
    body('lat_entrega').optional().isFloat({ min: -90, max: 90 }),
    body('lng_entrega').optional().isFloat({ min: -180, max: 180 }),
    body('distancia_km').isFloat({ min: 0.1, max: 500 }),
    body('valor_producto').optional().isInt({ min: 0 }),
    body('notas').optional().trim(),
    body('hora_retiro').optional().matches(/^\d{2}:\d{2}$/),
  ],
  validar,
  async (req, res, next) => {
    const { cliente_nombre, cliente_telefono, direccion_entrega, lat_entrega, lng_entrega, distancia_km, valor_producto, notas, hora_retiro } = req.body;
    try {
      const { rows: [negocio] } = await db(
        `SELECT id, tarjeta_customer_id, tarjeta_token, modo,
                estrategia_cobro, pct_negocio, mostrar_costo_seguimiento
         FROM negocios WHERE usuario_id = $1 AND activo = true`,
        [req.usuario.id]
      );
      if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

      const enPrueba = negocio.modo === 'prueba';

      // En modo activo, verificar tarjeta y cobrar
      if (!enPrueba) {
        if (!negocio.tarjeta_token) {
          return res.status(402).json({
            error: 'Tarjeta requerida',
            detalle: 'Debes registrar una tarjeta de crédito o débito antes de publicar pedidos.'
          });
        }
        const tarifa_entrega_pre = calcularTarifa(distancia_km);
        const cobro = await cobros.cobrar({
          customerId: negocio.tarjeta_customer_id,
          monto: config.APP_FEE + tarifa_entrega_pre,
        });
        if (!cobro.ok) {
          return res.status(402).json({ error: 'Pago rechazado', detalle: 'No se pudo cobrar el servicio. Verifica tu tarjeta.' });
        }
      }

      const tarifa_entrega = calcularTarifa(distancia_km);
      const { cargo_negocio, cargo_cliente } = calcularCargos(
        tarifa_entrega, config.APP_FEE,
        negocio.estrategia_cobro || 'todo_incluido',
        negocio.pct_negocio || 100
      );

      // Guardar/actualizar cliente en directorio
      if (cliente_telefono) {
        await db(
          `INSERT INTO clientes (negocio_id, nombre, telefono, direccion, lat, lng)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (negocio_id, telefono) DO UPDATE SET
             nombre = EXCLUDED.nombre,
             direccion = EXCLUDED.direccion,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             total_pedidos = clientes.total_pedidos + 1,
             updated_at = NOW()`,
          [negocio.id, cliente_nombre, cliente_telefono, direccion_entrega,
           lat_entrega || null, lng_entrega || null]
        );
      }

      const agendado = !!hora_retiro;
      const estadoInicial = agendado ? 'agendado' : 'pendiente';

      const { rows: [pedido] } = await db(
        `INSERT INTO pedidos
           (negocio_id, cliente_nombre, cliente_telefono, direccion_entrega,
            lat_entrega, lng_entrega, distancia_km, tarifa_entrega, app_fee,
            valor_producto, notas, cargo_negocio, cargo_cliente, hora_retiro, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [negocio.id, cliente_nombre, cliente_telefono, direccion_entrega,
         lat_entrega, lng_entrega, distancia_km, tarifa_entrega, config.APP_FEE,
         valor_producto ? parseInt(valor_producto) : null, notas,
         cargo_negocio, cargo_cliente, hora_retiro || null, estadoInicial]
      );

      // ── Motor de asignación ──────────────────────────────────────────────
      const io = req.app.get('io');
      if (io && !agendado) {
        // Pedido inmediato: lanzar cascada ahora
        iniciarCascada(pedido.id, io).catch(err =>
          console.error('❌ Error cascada asignación:', err.message)
        );
      }
      // Pedido agendado: el scheduler lo lanzará 10 min antes de hora_retiro

      res.status(201).json(pedido);
    } catch (err) { next(err); }
  }
);

// ── POST /api/pedidos/:id/aceptar ─────────────────────────────────────────
// El rider acepta un pedido — permite multi-pedido con criterio de eficiencia
const MAX_PEDIDOS_SIMULTANEOS = 3;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

router.post('/:id/aceptar', auth, solo('rider'), async (req, res, next) => {
  try {
    const { rows: [rider] } = await db(
      'SELECT id FROM riders WHERE usuario_id = $1 AND disponible = true', [req.usuario.id]
    );
    if (!rider) return res.status(400).json({ error: 'No estás disponible para tomar pedidos' });

    // Pedidos activos del rider (asignado, retiro, en_camino)
    const { rows: activos } = await db(
      `SELECT p.negocio_id, p.lat_entrega, p.lng_entrega
       FROM pedidos p
       WHERE p.rider_id = $1 AND p.estado IN ('asignado','retiro','en_camino')`,
      [rider.id]
    );

    if (activos.length >= MAX_PEDIDOS_SIMULTANEOS) {
      return res.status(400).json({ error: `Límite de ${MAX_PEDIDOS_SIMULTANEOS} pedidos simultáneos alcanzado` });
    }

    // Si ya tiene pedidos activos, verificar compatibilidad
    if (activos.length > 0) {
      const { rows: [nuevoPedido] } = await db(
        'SELECT negocio_id, lat_entrega, lng_entrega FROM pedidos WHERE id = $1 AND estado = \'pendiente\'',
        [req.params.id]
      );
      if (!nuevoPedido) return res.status(409).json({ error: 'Pedido no disponible' });

      const mismoLocal = activos.some(a => a.negocio_id === nuevoPedido.negocio_id);
      const rutaCercana = activos.some(a =>
        a.lat_entrega && a.lng_entrega && nuevoPedido.lat_entrega && nuevoPedido.lng_entrega &&
        haversineKm(a.lat_entrega, a.lng_entrega, nuevoPedido.lat_entrega, nuevoPedido.lng_entrega) <= 3
      );

      if (!mismoLocal && !rutaCercana) {
        return res.status(400).json({
          error: 'Pedido fuera de ruta',
          detalle: 'Solo puedes tomar pedidos del mismo local o con destino a menos de 3 km de tus entregas activas'
        });
      }
    }

    // Cancelar cascada si estaba corriendo para este pedido
    cancelarCascada(req.params.id);

    const pedido = await transaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE pedidos SET estado = 'asignado', rider_id = $1, asignado_at = NOW()
         WHERE id = $2 AND estado = 'pendiente'
         RETURNING *`,
        [rider.id, req.params.id]
      );
      if (!rows[0]) throw Object.assign(new Error('Pedido no disponible'), { status: 409 });
      return rows[0];
    });

    req.app.get('io')?.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
      id: pedido.id, estado: pedido.estado, rider_id: rider.id
    });

    res.json(pedido);
  } catch (err) { next(err); }
});

// ── PUT /api/pedidos/:id/estado ───────────────────────────────────────────
// El rider avanza el estado del pedido
const TRANSICIONES_RIDER = {
  asignado:  'retiro',
  retiro:    'en_camino',
  en_camino: 'entregado'
};

router.put('/:id/estado', auth, solo('rider', 'admin'), async (req, res, next) => {
  try {
    const { rows: [rider] } = req.usuario.rol === 'rider'
      ? await db('SELECT id FROM riders WHERE usuario_id = $1', [req.usuario.id])
      : { rows: [{ id: null }] };

    const { rows: [pedido] } = await db(
      'SELECT * FROM pedidos WHERE id = $1', [req.params.id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Riders solo pueden avanzar sus propios pedidos
    if (req.usuario.rol === 'rider' && pedido.rider_id !== rider.id) {
      return res.status(403).json({ error: 'No es tu pedido' });
    }

    const nuevoEstado = TRANSICIONES_RIDER[pedido.estado];
    if (!nuevoEstado) return res.status(400).json({ error: `No se puede avanzar desde estado '${pedido.estado}'` });

    // Registrar timestamps por etapa
    let extras = '';
    if (nuevoEstado === 'retiro')    extras = ', retiro_at = NOW()';
    if (nuevoEstado === 'en_camino') extras = ', en_camino_at = NOW()';
    if (nuevoEstado === 'entregado') extras = ', entregado_at = NOW()';

    const { rows: [actualizado] } = await db(
      `UPDATE pedidos SET estado = $1 ${extras} WHERE id = $2 RETURNING *`,
      [nuevoEstado, pedido.id]
    );

    // Acreditar saldo al rider cuando entrega
    if (nuevoEstado === 'entregado' && pedido.rider_id) {
      await db(
        `UPDATE riders
         SET saldo_pendiente = saldo_pendiente + $1,
             total_entregas  = total_entregas  + 1
         WHERE id = $2`,
        [pedido.tarifa_entrega, pedido.rider_id]
      );
    }

    req.app.get('io')?.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
      id: actualizado.id, estado: actualizado.estado
    });

    res.json(actualizado);
  } catch (err) { next(err); }
});

// ── PUT /api/pedidos/:id/liberar ──────────────────────────────────────────
// Devuelve el pedido a 'pendiente' y libera al rider (por inconveniente)
router.put('/:id/liberar', auth, solo('rider', 'admin'), async (req, res, next) => {
  try {
    const { rows: [rider] } = req.usuario.rol === 'rider'
      ? await db('SELECT id FROM riders WHERE usuario_id = $1', [req.usuario.id])
      : { rows: [{ id: null }] };

    const { rows: [pedido] } = await db(
      'SELECT * FROM pedidos WHERE id = $1', [req.params.id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Solo se puede liberar si está asignado o en retiro
    if (!['asignado', 'retiro'].includes(pedido.estado)) {
      return res.status(400).json({ error: `No se puede liberar un pedido en estado '${pedido.estado}'` });
    }

    // Riders solo pueden liberar sus propios pedidos
    if (req.usuario.rol === 'rider' && pedido.rider_id !== rider.id) {
      return res.status(403).json({ error: 'No es tu pedido' });
    }

    // Volver a pendiente y quitar rider
    const { rows: [liberado] } = await db(
      `UPDATE pedidos
       SET estado = 'pendiente', rider_id = NULL, asignado_at = NULL
       WHERE id = $1
       RETURNING *`,
      [pedido.id]
    );

    // Marcar al rider como no disponible (tuvo un inconveniente)
    if (pedido.rider_id) {
      await db('UPDATE riders SET disponible = false WHERE id = $1', [pedido.rider_id]);
    }

    // Notificar al negocio que el pedido volvió a pendiente
    req.app.get('io')?.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
      id: liberado.id, estado: 'pendiente'
    });

    res.json(liberado);
  } catch (err) { next(err); }
});

// ── PUT /api/pedidos/:id/cancelar ─────────────────────────────────────────
router.put('/:id/cancelar',
  auth,
  [body('motivo').optional().trim()],
  validar,
  async (req, res, next) => {
    const { motivo } = req.body;
    try {
      // Negocios solo cancelan sus propios pedidos; admin puede cancelar cualquiera
      let filtro = 'id = $1';
      const params = [req.params.id];

      if (req.usuario.rol === 'negocio') {
        const { rows: [neg] } = await db(
          'SELECT id FROM negocios WHERE usuario_id = $1', [req.usuario.id]
        );
        params.push(neg.id);
        filtro += ` AND negocio_id = $${params.length}`;
      }

      // Verificar estado actual antes de cancelar
      const { rows: [actual] } = await db(
        `SELECT p.*, r.id AS rider_db_id FROM pedidos p
         LEFT JOIN riders r ON r.id = p.rider_id
         WHERE p.id = $1`, [req.params.id]
      );
      if (!actual) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (['entregado','cancelado'].includes(actual.estado)) {
        return res.status(400).json({ error: 'Pedido ya finalizado' });
      }

      const { rows } = await db(
        `UPDATE pedidos
         SET estado = 'cancelado', cancelado_motivo = $${params.length + 1}
         WHERE ${filtro} AND estado NOT IN ('entregado','cancelado')
         RETURNING *`,
        [...params, motivo || null]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado o ya finalizado' });

      // ── Multa si el rider ya estaba en el local (retiro) ────────────────
      let multa = false;
      if (actual.estado === 'retiro' && actual.rider_id) {
        await db(
          `UPDATE riders
           SET saldo_pendiente = saldo_pendiente + $1
           WHERE id = $2`,
          [actual.tarifa_entrega, actual.rider_id]
        );
        multa = true;
      }

      req.app.get('io')?.to(`negocio:${rows[0].negocio_id}`).emit('pedido:actualizado', {
        id: rows[0].id, estado: 'cancelado'
      });

      // Notificar al rider si aplica
      if (actual.rider_id) {
        req.app.get('io')?.to(`rider:${actual.rider_id}`).emit('pedido:cancelado', {
          pedido_id: rows[0].id,
          multa,
          mensaje: multa
            ? `El negocio canceló el pedido. Recibirás $${actual.tarifa_entrega.toLocaleString('es-CL')} por el desplazamiento.`
            : 'El negocio canceló el pedido.'
        });
      }

      res.json({ ...rows[0], multa });
    } catch (err) { next(err); }
  }
);

// ── GET /api/pedidos/:id ──────────────────────────────────────────────────
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT p.*,
              n.nombre_comercial, n.direccion AS direccion_retiro, n.lat AS neg_lat, n.lng AS neg_lng,
              n.mostrar_costo_seguimiento,
              u_r.nombre AS rider_nombre, u_r.telefono AS rider_telefono,
              ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
