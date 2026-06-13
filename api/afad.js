/* ══════════════════════════════════════════════════════════
   /api/afad  —  Vercel Serverless Function (AFAD proxy)
   ──────────────────────────────────────────────────────────
   AFAD doğrudan CORS desteklemediğinden, AFAD verisini sunucu
   tarafında çekip tarayıcıya CORS başlığı ile aktarır.
   Vercel /api klasöründeki dosyaları otomatik fonksiyon yapar.
   ══════════════════════════════════════════════════════════ */
module.exports = async (req, res) => {
  const start = (req.query && req.query.start) || '';
  const end = (req.query && req.query.end) || '';
  const bbox = 'minlat=35.5&maxlat=42.6&minlon=25.5&maxlon=45.2';
  const url = `https://deprem.afad.gov.tr/apiv2/event/filter?start=${encodeURIComponent(start)}` +
    `&end=${encodeURIComponent(end)}&${bbox}&orderby=timedesc&limit=500`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (DepremIzleme)' },
    });
    const text = await r.text();
    res.status(200).send(text);
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: 'AFAD erişilemedi', detail: String(e) }));
  }
};
