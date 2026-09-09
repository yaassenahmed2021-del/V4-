import { kv } from '@vercel/kv';

/**
 * إنهاء التجربة المجانية لكل الأجهزة اللي بدأت التجربة قبل كده.
 * الأجهزة الجديدة لسه تقدر تبدأ تجربة عادي.
 *
 * الحماية: يتطلب adminSecret في الـ body يطابق ADMIN_SECRET
 *
 * الاستخدام عبر Postman:
 *   POST /api/expire-trials
 *   Body (JSON):
 *   {
 *     "adminSecret": "القيمة_السرية_اللي_حطيتها_في_ENV"
 *   }
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

  const { adminSecret } = req.body || {};
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({
      success: false,
      message: 'ADMIN_SECRET غير مضبوط في متغيرات البيئة',
    });
  }

  if (!adminSecret || adminSecret !== expectedSecret) {
    return res.status(403).json({
      success: false,
      message: 'مفتاح الإدارة غير صحيح',
    });
  }

  try {
    const keysToExpire = [];

    // نجيب كل مفاتيح التجربة
    for await (const key of kv.scanIterator({ match: 'trial:*', count: 100 })) {
      keysToExpire.push(key);
    }

    let expiredCount = 0;
    const now = Date.now();

    for (const key of keysToExpire) {
      const record = await kv.get(key);
      if (record) {
        // نخلي تاريخ الانتهاء في الماضي → التجربة منتهية
        // ونسيب السجل موجود عشان ما يقدرش يبدأ تجربة جديدة
        await kv.set(key, {
          ...record,
          expiresAt: now - 1000, // منتهية من ثانية
          forcedExpired: true,
          forcedExpiredAt: now,
        });
        expiredCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `تم إنهاء التجربة لـ ${expiredCount} جهاز`,
      expiredCount,
      totalKeysFound: keysToExpire.length,
    });
  } catch (err) {
    console.error('expire-trials.js KV error:', err);
    return res.status(500).json({
      success: false,
      message:
        'فشل الاتصال بقاعدة بيانات KV: ' +
        (err && err.message ? err.message : String(err)),
    });
  }
}