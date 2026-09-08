import { kv } from '@vercel/kv';

/**
 * إعادة تعيين التجربة المجانية للجميع (أو لجهاز واحد).
 *
 * الحماية: يتطلب adminSecret في الـ body يطابق المتغير البيئي ADMIN_SECRET.
 * ضع في Vercel Environment Variables:
 *   ADMIN_SECRET = قيمة سرية قوية (مثلاً سلسلة عشوائية طويلة)
 *
 * الاستخدام عبر Postman:
 *   POST /api/reset-trials
 *   Body (JSON):
 *   {
 *     "adminSecret": "القيمة_السرية_اللي_حطيتها_في_ENV",
 *     "scope": "all"          // أو "one"
 *     // إذا scope = "one":
 *     // "deviceId": "الـ hash بتاع اللوحة الأم"
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

  const { adminSecret, scope = 'all', deviceId } = req.body || {};

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
    if (scope === 'one') {
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          message: 'deviceId مطلوب عندما يكون scope = one',
        });
      }

      const trialKey = `trial:${deviceId}`;
      const deleted = await kv.del(trialKey);

      return res.status(200).json({
        success: true,
        message: deleted
          ? 'تم حذف تجربة هذا الجهاز بنجاح'
          : 'لم تكن هناك تجربة مسجلة لهذا الجهاز',
        deletedCount: deleted ? 1 : 0,
        deviceId,
      });
    }

    // scope === 'all' → حذف كل مفاتيح trial:*
    const keysToDelete = [];

    // scanIterator مدعوم في @vercel/kv (يعتمد على Upstash Redis)
    for await (const key of kv.scanIterator({ match: 'trial:*', count: 100 })) {
      keysToDelete.push(key);
    }

    let deletedCount = 0;
    if (keysToDelete.length > 0) {
      // del يقبل عدة مفاتيح
      deletedCount = await kv.del(...keysToDelete);
    }

    return res.status(200).json({
      success: true,
      message: `تم إعادة تعيين التجربة المجانية لـ ${deletedCount} جهاز/أجهزة`,
      deletedCount,
      keys: keysToDelete, // للتحقق (احذف هذا السطر لاحقاً لو مش عايز تشوف المفاتيح)
    });
  } catch (err) {
    console.error('reset-trials.js KV error:', err);
    return res.status(500).json({
      success: false,
      message:
        'فشل الاتصال بقاعدة بيانات KV: ' +
        (err && err.message ? err.message : String(err)),
    });
  }
}