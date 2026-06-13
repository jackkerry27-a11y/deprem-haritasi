/* ══════════════════════════════════════════════════════════
   CANLI DEPREM HARİTASI — Yerel Sunucu + AFAD Proxy
   ──────────────────────────────────────────────────────────
   • Statik dosyaları servis eder (index.html, app.js, styles.css...)
   • /api/afad : AFAD verisini sunucu tarafından çekip CORS başlığı
     ekleyerek tarayıcıya aktarır (AFAD doğrudan CORS desteklemiyor).
   Çalıştırma:  node server.js
   ══════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function httpsGetFollow(url, opts, cb, redirects) {
  redirects = redirects || 0;
  https.get(url, opts, (r) => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 5) {
      r.resume(); // drain
      const next = new URL(r.headers.location, url).toString();
      return httpsGetFollow(next, opts, cb, redirects + 1);
    }
    cb(null, r);
  }).on('error', (e) => cb(e));
}

function proxyAFAD(req, res, search) {
  const qs = new URLSearchParams(search);
  const start = qs.get('start') || '';
  const end = qs.get('end') || '';
  const bbox = 'minlat=35.5&maxlat=42.6&minlon=25.5&maxlon=45.2';
  const url = `https://deprem.afad.gov.tr/apiv2/event/filter?start=${encodeURIComponent(start)}` +
    `&end=${encodeURIComponent(end)}&${bbox}&orderby=timedesc&limit=500`;

  const opts = { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (DepremIzleme)' } };
  httpsGetFollow(url, opts, (err, r) => {
    if (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'AFAD erişilemedi', detail: String(err) }));
    }
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(Buffer.concat(chunks));
    });
  });
}

const server = http.createServer((req, res) => {
  let parsed;
  try { parsed = new URL(req.url, `http://localhost:${PORT}`); }
  catch { res.writeHead(400); return res.end('bad request'); }

  if (parsed.pathname === '/api/afad') return proxyAFAD(req, res, parsed.search.slice(1));

  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 — bulunamadı'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`CANLI DEPREM HARİTASI → http://localhost:${PORT}`));
