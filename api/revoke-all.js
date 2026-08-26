import { kv } from '@vercel/kv';

/**
 * إلغاء تفعيل كل الرخص.
 * ⚠️ يجب حماية هذا الـ endpoint (مثلاً بكلمة سر أو IP allowlist).
 * استدعِه مرة واحدة فقط عند الحاجة.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ status: 'error', message: 'Not Found' });
  }

  // حماية بسيطة — غيّر الـ secret إلى قيمة قوية واحفظها في Environment Variables
  const ADMIN_SECRET = process.env.ADMIN_REVOKE_SECRET || 'CHANGE_ME_STRONG_SECRET';
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ status: 'error', message: 'غير مصرح' });
  }

  try {
    // نجلب كل مفاتيح الرخص
    const licenseKeys = await kv.keys('license:*');

    if (!licenseKeys || licenseKeys.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'لا توجد رخص مفعّلة',
        revokedCount: 0,
      });
    }

    let revokedCount = 0;

    for (const licenseKey of licenseKeys) {
      const record = await kv.get(licenseKey);
      if (record && !record.revoked) {
        await kv.set(licenseKey, {
          ...record,
          revoked: true,
          revokedAt: Date.now(),
        });
        revokedCount++;
      }
    }

    // اختياري: حذف روابط الأجهزة أيضاً (يُفضّل)
    const deviceKeys = await kv.keys('device:*');
    if (deviceKeys && deviceKeys.length > 0) {
      await kv.del(...deviceKeys);
    }

    return res.status(200).json({
      status: 'success',
      message: `تم إلغاء تفعيل ${revokedCount} رخصة`,
      revokedCount,
      totalLicensesFound: licenseKeys.length,
    });
  } catch (err) {
    console.error('revoke-all.js error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'فشل الإلغاء: ' + (err?.message || String(err)),
    });
  }
}