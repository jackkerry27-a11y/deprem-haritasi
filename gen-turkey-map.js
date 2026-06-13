const fs = require('fs');
const raw = fs.readFileSync('tur-geo.json', 'utf8').replace(/^\uFEFF/, '');
const geo = JSON.parse(raw);
const coords = geo.features[0].geometry.coordinates;

function ringToPath(ring, bounds, w, h) {
  const { minLng, maxLng, minLat, maxLat } = bounds;
  const sx = lng => ((lng - minLng) / (maxLng - minLng)) * w;
  const sy = lat => ((maxLat - lat) / (maxLat - minLat)) * h;
  return ring.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(2)},${sy(p[1]).toFixed(2)}`).join(' ') + ' Z';
}

let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
coords.flat(2).forEach(([lng, lat]) => {
  minLng = Math.min(minLng, lng);
  maxLng = Math.max(maxLng, lng);
  minLat = Math.min(minLat, lat);
  maxLat = Math.max(maxLat, lat);
});
const bounds = { minLng, maxLng, minLat, maxLat };

const W = 800, H = 340;
const paths = coords.map(poly => poly.map(ring => ringToPath(ring, bounds, W, H)).join(' ')).join(' ');

const cx = 420, cy = 165;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <style>
    @keyframes mapGlow { 0%,100% { filter: drop-shadow(0 0 8px rgba(227,10,23,0.5)); } 50% { filter: drop-shadow(0 0 24px rgba(227,10,23,0.9)); } }
    @keyframes shine { 0% { transform: translateX(-200px); opacity: 0; } 30% { opacity: 0.4; } 100% { transform: translateX(900px); opacity: 0; } }
    @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    .map-body { animation: mapGlow 3s ease-in-out infinite, floatY 5s ease-in-out infinite; transform-origin: center; }
    .shine-bar { animation: shine 4s ease-in-out infinite; }
    .star-group { transform-origin: ${cx}px ${cy}px; animation: floatY 5s ease-in-out infinite; }
  </style>
  <defs>
    <clipPath id="turkeyClip"><path d="${paths}"/></clipPath>
    <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff1a2e"/>
      <stop offset="100%" stop-color="#b00812"/>
    </linearGradient>
    <linearGradient id="shineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="transparent"/>
      <stop offset="50%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient>
  </defs>
  <g class="map-body">
    <path d="${paths}" fill="url(#redGrad)" stroke="#c4a35a" stroke-width="1.2" stroke-linejoin="round"/>
    <rect class="shine-bar" x="0" y="0" width="120" height="${H}" fill="url(#shineGrad)" clip-path="url(#turkeyClip)"/>
    <g class="star-group" transform="translate(${cx},${cy})">
      <circle cx="-8" cy="0" r="22" fill="none" stroke="#fff" stroke-width="5"/>
      <circle cx="0" cy="0" r="18" fill="url(#redGrad)"/>
      <polygon fill="#fff" points="18,0 28,-6 22,0 28,6"/>
    </g>
  </g>
</svg>`;

fs.writeFileSync('assets/turkey-map.svg', svg);
console.log('Generated accurate turkey-map.svg');
