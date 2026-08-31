import { kv } from '@vercel/kv';

/**
 * مفاتيح التفعيل المسموح بها فقط.
 * ⚠️ غيّر هذه القائمة عند إصدار مفاتيح جديدة للعملاء.
 * لا تُشارك هذا الملف علناً إن أمكن — أو استخدم KV/ENV لتخزين المفاتيح لاحقاً.
 *
 * المفاتيح الحالية (أغسطس 2026):
 *   1) TFS-HR4-A7K9M2X4Q8W1
 *   2) TFS-HR4-P3N6R8Y2L5Z0
 */
const VALID_KEYS = ["7K2M-9P4W-5R"];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ status: 'error', message: 'Not Found' });
  }

  const { key, deviceId } = req.body || {};

  if (!key || !deviceId) {
    return res.status(400).json({
      status: 'error',
      message: 'بيانات ناقصة (المفتاح أو معرّف اللوحة الأم)',
    });
  }

  const normalizedKey = String(key).trim();

  if (!VALID_KEYS.includes(normalizedKey)) {
    return res.status(401).json({ status: 'error', message: 'المفتاح غير صحيح' });
  }

  const licenseRecordKey = `license:${normalizedKey}`;

  try {
    const existing = await kv.get(licenseRecordKey);

    // المفتاح مربوط بالفعل بلوحة أم / جهاز آخر
    if (existing && existing.deviceId && existing.deviceId !== deviceId) {
      return res.status(403).json({
        status: 'error',
        message: 'تم استخدام هذا المفتاح على جهاز آخر من قبل',
      });
    }

    if (existing && existing.revoked) {
      return res.status(403).json({
        status: 'error',
        message: 'تم إلغاء تفعيل هذا المفتاح',
      });
    }

    const record = {
      key: normalizedKey,
      deviceId, // hash لمعرّف اللوحة الأم من تطبيق سطح المكتب
      activatedAt: existing?.activatedAt || Date.now(),
      revoked: false,
      idType: 'motherboard',
    };

    await kv.set(licenseRecordKey, record);
    await kv.set(`device:${deviceId}`, normalizedKey);

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('verify.js KV error:', err);
    return res.status(500).json({
      status: 'error',
      message:
        'فشل الاتصال بقاعدة بيانات KV: ' +
        (err && err.message ? err.message : String(err)),
    });
  }
}
