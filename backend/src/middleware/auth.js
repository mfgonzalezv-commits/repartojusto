const jwt = require('jsonwebtoken');
const config = require('../config');
const { query: db } = require('../config/database');

// Verifica JWT, adjunta usuario al request y confirma que la cuenta sigue activa en DB.
// Esto previene que usuarios desactivados (baneados) sigan operando durante los 7 días
// de vida del token sin necesidad de un sistema de revocación.
const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.JWT_SECRET);

    const { rows } = await db('SELECT activo FROM usuarios WHERE id = $1', [decoded.id]);
    if (!rows[0] || !rows[0].activo) {
      return res.status(401).json({ error: 'Cuenta desactivada o no encontrada' });
    }

    req.usuario = decoded;
    next();
  } catch (err) {
    next(err);
  }
};

// Restringe por rol: solo(req, res, next) => ...
const solo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario?.rol)) {
    return res.status(403).json({ error: 'Sin permiso para esta acción' });
  }
  next();
};

module.exports = { auth, solo };
