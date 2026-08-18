const router = require('express').Router();
const { query: q, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const config = require('../config');

const validar = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', detalles: errores.array() });
  next();
};

// Decodifica el polyline codificado que devuelve Google (algoritmo estándar)
function decodificarPolyline(encoded) {
  let index = 0, lat = 0, lng = 0;
  const puntos = [];
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    puntos.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return puntos;
}

// Quita las etiquetas HTML que Google devuelve en las instrucciones (<b>, <div>, etc.)
function limpiarInstruccion(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── GET /api/rutas/directions ────────────────────────────────────────────
// Calcula la ruta real entre dos puntos usando Google Directions API.
// La clave de Google nunca se expone al navegador: la llamada la hace el servidor.
router.get('/directions',
  auth,
  [
    q('origen_lat').isFloat(), q('origen_lng').isFloat(),
    q('destino_lat').isFloat(), q('destino_lng').isFloat()
  ],
  validar,
  async (req, res, next) => {
    try {
      if (!config.GOOGLE_MAPS_API_KEY) {
        return res.status(503).json({ error: 'Ruteo no disponible: falta configurar GOOGLE_MAPS_API_KEY' });
      }

      const { origen_lat, origen_lng, destino_lat, destino_lng } = req.query;
      const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
      url.searchParams.set('origin', `${origen_lat},${origen_lng}`);
      url.searchParams.set('destination', `${destino_lat},${destino_lng}`);
      url.searchParams.set('mode', 'driving');
      url.searchParams.set('language', 'es');
      url.searchParams.set('region', 'cl');
      url.searchParams.set('key', config.GOOGLE_MAPS_API_KEY);

      const r = await fetch(url);
      const data = await r.json();

      if (data.status !== 'OK' || !data.routes?.length) {
        return res.status(502).json({ error: 'No se pudo calcular la ruta', detalle: data.status });
      }

      const ruta = data.routes[0];
      const pierna = ruta.legs[0];

      const pasos = pierna.steps.map(paso => ({
        instruccion: limpiarInstruccion(paso.html_instructions),
        distancia_m: paso.distance.value,
        duracion_s: paso.duration.value,
        maniobra: paso.maneuver || null,
        lat: paso.end_location.lat,
        lng: paso.end_location.lng
      }));

      res.json({
        distancia_km: +(pierna.distance.value / 1000).toFixed(2),
        duracion_min: Math.round(pierna.duration.value / 60),
        polyline: decodificarPolyline(ruta.overview_polyline.points),
        pasos
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
