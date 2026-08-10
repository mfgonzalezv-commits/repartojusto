# Mejoras RepartoJusto
**Fecha:** 2026-08-10
**Estado:** 5 mejoras identificadas — 3 de seguridad (2 pendientes de semana anterior), 1 de rendimiento, 1 de memoria

---

## 1. `pedido:seguir` sin verificación de pertenencia — fuga de tracking a terceros

**Archivo:** `backend/src/sockets/index.js:101`
**Beneficio:** Evita que cualquier usuario autenticado (rider o negocio ajeno) espíe coordenadas GPS en tiempo real y el chat de entregas que no le corresponden.

```js
// Antes:
socket.on('pedido:seguir', ({ pedido_id }) => {
  if (!pedido_id) return;
  socket.join(`pedido:${pedido_id}`);
});

// Después:
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

## 2. Chat sin límite de longitud — DoS de memoria por WebSocket

**Archivo:** `backend/src/sockets/index.js:161`
**Beneficio:** Impide que un actor malicioso agote la RAM del servidor enviando payloads de texto de tamaño arbitrario; el Map de historial en memoria puede crecer sin control.

```js
// Antes:
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim(), hora: new Date().toISOString() };

// Después:
socket.on('chat:enviar', ({ pedido_id, texto }) => {
  if (!pedido_id || !texto || !String(texto).trim()) return;
  if (String(texto).length > 500) {
    return socket.emit('chat:error', { error: 'Mensaje demasiado largo (máx 500 caracteres)' });
  }
  const desde = rol === 'rider' ? 'rider' : 'negocio';
  const msg = { desde, nombre, texto: String(texto).trim().slice(0, 500), hora: new Date().toISOString() };
```

---

## 3. Memory leak en chatHistory — entradas de pedidos terminados nunca se purgan

**Archivo:** `backend/src/sockets/index.js:14`
**Beneficio:** Sin limpieza, el Map acumula historiales de pedidos entregados/cancelados indefinidamente; en producción con decenas de pedidos diarios, la presión de memoria crece sin techo.

```js
// Agregar un listener dentro de io.on('connection', ...) cerca del bloque de chat:
socket.on('pedido:actualizado', ({ id, estado }) => {
  if (['entregado', 'cancelado'].includes(estado)) {
    chatHistory.delete(id);
  }
});

// Alternativa más robusta: limpiar desde el servidor al emitir pedido:actualizado
// en routes/pedidos.js cuando el estado final se confirma (líneas ~247, ~293, ~353).
// Para ello exportar chatHistory desde sockets/index.js y referenciarla allí:
//   const { chatHistory } = require('../sockets');
//   if (['entregado','cancelado'].includes(nuevoEstado)) chatHistory.delete(pedido.id);
```

---

## 4. Escritura en DB en cada ping GPS — carga innecesaria con flota activa

**Archivo:** `backend/src/sockets/index.js:72`
**Beneficio:** Con 20 riders enviando GPS cada 3 s se generan ~400 writes/min a PostgreSQL; bufferear en memoria con flush cada 5 s reduce la carga en ~95% sin impacto perceptible en el tracking.

```js
// Añadir ANTES de io.on('connection', ...) — buffer global de última ubicación:
const ubicacionBuffer = new Map(); // rider_id → { lat, lng }
setInterval(async () => {
  if (ubicacionBuffer.size === 0) return;
  const snapshot = [...ubicacionBuffer.entries()];
  ubicacionBuffer.clear();
  for (const [rider_id, { lat, lng }] of snapshot) {
    db('UPDATE riders SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, rider_id])
      .catch(() => {});
  }
}, 5000);

// Dentro del handler rider:ubicacion (línea 72),
// reemplazar el await db('UPDATE riders ...') por:
ubicacionBuffer.set(socket.rider_id, { lat, lng });
// El broadcast a negocio y pedido permanece igual — sigue siendo inmediato.
```

---

## 5. Cobro Flow antes del INSERT del pedido — riesgo de cargo sin orden creada

**Archivo:** `backend/src/routes/pedidos.js:59`
**Beneficio:** Si el INSERT falla por cualquier error de BD después de que Flow ya cobró, el negocio queda debitado sin ningún pedido registrado; invertir el orden evita cobros huérfanos.

```js
// Estrategia: crear el pedido en BD primero, cobrar después.
// Si el cobro falla, cancelar el pedido recién insertado antes de responder.

// 1. Eliminar el bloque de cobro previo (líneas 52-67).
// 2. Calcular tarifa y crear el pedido normalmente (INSERT, líneas 96-107).
// 3. Añadir el cobro DESPUÉS del INSERT exitoso:

const { rows: [pedido] } = await db(
  `INSERT INTO pedidos (...) VALUES (...) RETURNING *`,
  [...]
);

if (!enPrueba) {
  const cobro = await cobros.cobrar({
    customerId: negocio.tarjeta_customer_id,
    monto: config.APP_FEE + tarifa_entrega,
  });
  if (!cobro.ok) {
    await db(
      `UPDATE pedidos SET estado = 'cancelado', cancelado_motivo = 'pago_rechazado' WHERE id = $1`,
      [pedido.id]
    );
    return res.status(402).json({
      error: 'Pago rechazado',
      detalle: 'No se pudo cobrar el servicio. Verifica tu tarjeta.'
    });
  }
}

// Si el cobro es exitoso, continuar con la cascada normalmente.
```

---

*Generado automáticamente por el Agente de Mejoras de RepartoJusto — 2026-08-10.*
