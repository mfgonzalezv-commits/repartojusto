const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query: db, transaction } = require('../config/database');
const config = require('../config');
const { auth } = require('../middleware/auth');

// Helper: lanza error de validación si hay campos inválidos
const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
};

// Helper: genera JWT
const generarToken = (usuario) =>
  jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

// ── POST /api/auth/registro/negocio ───────────────────────────────────────
router.post('/registro/negocio',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('nombre').trim().notEmpty(),
    body('nombre_comercial').trim().notEmpty(),
    body('direccion').trim().notEmpty(),
    body('telefono').optional().isMobilePhone(),
  ],
  validar,
  async (req, res, next) => {
    const { email, password, nombre, nombre_comercial, descripcion, direccion, lat, lng, categoria, telefono } = req.body;
    try {
      const resultado = await transaction(async (client) => {
        const hash = await bcrypt.hash(password, 10);
        const { rows: [usuario] } = await client.query(
          `INSERT INTO usuarios (email, password, rol, nombre, telefono)
           VALUES ($1, $2, 'negocio', $3, $4) RETURNING id, rol, nombre`,
          [email, hash, nombre, telefono]
        );
        const { rows: [negocio] } = await client.query(
          `INSERT INTO negocios (usuario_id, nombre_comercial, descripcion, direccion, lat, lng, categoria)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [usuario.id, nombre_comercial, descripcion, direccion, lat, lng, categoria]
        );
        return { usuario, negocio_id: negocio.id };
      });

      res.status(201).json({
        token: generarToken(resultado.usuario),
        usuario: { ...resultado.usuario, negocio_id: resultado.negocio_id }
      });
    } catch (err) { next(err); }
  }
);

// ── POST /api/auth/registro/rider ─────────────────────────────────────────
router.post('/registro/rider',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('nombre').trim().notEmpty(),
    body('telefono').isMobilePhone(),
    body('vehiculo_tipo').isIn(['bicicleta', 'moto', 'auto']),
  ],
  validar,
  async (req, res, next) => {
    const { email, password, nombre, telefono, vehiculo_tipo } = req.body;
    try {
      const resultado = await transaction(async (client) => {
        const hash = await bcrypt.hash(password, 10);
        const { rows: [usuario] } = await client.query(
          `INSERT INTO usuarios (email, password, rol, nombre, telefono)
           VALUES ($1, $2, 'rider', $3, $4) RETURNING id, rol, nombre`,
          [email, hash, nombre, telefono]
        );
        const { rows: [rider] } = await client.query(
          `INSERT INTO riders (usuario_id, vehiculo_tipo)
           VALUES ($1, $2) RETURNING id`,
          [usuario.id, vehiculo_tipo]
        );
        return { usuario, rider_id: rider.id };
      });

      res.status(201).json({
        token: generarToken(resultado.usuario),
        usuario: { ...resultado.usuario, rider_id: resultado.rider_id }
      });
    } catch (err) { next(err); }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────────
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validar,
  async (req, res, next) => {
    const { email, password } = req.body;
    try {
      const { rows } = await db(
        `SELECT u.id, u.email, u.password, u.rol, u.nombre, u.activo,
                n.id AS negocio_id, r.id AS rider_id
         FROM usuarios u
         LEFT JOIN negocios n ON n.usuario_id = u.id
         LEFT JOIN riders   r ON r.usuario_id = u.id
         WHERE u.email = $1`,
        [email]
      );

      const usuario = rows[0];
      if (!usuario || !(await bcrypt.compare(password, usuario.password))) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
      if (!usuario.activo) {
        return res.status(403).json({ error: 'Cuenta desactivada' });
      }

      const { password: _, ...datos } = usuario;
      res.json({ token: generarToken(usuario), usuario: datos });
    } catch (err) { next(err); }
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────
router.get('/me', auth, async (req, res, next) => {
  try {
    const { rows } = await db(
      `SELECT u.id, u.email, u.rol, u.nombre, u.telefono, u.created_at,
              n.id AS negocio_id, n.nombre_comercial, n.direccion,
              r.id AS rider_id, r.disponible, r.rating, r.total_entregas
       FROM usuarios u
       LEFT JOIN negocios n ON n.usuario_id = u.id
       LEFT JOIN riders   r ON r.usuario_id = u.id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
