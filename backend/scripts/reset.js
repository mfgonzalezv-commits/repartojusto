require('dotenv').config();
const { pool } = require('../src/config/database');

async function reset() {
  const client = await pool.connect();
  console.log('🗑️  Limpiando datos de prueba...\n');
  try {
    await client.query('DELETE FROM pagos');
    console.log('  ✅ pagos');
    await client.query('DELETE FROM liquidaciones');
    console.log('  ✅ liquidaciones');
    await client.query('DELETE FROM pedidos');
    console.log('  ✅ pedidos');
    await client.query('UPDATE riders SET total_entregas = 0, saldo_pendiente = 0, disponible = false, lat = NULL, lng = NULL');
    console.log('  ✅ riders (contadores reseteados)');
    console.log('\n✅ Reset completado. Usuarios, negocios y riders conservados.');
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
