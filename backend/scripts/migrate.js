require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../src/config/database');

const migrations = [

  // ── USUARIOS (base para todos los roles) ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS usuarios (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,
    rol         VARCHAR(20)  NOT NULL CHECK (rol IN ('negocio','rider','admin')),
    nombre      VARCHAR(255) NOT NULL,
    telefono    VARCHAR(20),
    activo      BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
  )`,

  // ── NEGOCIOS ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS negocios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id       UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre_comercial VARCHAR(255) NOT NULL,
    descripcion      TEXT,
    direccion        VARCHAR(500) NOT NULL,
    lat              DECIMAL(10, 8),
    lng              DECIMAL(11, 8),
    categoria        VARCHAR(100),
    logo_url         VARCHAR(500),
    activo           BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
  )`,

  // ── RIDERS ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS riders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id     UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    vehiculo_tipo  VARCHAR(20) DEFAULT 'moto' CHECK (vehiculo_tipo IN ('bicicleta','moto','auto')),
    disponible     BOOLEAN DEFAULT false,
    lat            DECIMAL(10, 8),
    lng            DECIMAL(11, 8),
    rating         DECIMAL(3, 2) DEFAULT 5.00,
    total_entregas INTEGER DEFAULT 0,
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW()
  )`,

  // ── PEDIDOS ───────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pedidos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id         UUID NOT NULL REFERENCES negocios(id),
    rider_id           UUID REFERENCES riders(id),
    cliente_nombre     VARCHAR(255) NOT NULL,
    cliente_telefono   VARCHAR(20),
    direccion_entrega  VARCHAR(500) NOT NULL,
    lat_entrega        DECIMAL(10, 8),
    lng_entrega        DECIMAL(11, 8),
    estado             VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','asignado','retiro','en_camino','entregado','cancelado')),
    distancia_km       DECIMAL(6, 2),
    tarifa_entrega     INTEGER NOT NULL,
    app_fee            INTEGER NOT NULL DEFAULT 500,
    notas              TEXT,
    entregado_at       TIMESTAMP,
    cancelado_motivo   TEXT,
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
  )`,

  // ── PRODUCTOS ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS productos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id    UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nombre        VARCHAR(255) NOT NULL,
    descripcion   TEXT,
    precio        INTEGER NOT NULL,
    imagen_url    VARCHAR(500),
    categoria     VARCHAR(100),
    disponible    BOOLEAN DEFAULT true,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
  )`,

  // ── CLIENTES (directorio reutilizable) ───────────────────────────────────
  `CREATE TABLE IF NOT EXISTS clientes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id  UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nombre      VARCHAR(255) NOT NULL,
    telefono    VARCHAR(20) NOT NULL,
    direccion   VARCHAR(500),
    lat         DECIMAL(10,8),
    lng         DECIMAL(11,8),
    notas       TEXT,
    total_pedidos INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(negocio_id, telefono)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_clientes_negocio ON clientes(negocio_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono)`,

  // ── PAGOS ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pagos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id      UUID NOT NULL REFERENCES pedidos(id),
    flow_order_id  VARCHAR(100),
    flow_token     VARCHAR(200),
    monto          INTEGER NOT NULL,
    estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','pagado','fallido','reembolsado')),
    pagado_at      TIMESTAMP,
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW()
  )`,

  // ── LIQUIDACIONES (pagos a riders) ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS liquidaciones (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id       UUID NOT NULL REFERENCES riders(id),
    monto_total    INTEGER NOT NULL,
    pedidos_count  INTEGER NOT NULL DEFAULT 0,
    estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','pagada')),
    fecha_desde    DATE NOT NULL,
    fecha_hasta    DATE NOT NULL,
    pagada_at      TIMESTAMP,
    created_at     TIMESTAMP DEFAULT NOW()
  )`,

  // ── Columnas adicionales pedidos (idempotente) ────────────────────────────
  `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id)`,
  `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS retiro_at TIMESTAMP`,
  `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS en_camino_at TIMESTAMP`,
  `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS asignado_at TIMESTAMP`,
  `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_producto INTEGER`,
  `ALTER TABLE riders  ADD COLUMN IF NOT EXISTS saldo_pendiente INTEGER DEFAULT 0`,

  // ── Tarjeta de cobro del negocio ─────────────────────────────────────────
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tarjeta_customer_id VARCHAR(255)`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tarjeta_token       VARCHAR(255)`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tarjeta_ultimos4    VARCHAR(4)`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tarjeta_marca       VARCHAR(30)`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tarjeta_exp         VARCHAR(7)`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tarjeta_registrada_at TIMESTAMPTZ`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS modo VARCHAR(20) DEFAULT 'prueba'`,

  // ── Estrategia de cobro al cliente ───────────────────────────────────────
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS estrategia_cobro VARCHAR(30) DEFAULT 'todo_incluido'`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS pct_negocio INTEGER DEFAULT 100`,
  `ALTER TABLE negocios ADD COLUMN IF NOT EXISTS mostrar_costo_seguimiento BOOLEAN DEFAULT false`,
  `ALTER TABLE pedidos  ADD COLUMN IF NOT EXISTS cargo_negocio INTEGER DEFAULT 0`,
  `ALTER TABLE pedidos  ADD COLUMN IF NOT EXISTS cargo_cliente  INTEGER DEFAULT 0`,

  // ── Restricciones adicionales (idempotente) ───────────────────────────────
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'negocios_usuario_id_key'
     ) THEN
       ALTER TABLE negocios ADD CONSTRAINT negocios_usuario_id_key UNIQUE (usuario_id);
     END IF;
   END $$`,

  // ── CALIFICACIONES DE RIDERS ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS calificaciones (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id     UUID NOT NULL REFERENCES pedidos(id),
    rider_id      UUID NOT NULL REFERENCES riders(id),
    tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('negocio','cliente')),
    -- Preguntas negocio
    llego_tiempo      BOOLEAN,
    fue_amable        BOOLEAN,
    bien_presentado   BOOLEAN,
    verifico_pedido   BOOLEAN,
    -- Preguntas cliente
    pedido_buen_estado BOOLEAN,
    lo_recomendaria    BOOLEAN,
    -- Compartida
    comentario    TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(pedido_id, tipo)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_calificaciones_rider  ON calificaciones(rider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_calificaciones_pedido ON calificaciones(pedido_id)`,

  // ── ÍNDICES ───────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_pedidos_negocio  ON pedidos(negocio_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_rider    ON pedidos(rider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_estado   ON pedidos(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_riders_disponible ON riders(disponible)`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_pedido     ON pagos(pedido_id)`,
  `CREATE INDEX IF NOT EXISTS idx_liquidaciones_rider ON liquidaciones(rider_id)`,

  // ── TRIGGER updated_at automático ────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION set_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql`,

  ...[
    'usuarios', 'negocios', 'riders', 'pedidos', 'pagos'
  ].map(tabla => `
    DROP TRIGGER IF EXISTS trg_${tabla}_updated_at ON ${tabla};
    CREATE TRIGGER trg_${tabla}_updated_at
      BEFORE UPDATE ON ${tabla}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `)
];

async function migrate() {
  console.log('🚀 Iniciando migraciones...\n');
  const client = await pool.connect();

  try {
    for (const sql of migrations) {
      const label = sql.trim().split('\n')[0].substring(0, 60);
      try {
        await client.query(sql);
        console.log(`  ✅ ${label}`);
      } catch (err) {
        console.error(`  ❌ ${label}`);
        throw err;
      }
    }
    console.log('\n✅ Migraciones completadas.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('\n❌ Error en migración:', err.message);
  process.exit(1);
});
