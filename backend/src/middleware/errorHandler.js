const config = require('../config');

module.exports = (err, req, res, next) => {
  // Errores de validación (express-validator)
  if (err.type === 'validation') {
    return res.status(400).json({ error: err.message, detalles: err.detalles });
  }

  // JWT inválido
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  // Error de unicidad PostgreSQL (email duplicado, etc.)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'El recurso ya existe' });
  }

  // Error de FK PostgreSQL
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia inválida' });
  }

  // Siempre loguear para Railway
  console.error('❌ Error:', err.message, err.stack);

  res.status(err.status || 500).json({
    error: config.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message
  });
};
