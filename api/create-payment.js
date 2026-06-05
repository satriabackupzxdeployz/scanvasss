export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount, productName, turnstileToken } = req.body;

  const CF_SECRET = process.env.CF_TURNSTILE_SECRET_KEY;
  const cfVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: CF_SECRET, response: turnstileToken }),
  });
  const cfData = await cfVerify.json();
  if (!cfData.success) {
    return res.status(403).json({ success: false, message: 'Verifikasi Cloudflare gagal.' });
  }

  try {
    const qrisRes = await fetch('https://qris.pw/api/create-payment.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.QRIS_API_KEY,
        'X-API-Secret': process.env.QRIS_API_SECRET,
      },
      body: JSON.stringify({
        amount,
        description: `Terimakasih telah membeli produk ${productName} 🙏`,
      }),
    });
    const qrisData = await qrisRes.json();
    return res.status(200).json({ success: true, data: qrisData });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
