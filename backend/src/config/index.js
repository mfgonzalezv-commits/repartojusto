module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,

  // Redis
  REDIS_URL: process.env.REDIS_URL,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'secret_key_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Google Maps
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,

  // Flow
  FLOW_API_KEY: process.env.FLOW_API_KEY,
  FLOW_SECRET: process.env.FLOW_SECRET,
  FLOW_ENVIRONMENT: process.env.FLOW_ENVIRONMENT || 'sandbox',

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,

  // App config
  APP_FEE: parseInt(process.env.APP_FEE) || 500,
  RIDER_TARIFA_KM: parseInt(process.env.RIDER_TARIFA_KM) || 650,
  RESIDUAL_PCT: parseFloat(process.env.RESIDUAL_PCT) || 8,

  // Estados de pedido
  PEDIDO_ESTADOS: {
    PENDIENTE: 'pendiente',
    ASIGNADO: 'asignado',
    RETIRO: 'retiro',
    EN_CAMINO: 'en_camino',
    ENTREGADO: 'entregado',
    CANCELADO: 'cancelado'
  },

  // Roles
  ROLES: {
    NEGOCIO: 'negocio',
    RIDER: 'rider',
    ADMIN: 'admin'
  }
};