# RepartoJusto — Contexto para Claude

## Qué es
Plataforma de delivery chilena **sin comisiones por venta**. Los negocios pagan solo por la entrega (tarifa fija por km al rider). Alternativa a Uber Eats / Rappi.

## Stack
- **Frontend**: HTML/CSS/JS vanilla (sin framework)
- **Backend**: Node.js + Express + Socket.io
- **DB**: PostgreSQL (pg pool)
- **Cache/Queues**: Redis
- **Auth**: JWT (bcryptjs)
- **Pagos**: Flow API (pasarela chilena)
- **Notificaciones push**: Firebase FCM
- **Mapas**: Google Maps API

## Roles del sistema
- `negocio` — publica pedidos, ve estado en tiempo real
- `rider` — acepta pedidos, navega, cobra por entrega
- `admin` — gestión general, métricas, pagos

## Modelo de negocio / tarifas (en config/index.js)
- `APP_FEE`: 500 CLP (tarifa fija por pedido)
- `RIDER_TARIFA_KM`: 650 CLP por km
- `RESIDUAL_PCT`: 8% residual de la app

## Estados de pedido
`pendiente` → `asignado` → `retiro` → `en_camino` → `entregado` / `cancelado`

## Estructura de archivos
```
RepartoJusto/
├── CLAUDE.md               ← este archivo
├── index.html              ← landing page (COMPLETO)
├── Dash/
│   └── dashboard.html      ← dashboard financiero dark mode con Chart.js (COMPLETO)
└── backend/
    ├── .env.example
    ├── package.json
    ├── server.js           ← servidor Express + Socket.io (COMPLETO)
    └── src/
        └── config/
            ├── index.js    ← variables de config (COMPLETO)
            └── database.js ← pool PostgreSQL + helpers query/transaction (COMPLETO)
```

## Qué falta implementar
Estos archivos están referenciados en `server.js` pero NO existen aún:

| Archivo | Descripción |
|---|---|
| `src/routes/auth.js` | Register/login para negocios, riders y admin |
| `src/routes/pedidos.js` | CRUD pedidos, asignación a rider |
| `src/routes/riders.js` | Perfil rider, disponibilidad, historial |
| `src/routes/negocios.js` | Perfil negocio, menú, pedidos activos |
| `src/routes/pagos.js` | Integración Flow, webhooks, liquidaciones |
| `src/routes/admin.js` | Panel admin, métricas, gestión usuarios |
| `src/middleware/errorHandler.js` | Middleware global de errores |
| `src/sockets/index.js` | WebSocket handlers (tracking en tiempo real) |
| `scripts/migrate.js` | Crear tablas en PostgreSQL |
| `scripts/seed.js` | Datos iniciales (admin, negocios de prueba) |

## Orden sugerido para continuar
1. `scripts/migrate.js` — definir schema de la DB primero
2. `src/middleware/errorHandler.js` — simple, desbloquea todo
3. `src/routes/auth.js` — base para todo lo demás
4. `src/routes/negocios.js` y `src/routes/riders.js`
5. `src/routes/pedidos.js` — lógica core
6. `src/sockets/index.js` — tracking en tiempo real
7. `src/routes/pagos.js` — integración Flow
8. `src/routes/admin.js`
9. `scripts/seed.js`

## Variables de entorno (.env.example)
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repartojusto`
- `REDIS_URL=redis://localhost:6379`
- Flow y Firebase están en modo mock/sandbox por ahora
