/* ══════════════════════════════════════════════════════════
   /api/afad  —  Vercel Serverless Function (AFAD proxy)
   ──────────────────────────────────────────────────────────
   AFAD doğrudan CORS desteklemediğinden, AFAD verisini sunucu
   tarafında çekip tarayıcıya CORS başlığı ile aktarır.
   Node `https` modülü kullanır (global fetch'e bağımlı değil)
   ve 30x yönlendirmelerini takip eder.
   ══════════════════════════════════════════════════════════ */
'use strict';
const https = require('https');

function httpsGetFollow(url, opts, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, opts, (r) => {
        if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 5) {
          r.resume();
          const next = new URL(r.headers.location, url).toString();
          return resolve(httpsGetFollow(next, opts, redirects + 1));
        }
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      })
      .on('error', reject);
  });
}

module.exports = async (req, res) => {
  const q = (req.query && req.query) || {};
  const start = q.start || '';
  const end = q.end || '';
  const bbox = 'minlat=35.5&maxlat=42.6&minlon=25.5&maxlon=45.2';
  const url =
    `https://deprem.afad.gov.tr/apiv2/event/filter?start=${encodeURIComponent(start)}` +
    `&end=${encodeURIComponent(end)}&${bbox}&orderby=timedesc&limit=500`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const opts = { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (DepremIzleme)' } };
    const text = await httpsGetFollow(url, opts);
    res.status(200).send(text);
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: 'AFAD erişilemedi', detail: String(e) }));
  }
};
