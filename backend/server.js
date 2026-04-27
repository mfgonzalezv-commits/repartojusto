require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Configuración
const config = require('./src/config');

// Rutas
const authRoutes = require('./src/routes/auth');
const pedidoRoutes = require('./src/routes/pedidos');
const riderRoutes = require('./src/routes/riders');
const negocioRoutes = require('./src/routes/negocios');
const pagoRoutes = require('./src/routes/pagos');
const adminRoutes = require('./src/routes/admin');
const clienteRoutes  = require('./src/routes/clientes');
const califRoutes    = require('./src/routes/calificaciones');
const soporteRoutes  = require('./src/routes/soporte');
const emailRoutes    = require('./src/routes/email');

// Middleware
const errorHandler = require('./src/middleware/errorHandler');

// WebSocket handlers
const setupSockets = require('./src/sockets');

// Inicializar app
const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT']
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false   // los frontends usan scripts inline
}));
app.use(cors({ origin: '*', credentials: false }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos — sin caché para HTML
// Primero busca en public/ (producción), luego en el directorio padre (desarrollo local)
const staticDirs = [
  path.join(__dirname, 'public'),
  path.join(__dirname, '..')
];
const staticOpts = {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-store');
  }
};
staticDirs.forEach(dir => app.use(express.static(dir, staticOpts)));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/riders', riderRoutes);
app.use('/api/negocios', negocioRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/calificaciones', califRoutes);
app.use('/api/soporte', soporteRoutes);
app.use('/api/email',   emailRoutes);

// ── Endpoint público de seguimiento (sin auth) ────────────────────────────
const { query: dbQuery } = require('./src/config/database');
app.get('/api/seguimiento/:id', async (req, res) => {
  try {
    const { rows } = await dbQuery(
      `SELECT p.id, p.estado, p.direccion_entrega, p.lat_entrega, p.lng_entrega,
              p.distancia_km, p.tarifa_entrega, p.notas,
              p.created_at, p.asignado_at, p.retiro_at, p.entregado_at,
              n.nombre_comercial, n.direccion AS direccion_retiro,
              u_r.nombre AS rider_nombre,
              ri.vehiculo_tipo, ri.lat AS rider_lat, ri.lng AS rider_lng, ri.rating AS rider_rating
       FROM pedidos p
       JOIN negocios n ON n.id = p.negocio_id
       LEFT JOIN riders ri ON ri.id = p.rider_id
       LEFT JOIN usuarios u_r ON u_r.id = ri.usuario_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use(errorHandler);

// Exponer io para que las rutas puedan emitir eventos
app.set('io', io);

// Configurar WebSockets
setupSockets(io);

// Scheduler de pedidos agendados
const { iniciarScheduler } = require('./src/sockets/asignacion');
iniciarScheduler(io);

// Iniciar servidor
const PORT = config.PORT;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  console.log(`
╔══════════════════════════════════════════════════╗
║     🏍️  Reparto Justo Backend                    ║
║     Local:   http://localhost:${PORT}               ║
║     Móvil:   http://${localIP}:${PORT}        ║
║     Ambiente: ${config.NODE_ENV.padEnd(20)}         ║
╚══════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };