import { kv } from '@vercel/kv';

/**
 * فحص التفعيل — القرار من السيرفر فقط (Vercel KV).
 * deviceId هنا = hash لمعرّف اللوحة الأم القادم من تطبيق Electron.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ isActivated: false, message: 'Not Found' });
  }

  const { deviceId } = req.body || {};

  if (!deviceId) {
    return res.status(400).json({
      isActivated: false,
      message: 'معرّف اللوحة الأم مفقود',
    });
  }

  try {
    const key = await kv.get(`device:${deviceId}`);
    if (!key) {
      return res.status(200).json({ isActivated: false });
    }

    const record = await kv.get(`license:${key}`);
    if (!record || record.revoked || record.deviceId !== deviceId) {
      return res.status(200).json({ isActivated: false });
    }

    return res.status(200).json({ isActivated: true });
  } catch (err) {
    console.error('check-status.js KV error:', err);
    return res.status(500).json({
      isActivated: false,
      message:
        'فشل الاتصال بقاعدة بيانات KV: ' +
        (err && err.message ? err.message : String(err)),
    });
  }
}
