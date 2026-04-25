const router = require('express').Router();
const https = require('https');
const { auth } = require('../middleware/auth');

function llamarClaude(system, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system,
      messages,
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const SISTEMA_NEGOCIO = `Eres el asistente de soporte de RepartoJusto, una plataforma de delivery chilena sin comisiones por venta.
Estás ayudando a un NEGOCIO (restaurante, tienda, etc.) que usa la plataforma para despachar pedidos.

Información clave que debes saber:
- Los negocios pagan $500 por pedido (tarifa fija, sin importar el monto de la venta)
- No hay mensualidad ni comisión por venta
- Los riders reciben $1.100 fijo + $350 por km
- Estados de pedido: pendiente → asignado → retiro → en_camino → entregado / cancelado
- El negocio puede ver pedidos en tiempo real en su panel
- Para crear un pedido se necesita: nombre del cliente, teléfono, dirección de entrega
- El seguimiento en tiempo real lo ve el cliente en un link único

Responde siempre en español chileno, de forma breve y directa. Si no sabes algo específico del sistema, dilo honestamente y sugiere contactar al administrador en admin@repartojusto.cl.`;

const SISTEMA_RIDER = `Eres el asistente de soporte de RepartoJusto, una plataforma de delivery chilena.
Estás ayudando a un RIDER (repartidor) que usa la app para hacer despachos.

Información clave que debes saber:
- Los riders ganan $1.100 fijo por pedido + $350 por km recorrido
- Para recibir pedidos debes estar en modo "Online" (toggle verde en la app)
- Los pedidos llegan con sonido de alarma y notificación
- Tienes 30 segundos para aceptar un pedido antes de que pase al siguiente rider
- Estados: cuando aceptas → "asignado", al retirar en el negocio → "retiro", en camino → "en_camino", al entregar → "entregado"
- Los pagos se liquidan semanalmente
- Si tienes problemas con el GPS, asegúrate de tener los permisos de ubicación activados
- Para activar las notificaciones de sonido, toca el botón "Activar sonido" en la barra superior

Responde siempre en español chileno, de forma breve y directa. Si no sabes algo específico, sugiere contactar al administrador en admin@repartojusto.cl.`;

router.post('/', auth, async (req, res, next) => {
  try {
    const { mensaje, historial = [] } = req.body;
    if (!mensaje?.trim()) return res.status(400).json({ error: 'Mensaje requerido' });

    const rol = req.usuario.rol;
    const sistema = rol === 'rider' ? SISTEMA_RIDER : SISTEMA_NEGOCIO;

    const messages = [
      ...historial.slice(-10).map(h => ({ role: h.rol, content: h.contenido })),
      { role: 'user', content: mensaje }
    ];

    const response = await llamarClaude(sistema, messages);
    if (response.error) return res.status(500).json({ error: response.error.message });
    res.json({ respuesta: response.content[0].text });
  } catch (err) { next(err); }
});

module.exports = router;
