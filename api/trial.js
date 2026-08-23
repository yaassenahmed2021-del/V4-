import { kv } from '@vercel/kv';

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 أيام

/**
 * التجربة المجانية — تُخزَّن بالكامل على السيرفر (KV) بمفتاح:
 *   trial:<deviceId>
 * حيث deviceId = hash لمعرّف اللوحة الأم (Motherboard).
 * لا يوجد تخزين محلي لمدة التجربة على جهاز العميل.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ success: false, message: 'Not Found' });
  }

  const { action, deviceId } = req.body || {};

  if (!deviceId || !['start', 'status'].includes(action)) {
    return res.status(400).json({ success: false, message: 'بيانات غير صحيحة' });
  }

  const trialKey = `trial:${deviceId}`;

  try {
    if (action === 'start') {
      const existing = await kv.get(trialKey);
      if (existing) {
        // بدأت التجربة مسبقاً على نفس اللوحة الأم — لا تُعاد من الصفر
        return res.status(200).json({ success: true, alreadyStarted: true });
      }
      const now = Date.now();
      const record = {
        startedAt: now,
        expiresAt: now + TRIAL_DURATION_MS,
        idType: 'motherboard',
      };
      await kv.set(trialKey, record);
      return res.status(200).json({ success: true, alreadyStarted: false });
    }

    // action === 'status'
    const record = await kv.get(trialKey);
    if (!record) {
      return res.status(200).json({ expired: false, notStarted: true });
    }

    const remaining = record.expiresAt - Date.now();
    if (remaining <= 0) {
      return res.status(200).json({ expired: true, remaining: 0 });
    }

    return res.status(200).json({ expired: false, remaining });
  } catch (err) {
    console.error('trial.js KV error:', err);
    return res.status(500).json({
      success: false,
      message:
        'فشل الاتصال بقاعدة بيانات KV: ' +
        (err && err.message ? err.message : String(err)),
    });
  }
}
