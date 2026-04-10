const jwt = require('jsonwebtoken');
const config = require('../config');

// Verifica JWT y adjunta usuario al request
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = header.split(' ')[1];
    req.usuario = jwt.verify(token, config.JWT_SECRET);
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
