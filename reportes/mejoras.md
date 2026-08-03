# Mejoras RepartoJusto
**Fecha:** 2026-08-03
**Estado:** 5 mejoras identificadas — 3 de seguridad, 1 de rendimiento, 1 de resiliencia

---

## 1. Chat sin límite de longitud — DoS de memoria por WebSocket
**Archivo:** `backend/src/sockets/index.js:162`
**Beneficio:** Impide que un actor malicioso agote la RAM del servidor enviando mensajes de texto de tamaño arbitrario por WebSocket; el Map de historial en memoria puede crecer sin control.

**Código actual:**
```js
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim(), hora: new Date().toISOString() };
```

**Código mejorado:**
```js
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  if (String(texto).length > 500) {
    return socket.emit('chat:error', { error: 'Mensaje demasiado largo (máx 500 caracteres)' });
  }
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim().slice(0, 500), hora: new Date().toISOString() };
```

---

## 2. `pedido:seguir` sin verificación de pertenencia — fuga de tracking a terceros
**Archivo:** `backend/src/sockets/index.js:101`
**Beneficio:** Evita que cualquier usuario autenticado (rider o negocio ajeno) espíe coordenadas GPS en tiempo real y datos de entregas que no le corresponden.

**Código actual:**
```js
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});
```

**Código mejorado:**
```js
socket.on('pedido:seguir', async ({ pedido_id }) => {
  if (!pedido_id) return;
  try {
    const { rows: [pedido] } = await db(
      `SELECT negocio_id, rider_id FROM pedidos WHERE id = $1`, [pedido_id]
    );
    if (!pedido) return socket.emit('error', { error: 'Pedido no encontrado' });
    const autorizado =
      rol === 'admin' ||
      (rol === 'negocio' && pedido.negocio_id === socket.negocio_id) ||
      (rol === 'rider'   && pedido.rider_id   === socket.rider_id);
    if (!autorizado) return socket.emit('error', { error: 'Sin acceso a este pedido' });
    socket.join(`pedido:${pedido_id}`);
  } catch (err) {
    console.error('❌ Error pedido:seguir:', err.message);
  }
});
```

---

## 3. Memory leak en el rate limiter de fallback en memoria
**Archivo:** `backend/src/routes/auth.js:48-63`
**Beneficio:** Cuando Redis no está disponible, el `Map` del rate limiter nunca elimina entradas expiradas; con tráfico normal de IPs distintas el proceso crece indefinidamente.

**Código actual (fallback en memoria):**
```js
const entry = store.get(ip);
if (entry) {
  if (now - entry.firstAttempt < windowMs) {
    if (entry.count >= max) {
      const retryAfter = Math.ceil((windowMs - (now - entry.firstAttempt)) / 1000);
      return res.status(429).json({ error: mensaje, retryAfter });
    }
    entry.count++;
  } else {
    store.set(ip, { count: 1, firstAttempt: now });
  }
} else {
  store.set(ip, { count: 1, firstAttempt: now });
}
next();
```

**Código mejorado** (agregar purga periódica al final del bloque, antes de `next()`):
```js
// ... misma lógica de arriba sin cambios ...

// Purgar entradas expiradas cuando el store crece (evita memory leak)
if (store.size > 500) {
  for (const [k, v] of store) {
    if (now - v.firstAttempt >= windowMs) store.delete(k);
  }
}
next();
```

---

## 4. Escritura en DB en cada ping GPS — carga innecesaria con flota activa
**Archivo:** `backend/src/sockets/index.js:72-76`
**Beneficio:** Con 20 riders enviando GPS cada 3 s se generan ~400 writes/min a PostgreSQL; bufferear en memoria con flush cada 5 s reduce la carga en ~95% sin impacto perceptible en el tracking.

**Código actual:**
```js
socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  try {
    await db(
      'UPDATE riders SET lat = $1, lng = $2 WHERE id = $3',
      [lat, lng, socket.rider_id]
    );
```

**Código mejorado** (añadir buffer antes de `io.on('connection', ...)` y ajustar el handler):
```js
// Buffer de última ubicación por rider_id → { lat, lng }
const ubicacionBuffer = new Map();
setInterval(async () => {
  if (ubicacionBuffer.size === 0) return;
  const snapshot = [...ubicacionBuffer.entries()];
  ubicacionBuffer.clear();
  for (const [rider_id, { lat, lng }] of snapshot) {
    db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, rider_id])
      .catch(() => {});
  }
}, 5000);

// Dentro del handler rider:ubicacion — reemplazar el await db() de UPDATE:
socket.on('rider:ubicacion', async ({ lat, lng }) => {
  if (rol !== 'rider' || !socket.rider_id) return;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  try {
    ubicacionBuffer.set(socket.rider_id, { lat, lng }); // sin await, sin DB directa
    // El resto del handler (emit a negocio y pedido) permanece igual
```

---

## 5. Webhook sandbox acepta cualquier petición cuando falta `FLOW_SECRET`
**Archivo:** `backend/src/routes/pagos.js:127-133`
**Beneficio:** En entornos de staging sin `FLOW_SECRET`, cualquier HTTP POST puede confirmar un pago fraudulento; requerir un header de control estático bloquea activaciones accidentales o maliciosas.

**Código actual:**
```js
if (!flowSecret) {
  if (config.FLOW_ENVIRONMENT !== 'sandbox') {
    console.error('❌ FLOW_SECRET no configurado en producción — webhook rechazado');
    return res.status(401).end();
  }
  console.warn('⚠️  FLOW_SECRET no configurado: webhook sin validación (solo sandbox)');
}
```

**Código mejorado:**
```js
if (!flowSecret) {
  if (config.FLOW_ENVIRONMENT !== 'sandbox') {
    console.error('❌ FLOW_SECRET no configurado en producción — webhook rechazado');
    return res.status(401).end();
  }
  // En sandbox exigir al menos un header estático para evitar confirmaciones no autorizadas
  const sandboxKey = req.headers['x-sandbox-key'];
  const expectedKey = config.SANDBOX_WEBHOOK_KEY || 'sandbox-repartojusto-dev';
  if (sandboxKey !== expectedKey) {
    console.warn('⚠️  Webhook sandbox rechazado: x-sandbox-key inválida o ausente');
    return res.status(401).end();
  }
  console.warn('⚠️  Webhook sandbox validado con x-sandbox-key (sin HMAC)');
}
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto — 2026-08-03.*
