const jwt = require('jsonwebtoken');
const config = require('../config');
const { query: db } = require('../config/database');

/**
 * Rooms utilizados:
 *  - negocio:{negocio_id}   → el negocio ve actualizaciones de sus pedidos
 *  - rider:{rider_id}       → el rider recibe asignaciones
 *  - admin                  → panel admin ve todo
 *  - pedido:{pedido_id}     → cualquiera con acceso ve el tracking del pedido
 */

module.exports = (io) => {
  // ── Autenticación por JWT en handshake ──────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Token requerido'));

    try {
      socket.usuario = jwt.verify(token, config.JWT_SECRET);
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    const { id: usuarioId, rol, nombre } = socket.usuario;
    console.log(`🔌 Socket conectado: ${nombre} (${rol}) — ${socket.id}`);

    // ── Unir a rooms según rol ────────────────────────────────────────────
    try {
      if (rol === 'negocio') {
        const { rows } = await db(
          'SELECT id FROM negocios WHERE usuario_id = $1', [usuarioId]
        );
        if (rows[0]) {
          socket.join(`negocio:${rows[0].id}`);
          socket.negocio_id = rows[0].id;
        }
      }

      if (rol === 'rider') {
        const { rows } = await db(
          'SELECT id FROM riders WHERE usuario_id = $1', [usuarioId]
        );
        if (rows[0]) {
          socket.join(`rider:${rows[0].id}`);
          socket.rider_id = rows[0].id;
          // Marcar rider como en línea
          await db(
            'UPDATE riders SET disponible = true WHERE id = $1',
            [rows[0].id]
          );
          io.emit('rider:en_linea', { rider_id: rows[0].id });
        }
      }

      if (rol === 'admin') {
        socket.join('admin');
      }
    } catch (err) {
      console.error('❌ Error al unir rooms:', err.message);
    }

    // ── Rider: actualiza ubicación en tiempo real ─────────────────────────
    socket.on('rider:ubicacion', async ({ lat, lng }) => {
      if (rol !== 'rider' || !socket.rider_id) return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      try {
        await db(
          'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
          [lat, lng, socket.rider_id]
        );

        // Notificar a pedidos activos del rider (en_camino / retiro)
        const { rows } = await db(
          `SELECT id, negocio_id FROM pedidos
           WHERE rider_id = $1 AND estado IN ('asignado','retiro','en_camino')`,
          [socket.rider_id]
        );

        rows.forEach((pedido) => {
          io.to(`negocio:${pedido.negocio_id}`)
            .to(`pedido:${pedido.id}`)
            .emit('rider:ubicacion', {
              rider_id: socket.rider_id,
              pedido_id: pedido.id,
              lat,
              lng,
              timestamp: Date.now()
            });
        });
      } catch (err) {
        console.error('❌ Error al actualizar ubicación:', err.message);
      }
    });

    // ── Cliente: suscribirse al tracking de un pedido ─────────────────────
    socket.on('pedido:seguir', ({ pedido_id }) => {
      if (!pedido_id) return;
      socket.join(`pedido:${pedido_id}`);
    });

    socket.on('pedido:dejar_seguir', ({ pedido_id }) => {
      if (!pedido_id) return;
      socket.leave(`pedido:${pedido_id}`);
    });

    // ── Rider: solicitar lista de pedidos disponibles ─────────────────────
    socket.on('rider:pedir_disponibles', async () => {
      if (rol !== 'rider') return;
      try {
        const { rows } = await db(
          `SELECT p.id, p.direccion_entrega, p.tarifa_entrega, p.distancia_km,
                  p.created_at, n.nombre_comercial, n.direccion AS direccion_retiro, n.lat, n.lng
           FROM pedidos p
           JOIN negocios n ON n.id = p.negocio_id
           WHERE p.estado = 'pendiente'
           ORDER BY p.created_at ASC
           LIMIT 10`
        );
        socket.emit('pedidos:disponibles', rows);
      } catch (err) {
        console.error('❌ Error al obtener disponibles:', err.message);
      }
    });

    // ── Desconexión ───────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket desconectado: ${nombre} (${rol}) — ${socket.id}`);

      if (rol === 'rider' && socket.rider_id) {
        // Verificar si el rider tiene otra sesión abierta antes de marcarlo offline
        const sockets = await io.in(`rider:${socket.rider_id}`).fetchSockets();
        if (sockets.length === 0) {
          try {
            await db(
              'UPDATE riders SET disponible = false WHERE id = $1',
              [socket.rider_id]
            );
            io.emit('rider:fuera_linea', { rider_id: socket.rider_id });
          } catch (err) {
            console.error('❌ Error al marcar rider offline:', err.message);
          }
        }
      }
    });
  });

  // Exponer io en la app Express para usarlo desde las rutas
  // (server.js debe hacer: app.set('io', io))
};
