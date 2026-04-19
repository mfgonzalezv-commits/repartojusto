const webpush = require('web-push');

let vapidConfigurado = false;

function _configurar() {
  if (vapidConfigurado || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:admin@repartojusto.cl',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigurado = true;
  } catch {}
}

async function sendPush(subscription, payload) {
  _configurar();
  if (!subscription || !vapidConfigurado) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      throw { expired: true };
    }
  }
}

module.exports = { sendPush };
