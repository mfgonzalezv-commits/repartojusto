const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@repartojusto.cl',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendPush(subscription, payload) {
  if (!subscription || !process.env.VAPID_PUBLIC_KEY) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Suscripción expirada — el caller puede limpiarla
      throw { expired: true };
    }
  }
}

module.exports = { sendPush };
