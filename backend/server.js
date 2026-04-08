require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
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
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use(errorHandler);

// Configurar WebSockets
setupSockets(io);

// Iniciar servidor
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     🏍️  Reparto Justo Backend                    ║
║     Puerto: ${PORT}                                  ║
║     Ambiente: ${config.NODE_ENV.padEnd(20)}         ║
╚══════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };