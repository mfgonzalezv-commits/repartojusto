require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

const seed = async () => {
  const client = await pool.connect();
  console.log('🌱 Iniciando seed...\n');

  try {
    await client.query('BEGIN');

    // ── Admin ─────────────────────────────────────────────────────────────
    const hashAdmin = await bcrypt.hash('admin1234', 10);
    const { rows: [admin] } = await client.query(
      `INSERT INTO usuarios (email, password, rol, nombre, telefono)
       VALUES ($1, $2, 'admin', 'Administrador', '+56912345678')
       ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
       RETURNING id`,
      ['admin@repartojusto.cl', hashAdmin]
    );
    console.log('  ✅ Admin:', admin.id);

    // ── Negocios de prueba ────────────────────────────────────────────────
    const negocios = [
      {
        email: 'sushi@ejemplo.cl',
        password: 'negocio1234',
        nombre: 'Carlos Sato',
        telefono: '+56911111111',
        nombre_comercial: 'Sushi Tanaka',
        descripcion: 'El mejor sushi de Santiago',
        direccion: 'Av. Providencia 1234, Providencia',
        lat: -33.4313,
        lng: -70.6108,
        categoria: 'japonesa'
      },
      {
        email: 'pizza@ejemplo.cl',
        password: 'negocio1234',
        nombre: 'María González',
        telefono: '+56922222222',
        nombre_comercial: 'Pizza Napoli',
        descripcion: 'Pizzas artesanales al horno de leña',
        direccion: 'Av. Italia 567, Ñuñoa',
        lat: -33.4566,
        lng: -70.6024,
        categoria: 'italiana'
      },
      {
        email: 'burger@ejemplo.cl',
        password: 'negocio1234',
        nombre: 'Diego Muñoz',
        telefono: '+56933333333',
        nombre_comercial: 'Burger Bros',
        descripcion: 'Hamburguesas gourmet con ingredientes frescos',
        direccion: 'Av. Las Condes 8900, Las Condes',
        lat: -33.4068,
        lng: -70.5640,
        categoria: 'americana'
      },
      {
        email: 'buenaventura@repartojusto.cl',
        password: 'negocio1234',
        nombre: 'Buenaventura',
        telefono: '+56900000000',
        nombre_comercial: 'Buenaventura',
        descripcion: 'Negocio local en Villa Alemana',
        direccion: 'Freire 489, Peñablanca, Villa Alemana, Región de Valparaíso',
        lat: -33.0442,
        lng: -71.3725,
        categoria: 'general'
      }
    ];

    const negocioIds = [];
    for (const n of negocios) {
      const hash = await bcrypt.hash(n.password, 10);
      const { rows: [usuario] } = await client.query(
        `INSERT INTO usuarios (email, password, rol, nombre, telefono)
         VALUES ($1, $2, 'negocio', $3, $4)
         ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
         RETURNING id`,
        [n.email, hash, n.nombre, n.telefono]
      );

      const { rows: [negocio] } = await client.query(
        `INSERT INTO negocios (usuario_id, nombre_comercial, descripcion, direccion, lat, lng, categoria, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (usuario_id) DO UPDATE SET
           nombre_comercial = EXCLUDED.nombre_comercial,
           descripcion      = EXCLUDED.descripcion,
           direccion        = EXCLUDED.direccion,
           lat              = EXCLUDED.lat,
           lng              = EXCLUDED.lng,
           categoria        = EXCLUDED.categoria
         RETURNING id`,
        [usuario.id, n.nombre_comercial, n.descripcion, n.direccion, n.lat, n.lng, n.categoria]
      );

      if (negocio) {
        negocioIds.push(negocio.id);
        console.log(`  ✅ Negocio: ${n.nombre_comercial} — ${negocio.id}`);
      }
    }

    // ── Riders de prueba ──────────────────────────────────────────────────
    const riders = [
      {
        email: 'rider1@ejemplo.cl',
        password: 'rider1234',
        nombre: 'Pedro Ramírez',
        telefono: '+56944444444',
        vehiculo_tipo: 'moto',
        lat: -33.4400,
        lng: -70.6100
      },
      {
        email: 'rider2@ejemplo.cl',
        password: 'rider1234',
        nombre: 'Ana Torres',
        telefono: '+56955555555',
        vehiculo_tipo: 'bicicleta',
        lat: -33.4500,
        lng: -70.6050
      }
    ];

    for (const r of riders) {
      const hash = await bcrypt.hash(r.password, 10);
      const { rows: [usuario] } = await client.query(
        `INSERT INTO usuarios (email, password, rol, nombre, telefono)
         VALUES ($1, $2, 'rider', $3, $4)
         ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
         RETURNING id`,
        [r.email, hash, r.nombre, r.telefono]
      );

      const { rows: [rider] } = await client.query(
        `INSERT INTO riders (usuario_id, vehiculo_tipo, disponible, lat, lng)
         VALUES ($1, $2, false, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [usuario.id, r.vehiculo_tipo, r.lat, r.lng]
      );

      if (rider) console.log(`  ✅ Rider: ${r.nombre} — ${rider.id}`);
    }

    // ── Productos de ejemplo para el primer negocio ───────────────────────
    if (negocioIds[0]) {
      const productos = [
        { nombre: 'Roll California', descripcion: 'Kanikama, pepino, palta', precio: 6500, categoria: 'rolls' },
        { nombre: 'Sashimi Salmón (8 pzs)', descripcion: 'Salmón fresco premium', precio: 8900, categoria: 'sashimi' },
        { nombre: 'Ramen Tonkotsu', descripcion: 'Caldo de cerdo, chashu, huevo', precio: 7200, categoria: 'sopas' },
        { nombre: 'Edamame', descripcion: 'Poroto de soya al vapor con sal', precio: 2500, categoria: 'entradas' }
      ];

      for (const p of productos) {
        await client.query(
          `INSERT INTO productos (negocio_id, nombre, descripcion, precio, categoria, disponible)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT DO NOTHING`,
          [negocioIds[0], p.nombre, p.descripcion, p.precio, p.categoria]
        );
      }
      console.log(`  ✅ Productos: ${productos.length} ítems para Sushi Tanaka`);
    }

    await client.query('COMMIT');

    console.log('\n✅ Seed completado.\n');
    console.log('─── Credenciales de prueba ───────────────────────');
    console.log('Admin:    admin@repartojusto.cl    / admin1234');
    console.log('Negocio:  sushi@ejemplo.cl         / negocio1234');
    console.log('Negocio:  pizza@ejemplo.cl         / negocio1234');
    console.log('Rider:    rider1@ejemplo.cl        / rider1234');
    console.log('──────────────────────────────────────────────────\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
