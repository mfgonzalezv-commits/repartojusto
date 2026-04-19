/**
 * Motor de asignación en cascada.
 *
 * Cuando llega un pedido nuevo:
 *  1. Se busca el rider disponible más cercano al negocio.
 *  2. Se le envía una oferta por socket (30 s para responder).
 *  3. Si acepta → se asigna el pedido en BD y se notifica al negocio.
 *  4. Si rechaza o no responde → se pasa al siguiente rider más cercano.
 *  5. Si no quedan riders → el pedido queda "pendiente" público en la lista.
 */

const { query: db } = require('../config/database');
const { sendPush } = require('../utils/webpush');

const OFERTA_SEGUNDOS = 30;
const MAX_PEDIDOS_SIMULTANEOS = 3;

// Map: pedido_id → { timer: TimeoutID|null, ofrecidos: Set<number> }
const cascadas = new Map();

// ── Rider disponible más cercano, retorna también su push_subscription ────────
// Riders con mejor calificación obtienen hasta 20% de ventaja sobre la distancia.
// Ej: rider 1 km con score 100 compite como si estuviera a 0.8 km.
async function _riderMasCercano(negLat, negLng, ofrecidos) {
  const { rows } = await db(
    `SELECT r.id, r.push_subscription
     FROM riders r
     LEFT JOIN LATERAL (
       SELECT ROUND(
         AVG(
           (CASE WHEN llego_tiempo      THEN 1 ELSE 0 END +
            CASE WHEN fue_amable        THEN 1 ELSE 0 END +
            CASE WHEN bien_presentado   THEN 1 ELSE 0 END +
            CASE WHEN verifico_pedido   THEN 1 ELSE 0 END +
            CASE WHEN pedido_buen_estado THEN 1 ELSE 0 END +
            CASE WHEN lo_recomendaria   THEN 1 ELSE 0 END)::numeric /
           NULLIF(
             (CASE WHEN llego_tiempo      IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN fue_amable        IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bien_presentado   IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN verifico_pedido   IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN pedido_buen_estado IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN lo_recomendaria   IS NOT NULL THEN 1 ELSE 0 END), 0
           )
         ) * 100
       ) AS score_pct
       FROM calificaciones c
       WHERE c.rider_id = r.id
     ) sc ON true
     WHERE r.disponible = true
       AND r.lat IS NOT NULL AND r.lng IS NOT NULL
       AND r.id <> ALL($3::uuid[])
     ORDER BY
       (($1 - r.lat)^2 + (($2 - r.lng) * COS(RADIANS($1)))^2)
       * (1.1 - COALESCE(sc.score_pct, 50) / 100.0 * 0.2)
     ASC
     LIMIT 1`,
    [negLat, negLng, [...ofrecidos]]
  );
  return rows[0] || null;
}

// ── Ofrecer pedido al siguiente rider elegible ───────────────────────────────
async function _ofrecerSiguiente(pedido, io) {
  const cascada = cascadas.get(pedido.id);
  if (!cascada) return;

  // Verificar que el pedido sigue pendiente
  const { rows: [vivo] } = await db(
    `SELECT id FROM pedidos WHERE id = $1 AND estado = 'pendiente'`,
    [pedido.id]
  );
  if (!vivo) { cascadas.delete(pedido.id); return; }

  const rider = await _riderMasCercano(pedido.neg_lat, pedido.neg_lng, cascada.ofrecidos);

  if (!rider) {
    // Sin riders por cascada: broadcast público + push a todos los disponibles
    cascadas.delete(pedido.id);
    io.emit('pedido:nuevo', _payload(pedido));

    // Enviar push a todos los riders disponibles con suscripción registrada
    const { rows: ridersConPush } = await db(
      `SELECT push_subscription FROM riders WHERE disponible = true AND push_subscription IS NOT NULL`
    );
    const pushPayload = {
      title: '📦 ¡Pedido disponible!',
      body: `$${parseInt(pedido.tarifa_entrega).toLocaleString('es-CL')} — Entra a la app para tomarlo`,
    };
    for (const r of ridersConPush) {
      sendPush(r.push_subscription, pushPayload).catch(() => {});
    }
    return;
  }

  const ofertaPayload = { ..._payload(pedido), segundos: OFERTA_SEGUNDOS };
  io.to(`rider:${rider.id}`).emit('pedido:oferta', ofertaPayload);

  // Push notification al celular del rider (llega aunque la app esté cerrada)
  if (rider.push_subscription) {
    sendPush(rider.push_subscription, {
      title: '🔔 ¡Nuevo pedido!',
      body: `$${parseInt(pedido.tarifa_entrega).toLocaleString('es-CL')} — Tienes ${OFERTA_SEGUNDOS}s para aceptar`,
      pedido_id: pedido.id,
    }).catch(err => {
      if (err && err.expired) {
        db(`UPDATE riders SET push_subscription = NULL WHERE id = $1`, [rider.id]).catch(() => {});
      }
    });
  }

  cascada.timer = setTimeout(async () => {
    // Tiempo expirado — pasar al siguiente
    cascada.ofrecidos.add(rider.id);
    io.to(`rider:${rider.id}`).emit('pedido:oferta_expirada', { pedido_id: pedido.id });
    await _ofrecerSiguiente(pedido, io).catch(console.error);
  }, OFERTA_SEGUNDOS * 1000);
}

function _payload(pedido) {
  return {
    pedido_id:         pedido.id,
    negocio_id:        pedido.negocio_id,
    nombre_comercial:  pedido.nombre_comercial,
    direccion_retiro:  pedido.neg_dir,
    direccion_entrega: pedido.direccion_entrega,
    tarifa_entrega:    pedido.tarifa_entrega,
    distancia_km:      pedido.distancia_km,
    hora_retiro:       pedido.hora_retiro || null,
  };
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicia la cascada para un pedido recién creado.
 * Llamar desde routes/pedidos.js al crear el pedido.
 */
async function iniciarCascada(pedido_id, io) {
  const { rows: [pedido] } = await db(
    `SELECT p.*, n.lat AS neg_lat, n.lng AS neg_lng,
            n.nombre_comercial, n.direccion AS neg_dir
     FROM pedidos p
     JOIN negocios n ON n.id = p.negocio_id
     WHERE p.id = $1 AND p.estado = 'pendiente'`,
    [pedido_id]
  );
  if (!pedido) return;

  cascadas.set(pedido_id, { timer: null, ofrecidos: new Set() });
  await _ofrecerSiguiente(pedido, io).catch(console.error);
}

/**
 * El rider acepta la oferta recibida por socket.
 * Retorna { ok, pedido } o { ok: false, error }.
 */
async function aceptarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) {
    clearTimeout(cascada.timer);
    cascadas.delete(pedido_id);
  }

  // Verificar disponibilidad del rider
  const { rows: [rider] } = await db(
    `SELECT id FROM riders WHERE id = $1 AND disponible = true`, [rider_id]
  );
  if (!rider) return { ok: false, error: 'No estás disponible' };

  // Verificar límite de pedidos simultáneos
  const { rows: [{ cnt }] } = await db(
    `SELECT COUNT(*) AS cnt FROM pedidos
     WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
    [rider_id]
  );
  if (parseInt(cnt) >= MAX_PEDIDOS_SIMULTANEOS) {
    return { ok: false, error: `Límite de ${MAX_PEDIDOS_SIMULTANEOS} pedidos simultáneos` };
  }

  // Asignación atómica (falla si ya fue tomado por otro)
  const { rows: [pedido] } = await db(
    `UPDATE pedidos
     SET estado = 'asignado', rider_id = $1, asignado_at = NOW()
     WHERE id = $2 AND estado = 'pendiente'
     RETURNING *`,
    [rider_id, pedido_id]
  );
  if (!pedido) return { ok: false, error: 'Pedido ya no disponible' };

  io.to(`negocio:${pedido.negocio_id}`).emit('pedido:actualizado', {
    id: pedido.id, estado: 'asignado', rider_id,
  });

  return { ok: true, pedido };
}

/**
 * El rider rechaza la oferta — se pasa al siguiente disponible.
 */
async function rechazarOferta(pedido_id, rider_id, io) {
  const cascada = cascadas.get(pedido_id);
  if (!cascada) return;

  clearTimeout(cascada.timer);
  cascada.ofrecidos.add(rider_id);

  const { rows: [pedido] } = await db(
    `SELECT p.*, n.lat AS neg_lat, n.lng AS neg_lng,
            n.nombre_comercial, n.direccion AS neg_dir
     FROM pedidos p
     JOIN negocios n ON n.id = p.negocio_id
     WHERE p.id = $1 AND p.estado = 'pendiente'`,
    [pedido_id]
  );
  if (!pedido) { cascadas.delete(pedido_id); return; }

  await _ofrecerSiguiente(pedido, io).catch(console.error);
}

/**
 * Cancela la cascada (ej: pedido tomado por REST, pedido cancelado).
 */
function cancelarCascada(pedido_id) {
  const cascada = cascadas.get(pedido_id);
  if (cascada) {
    clearTimeout(cascada.timer);
    cascadas.delete(pedido_id);
  }
}

// ── Scheduler: lanza cascada 10 min antes de hora_retiro ─────────────────────
const ANTICIPACION_MIN = 10;

async function _revisarAgendados(io) {
  try {
    const { rows } = await db(
      `SELECT p.id
       FROM pedidos p
       WHERE p.estado = 'agendado'
         AND p.hora_retiro IS NOT NULL
         AND p.hora_retiro <= ((NOW() AT TIME ZONE 'America/Santiago') + INTERVAL '${ANTICIPACION_MIN} minutes')::time
         AND p.hora_retiro >= ((NOW() AT TIME ZONE 'America/Santiago') - INTERVAL '2 minutes')::time`
    );
    for (const { id } of rows) {
      // Pasar a pendiente y disparar cascada
      await db(
        `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1 AND estado = 'agendado'`,
        [id]
      );
      iniciarCascada(id, io).catch(err =>
        console.error('❌ Error cascada agendado:', err.message)
      );
    }
  } catch (err) {
    console.error('❌ Error revisarAgendados:', err.message);
  }
}

function iniciarScheduler(io) {
  setInterval(() => _revisarAgendados(io), 60 * 1000);
  console.log('⏰ Scheduler de pedidos agendados activo (cada 1 min)');
}

module.exports = { iniciarCascada, aceptarOferta, rechazarOferta, cancelarCascada, iniciarScheduler };
