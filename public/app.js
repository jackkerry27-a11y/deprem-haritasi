/* ══════════════════════════════════════════════════════════
   CANLI DEPREM HARİTASI // Türkiye
   Kaynaklar: AFAD (yerel proxy) · EMSC · USGS  — gerçek zamanlı
   Özellikler: çoklu kaynak, otomatik yenileme, büyüklüğe göre
   ses + ekran sarsıntısı + bildirim/toast uyarısı.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const BBOX = { minlat: 35.5, maxlat: 42.6, minlon: 25.5, maxlon: 45.2 };
  const REFRESH_MS = 60000;
  const WINDOW_DAYS = 14;
  const AFAD_WINDOW_DAYS = 4;   // AFAD limit=500 olduğundan dar pencere (en yeni kayıtlar dahil olsun)
  const windowDaysFor = (s) => (s === 'afad' ? AFAD_WINDOW_DAYS : WINDOW_DAYS);
  const QUAKE_INTRO_MS = 10000;  // giriş deprem sahnesi süresi
  const TOAST_MIN = 2.5;    // bu büyüklüğün üstündeki YENİ depremlerde ses + toast
  const NOTIFY_MIN = 3.5;   // bu büyüklüğün üstünde masaüstü bildirim
  const ALERT_FRESH_MS = 45 * 60 * 1000; // sadece son 45 dk içindeki yeni depremler uyarı verir

  const $ = (id) => document.getElementById(id);
  const els = {
    landing: $('landing'), enterBtn: $('enterBtn'),
    quakeLive: $('quakeLive'), qlCount: $('qlCount'),
    landingWave: $('landingWave'), statusWave: $('statusWave'),
    hudClock: $('hudClock'), hudSource: $('hudSource'),
    headerStats: $('headerStats'),
    sourceToggle: $('sourceToggle'), soundBtn: $('soundBtn'),
    refreshBtn: $('refreshBtn'), infoBtn: $('infoBtn'),
    infoModal: $('infoModal'), infoClose: $('infoClose'),
    statusText: $('statusText'), livePip: $('livePip'), lastUpdate: $('lastUpdate'),
    eqList: $('eqList'), eqCount: $('eqCount'), magFilters: $('magFilters'),
    eqDetail: $('eqDetail'), eqDetailBody: $('eqDetailBody'), eqDetailClose: $('eqDetailClose'),
    toastWrap: $('toastWrap'), quakeRoot: $('quakeRoot'),
  };

  let map, markerLayer, markers = {};
  let quakes = [], minMag = 0, selectedId = null;
  let currentSource = 'afad', firstLoad = true;
  const knownIds = new Set();
  let soundOn = true;

  /* ─────────── WEB AUDIO: DEPREM SESİ ─────────── */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function playQuakeSound(intensity, duration) {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    intensity = Math.max(0.15, Math.min(1, intensity));
    duration = duration || (1.2 + intensity * 1.6);
    const now = ctx.currentTime;

    // Kahverengi gürültü (rumble)
    const size = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < size; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(90 + intensity * 160, now);
    lp.frequency.exponentialRampToValueAtTime(55, now + duration);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.25 + intensity * 0.5, now + 0.12);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(lp).connect(ng).connect(ctx.destination);

    // Sub-bass sine
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(46, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + duration);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.2 + intensity * 0.3, now + 0.1);
    og.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(og).connect(ctx.destination);

    noise.start(now); noise.stop(now + duration);
    osc.start(now); osc.stop(now + duration);
  }

  /* ─────────── UZUN / GERÇEKÇİ DEPREM SESİ (giriş) ─────────── */
  function makeBrownNoise(ctx, duration, rough) {
    const size = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    const k = rough || 0.02;
    for (let i = 0; i < size; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + k * w) / (1 + k);
      d[i] = last * 3.5;
    }
    return buf;
  }
  function heartThump(ctx, t, dest, peak, freq, dur) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function scheduleHeartbeat(ctx, t, dest) {
    heartThump(ctx, t, dest, 0.95, 60, 0.16);        // lub
    heartThump(ctx, t + 0.17, dest, 0.62, 50, 0.18); // dub
  }

  function playQuakeSequence(duration) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const end = now + duration;

    const master = ctx.createGain();
    master.gain.value = 1.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-22, now);
    comp.knee.setValueAtTime(28, now);
    comp.ratio.setValueAtTime(12, now);
    comp.attack.setValueAtTime(0.004, now);
    comp.release.setValueAtTime(0.28, now);
    master.connect(comp).connect(ctx.destination);

    // 1) Ana yer gürültüsü (brown noise + alçak geçiren)
    const noise = ctx.createBufferSource();
    noise.buffer = makeBrownNoise(ctx, duration, 0.02);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(70, now);
    lp.frequency.linearRampToValueAtTime(340, now + 3);
    lp.frequency.linearRampToValueAtTime(160, end);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.28, now + 1.3);   // P dalgası
    ng.gain.exponentialRampToValueAtTime(0.95, now + 3.2);   // S dalgası tepe
    ng.gain.setValueAtTime(0.95, now + duration * 0.7);
    ng.gain.exponentialRampToValueAtTime(0.0001, end);
    noise.connect(lp).connect(ng).connect(master);
    noise.start(now); noise.stop(end);

    // 2) Sub-bass + hafif titreşim (LFO)
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(32, now);
    osc.frequency.linearRampToValueAtTime(40, now + 3);
    osc.frequency.linearRampToValueAtTime(28, end);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 9;
    lfo.connect(lfoGain).connect(osc.frequency);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.55, now + 3);
    og.gain.setValueAtTime(0.55, now + duration * 0.7);
    og.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(og).connect(master);
    osc.start(now); lfo.start(now); osc.stop(end); lfo.stop(end);

    // 3) Sarsıntı darbeleri (rastgele patlamalar)
    const strongStart = now + 1.8, strongEnd = now + duration * 0.82;
    for (let i = 0; i < 12; i++) {
      const t = strongStart + Math.random() * (strongEnd - strongStart);
      const js = ctx.createBufferSource();
      js.buffer = makeBrownNoise(ctx, 0.32, 0.05);
      const jlp = ctx.createBiquadFilter(); jlp.type = 'lowpass'; jlp.frequency.value = 220;
      const jg = ctx.createGain();
      jg.gain.setValueAtTime(0.0001, t);
      jg.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
      jg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      js.connect(jlp).connect(jg).connect(master);
      js.start(t); js.stop(t + 0.34);
    }

    // 4) Enkaz / takırtı (bandpass yüksek frekans) — gerçekçilik
    const rattle = ctx.createBufferSource();
    rattle.buffer = makeBrownNoise(ctx, duration, 0.6);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1400; bp.Q.value = 0.8;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, now);
    rg.gain.exponentialRampToValueAtTime(0.12, now + 3);
    rg.gain.setValueAtTime(0.12, now + duration * 0.7);
    rg.gain.exponentialRampToValueAtTime(0.0001, end);
    rattle.connect(bp).connect(rg).connect(master);
    rattle.start(now); rattle.stop(end);

    // 5) Korkmuş kalp atışı — sona doğru başlar, gürültü azalırken belirginleşir ve hızlanır
    const heartStart = now + Math.max(0, duration - 4.2);
    const hb = ctx.createGain();
    hb.gain.setValueAtTime(0.0001, heartStart);
    hb.gain.linearRampToValueAtTime(0.85, now + duration - 1.4);
    hb.gain.linearRampToValueAtTime(1.0, end);
    hb.connect(master);
    let bt = heartStart, interval = 0.66;
    while (bt < end - 0.05) {
      scheduleHeartbeat(ctx, bt, hb);
      interval = Math.max(0.40, interval - 0.025); // giderek hızlanan (panik) nabız
      bt += interval;
    }
  }

  /* ─────────── SÜREKLİ SARSINTI (giriş boyunca) ─────────── */
  function quakeShakeSustained(durationMs) {
    const root = els.quakeRoot;
    root.style.setProperty('--amp', '4px');
    root.classList.add('shaking-sustained');
    const start = performance.now();
    (function frame(now) {
      const t = (now - start) / durationMs;
      if (t >= 1) { root.classList.remove('shaking-sustained'); root.style.removeProperty('--amp'); return; }
      let env;
      if (t < 0.13) env = (t / 0.13) * 0.45;
      else if (t < 0.72) env = 0.55 + 0.45 * Math.abs(Math.sin(t * 26));
      else env = Math.max(0, (1 - (t - 0.72) / 0.28));
      const amp = 2 + env * 15;
      root.style.setProperty('--amp', amp.toFixed(1) + 'px');
      requestAnimationFrame(frame);
    })(start);
  }

  /* ─────────── EKRAN SARSINTISI (kısa, uyarı) ─────────── */
  function shakeScreen(intensity, ms) {
    intensity = Math.max(0.2, Math.min(1, intensity));
    ms = ms || 600;
    const root = els.quakeRoot;
    root.style.setProperty('--amp', (3 + intensity * 9).toFixed(1) + 'px');
    root.classList.remove('shaking');
    void root.offsetWidth;
    root.style.animationDuration = (ms / 1000).toFixed(2) + 's';
    root.classList.add('shaking');
    setTimeout(() => root.classList.remove('shaking'), ms);
  }

  /* ─────────── SEISMOGRAF DALGASI ─────────── */
  function buildWave(svg, w, h, seamless) {
    if (!svg) return;
    const mid = h / 2, step = 10, base = [];
    for (let x = 0; x <= w / (seamless ? 2 : 1); x += step) {
      const big = Math.random() < 0.08;
      const amp = big ? (h * 0.42) : (h * 0.12);
      const y = mid + (Math.random() - 0.5) * 2 * amp;
      base.push([x, +y.toFixed(1)]);
    }
    let pts = base.slice();
    if (seamless) {
      const off = w / 2;
      base.forEach(([x, y]) => pts.push([x + off, y]));
    }
    svg.querySelector('polyline').setAttribute('points', pts.map(p => p.join(',')).join(' '));
  }

  /* ─────────── CLOCK ─────────── */
  function tickClock() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    els.hudClock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tickClock(); setInterval(tickClock, 1000);

  /* ─────────── HELPERS ─────────── */
  function magColor(m) {
    if (m >= 5) return '#ef4444';
    if (m >= 4) return '#f97316';
    if (m >= 3) return '#f5a524';
    if (m >= 2) return '#a3e635';
    return '#39d98a';
  }
  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return `${s} sn önce`;
    const m = Math.floor(s / 60); if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} sa önce`;
    return `${Math.floor(h / 24)} gün önce`;
  }
  function fmtClock(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(date.getHours())}:${p(date.getMinutes())} · ${p(date.getDate())}.${p(date.getMonth() + 1)}`;
  }
  const isRecent = (date) => (Date.now() - date.getTime()) < 3600 * 1000;
  function utcStamp(offsetMs) {
    const d = new Date(Date.now() + (offsetMs || 0));
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }

  /* ─────────── KAYNAKLAR ─────────── */
  async function fetchAFAD() {
    const start = utcStamp(-AFAD_WINDOW_DAYS * 86400000);
    const end = utcStamp(0);
    const res = await fetch(`/api/afad?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (!res.ok) throw new Error('AFAD ' + res.status);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('AFAD format');
    return arr.map(e => {
      let place = (e.location || '').split('] ').pop().trim() || 'Bilinmeyen bölge';
      return {
        id: 'afad-' + e.eventID, mag: +e.magnitude, magType: e.type || 'ML',
        place, time: new Date((e.date || '').replace(' ', 'T') + 'Z'),
        lat: +e.latitude, lon: +e.longitude, depth: +e.depth || 0, source: 'AFAD',
      };
    });
  }
  async function fetchEMSC() {
    const start = utcStamp(-WINDOW_DAYS * 86400000).slice(0, 10);
    const url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=500&orderby=time` +
      `&start=${start}&minlat=${BBOX.minlat}&maxlat=${BBOX.maxlat}&minlon=${BBOX.minlon}&maxlon=${BBOX.maxlon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('EMSC ' + res.status);
    const data = await res.json();
    return (data.features || []).map(f => {
      const p = f.properties || {};
      let lat = p.lat, lon = p.lon, depth = p.depth;
      if ((lat == null || lon == null) && f.geometry) { [lon, lat, depth] = f.geometry.coordinates; }
      return {
        id: 'emsc-' + (f.id || p.unid || `${p.time}`), mag: +p.mag, magType: p.magtype || 'M',
        place: (p.flynn_region || p.region || 'Bilinmeyen bölge').replace(/^\d+\s*km\s*/i, '').trim(),
        time: new Date(p.time), lat: +lat, lon: +lon, depth: Math.abs(+depth || 0), source: 'EMSC',
      };
    });
  }
  async function fetchUSGS() {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson');
    if (!res.ok) throw new Error('USGS ' + res.status);
    const data = await res.json();
    return (data.features || []).map(f => {
      const [lon, lat, depth] = f.geometry.coordinates;
      return {
        id: 'usgs-' + f.id, mag: +f.properties.mag, magType: f.properties.magType || 'M',
        place: (f.properties.place || '').replace(/^\d+\s*km\s*/i, '').trim() || 'Bilinmeyen bölge',
        time: new Date(f.properties.time), lat, lon, depth: Math.abs(depth || 0), source: 'USGS',
      };
    }).filter(q => q.lat >= BBOX.minlat && q.lat <= BBOX.maxlat && q.lon >= BBOX.minlon && q.lon <= BBOX.maxlon);
  }
  const FETCHERS = { afad: fetchAFAD, emsc: fetchEMSC, usgs: fetchUSGS };

  async function loadData() {
    setStatus('loading');
    let data;
    try {
      data = await FETCHERS[currentSource]();
    } catch (e) {
      // birincil başarısızsa sırayla dene
      const order = ['afad', 'emsc', 'usgs'].filter(s => s !== currentSource);
      for (const s of order) {
        try { data = await FETCHERS[s](); currentSource = s; syncSourceUI(); break; } catch (_) {}
      }
      if (!data) { setStatus('error'); return; }
    }
    quakes = data.filter(q => !isNaN(q.mag) && q.lat && q.lon && !isNaN(q.time))
                 .sort((a, b) => b.time - a.time);
    els.hudSource.textContent = currentSource.toUpperCase();

    // Yeni deprem tespiti → uyarı
    const fresh = quakes.filter(q => !knownIds.has(q.id));
    quakes.forEach(q => knownIds.add(q.id));
    if (!firstLoad) {
      const alerts = fresh
        .filter(q => q.mag >= TOAST_MIN && (Date.now() - q.time.getTime()) < ALERT_FRESH_MS)
        .sort((a, b) => b.mag - a.mag)
        .slice(0, 3);
      alerts.forEach(alertQuake);
    }
    firstLoad = false;

    render();
    setStatus('ok');
  }

  function setStatus(state) {
    const p = (n) => String(n).padStart(2, '0');
    const now = new Date();
    if (state === 'loading') {
      els.statusText.innerHTML = 'Sismik veri akışı güncelleniyor…';
      els.livePip.style.background = 'var(--amber)';
    } else if (state === 'error') {
      els.statusText.innerHTML = '<strong>Veri kaynağına ulaşılamadı.</strong> Bağlantıyı kontrol edip tekrar deneyin.';
      els.livePip.style.background = 'var(--red)';
    } else {
      const last = quakes[0];
      els.statusText.innerHTML = `Son <strong>${windowDaysFor(currentSource)} gün</strong> · <strong>${quakes.length}</strong> deprem · kaynak <strong>${currentSource.toUpperCase()}</strong>` +
        (last ? ` · en son: <strong>${timeAgo(last.time)}</strong>` : '');
      els.livePip.style.background = 'var(--green)';
      els.lastUpdate.textContent = `GÜNCELLEME ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    }
  }

  /* ─────────── UYARI (toast + ses + sarsıntı + bildirim) ─────────── */
  function alertQuake(q) {
    const intensity = Math.max(0.2, Math.min(1, (q.mag - 1.5) / 4.5));
    playQuakeSound(intensity);
    shakeScreen(intensity, 500 + intensity * 700);
    showToast(q);
    if (q.mag >= NOTIFY_MIN && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`Deprem · M ${q.mag.toFixed(1)}`, {
          body: `${q.place}\n${fmtClock(q.time)} · ${q.depth.toFixed(0)} km derinlik`,
        });
      } catch (_) {}
    }
  }
  function showToast(q) {
    const color = magColor(q.mag);
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--tc', color);
    el.innerHTML = `
      <span class="toast-mag">${q.mag.toFixed(1)}</span>
      <div class="toast-body">
        <strong>YENİ DEPREM</strong>
        <h5>${q.place}</h5>
        <span>${fmtClock(q.time)} · ${q.depth.toFixed(0)} km · ${q.source}</span>
      </div>`;
    el.addEventListener('click', () => { selectQuake(q.id, true); dismiss(); });
    function dismiss() { el.classList.add('out'); setTimeout(() => el.remove(), 400); }
    els.toastWrap.appendChild(el);
    setTimeout(dismiss, 8000);
  }

  /* ─────────── STATS ─────────── */
  function renderStats() {
    const dayAgo = Date.now() - 86400000;
    const last24 = quakes.filter(q => q.time.getTime() >= dayAgo).length;
    const biggest = quakes.reduce((mx, q) => (q.mag > mx ? q.mag : mx), 0);
    const last = quakes[0];
    const days = windowDaysFor(currentSource);
    els.headerStats.innerHTML = `
      <div class="metric"><span class="m-dot" style="background:var(--amber)"></span><div class="m-body"><b>${last24}</b><small>SON 24 SAAT</small></div></div>
      <div class="metric"><span class="m-dot" style="background:var(--red)"></span><div class="m-body"><b style="color:var(--red)">${biggest ? biggest.toFixed(1) : '—'}</b><small>EN BÜYÜK · ${days}G</small></div></div>
      <div class="metric"><span class="m-dot" style="background:var(--green)"></span><div class="m-body"><b style="color:var(--green)">${last ? timeAgo(last.time).replace(' önce', '') : '—'}</b><small>SON DEPREM</small></div></div>`;
  }

  /* ─────────── MAP ─────────── */
  function initMap() {
    map = L.map('eqMap', { center: [39.0, 35.2], zoom: 6, minZoom: 4, maxZoom: 12, zoomControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: 'Harita © OpenStreetMap, CARTO · Deprem © AFAD/EMSC/USGS',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  function renderMarkers(list) {
    markerLayer.clearLayers(); markers = {};
    list.forEach(q => {
      const size = Math.max(14, 10 + q.mag * 5);
      const color = magColor(q.mag);
      const recent = isRecent(q.time);
      const icon = L.divIcon({
        className: '',
        html: `<div class="eq-marker ${recent ? 'pulse' : ''} ${q.id === selectedId ? 'selected' : ''}" data-id="${q.id}" style="--mk:${color};width:${size}px;height:${size}px">
                 <span class="ring"></span><span class="dot"></span><b>${q.mag.toFixed(1)}</b></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const mk = L.marker([q.lat, q.lon], { icon, zIndexOffset: Math.round(q.mag * 100) }).addTo(markerLayer);
      mk.bindPopup(`
        <div class="lp-title">M ${q.mag.toFixed(1)} — ${q.place}</div>
        <div class="lp-sub">${fmtClock(q.time)} · ${q.depth.toFixed(0)} km · ${q.source}</div>
        <div class="lp-btn" data-open="${q.id}">DETAY →</div>`);
      mk.on('click', () => selectQuake(q.id, false));
      mk.on('popupopen', (e) => {
        const b = e.popup.getElement().querySelector('[data-open]');
        if (b) b.addEventListener('click', () => selectQuake(q.id, false));
      });
      markers[q.id] = mk;
    });
  }

  /* ─────────── LIST ─────────── */
  const getFiltered = () => quakes.filter(q => q.mag >= minMag);
  function renderList(list) {
    els.eqCount.textContent = list.length;
    if (!list.length) { els.eqList.innerHTML = '<div class="eq-loading mono">KAYIT YOK</div>'; return; }
    els.eqList.innerHTML = list.map(q => {
      const color = magColor(q.mag);
      return `
        <div class="op-item ${q.id === selectedId ? 'active' : ''}" data-id="${q.id}" style="--st-color:${color}">
          <div class="eq-row">
            <span class="mag-badge" style="--mk:${color}">${q.mag.toFixed(1)}</span>
            <div class="eq-info">
              <h4>${q.place}</h4>
              <div class="eq-sub">${q.depth.toFixed(0)} km · ${fmtClock(q.time)}</div>
            </div>
            <span class="eq-ago ${isRecent(q.time) ? 'fresh' : ''}">${timeAgo(q.time)}</span>
          </div>
        </div>`;
    }).join('');
    els.eqList.querySelectorAll('.op-item').forEach(item =>
      item.addEventListener('click', () => selectQuake(item.dataset.id, true)));
  }

  function render() { const list = getFiltered(); renderStats(); renderMarkers(list); renderList(list); }

  /* ─────────── SELECT ─────────── */
  function selectQuake(id, fly) {
    const q = quakes.find(x => String(x.id) === String(id));
    if (!q) return;
    selectedId = id;
    document.querySelectorAll('.op-item').forEach(i => i.classList.toggle('active', i.dataset.id === String(id)));
    document.querySelectorAll('.eq-marker').forEach(m => m.classList.toggle('selected', m.dataset.id === String(id)));
    const color = magColor(q.mag);
    els.eqDetailBody.innerHTML = `
      <div class="od-code">KAYIT // ${q.source} · ${q.magType}</div>
      <span class="od-status" style="--st-color:${color}">M ${q.mag.toFixed(1)}</span>
      <h3>${q.place}</h3>
      <div class="od-region">${fmtClock(q.time)} · ${timeAgo(q.time)}</div>
      <div class="od-meta">
        <div><div class="k">BÜYÜKLÜK</div><div class="v" style="color:${color}">M ${q.mag.toFixed(1)}</div></div>
        <div><div class="k">DERİNLİK</div><div class="v">${q.depth.toFixed(1)} km</div></div>
        <div><div class="k">ENLEM</div><div class="v">${q.lat.toFixed(3)}°</div></div>
        <div><div class="k">BOYLAM</div><div class="v">${q.lon.toFixed(3)}°</div></div>
      </div>
      <div class="od-block"><div class="od-block-head">ZAMAN (YEREL)</div><p>${q.time.toLocaleString('tr-TR')}</p></div>
      <div class="od-block"><div class="od-block-head">KAYNAK</div>
        <div class="od-units"><span class="od-unit">${q.source}</span><span class="od-unit">Tip: ${q.magType}</span></div>
      </div>
      <div class="od-coord">KOORD // ${q.lat.toFixed(3)}°K ${q.lon.toFixed(3)}°D</div>
      <a class="od-link" href="https://www.google.com/maps/search/?api=1&query=${q.lat},${q.lon}" target="_blank" rel="noopener">HARİTADA AÇ →</a>`;
    els.eqDetail.classList.add('open');
    if (fly && map) map.flyTo([q.lat, q.lon], 9, { duration: 0.9 });
    const mk = markers[id]; if (mk) mk.openPopup();
  }
  els.eqDetailClose.addEventListener('click', () => {
    els.eqDetail.classList.remove('open'); selectedId = null;
    document.querySelectorAll('.op-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.eq-marker').forEach(m => m.classList.remove('selected'));
  });

  /* ─────────── FILTERS ─────────── */
  els.magFilters.querySelectorAll('.op-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      minMag = +btn.dataset.min;
      els.magFilters.querySelectorAll('.op-filter').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });

  /* ─────────── SOURCE TOGGLE ─────────── */
  function syncSourceUI() {
    els.sourceToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.src === currentSource));
  }
  els.sourceToggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.src === currentSource) return;
      currentSource = btn.dataset.src;
      syncSourceUI();
      firstLoad = true;          // kaynak değişiminde eski kayıtlar için uyarı verme
      knownIds.clear();
      loadData();
    });
  });

  /* ─────────── SOUND TOGGLE ─────────── */
  const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
  const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
  els.soundBtn.innerHTML = ICON_SOUND_ON;
  els.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    els.soundBtn.innerHTML = soundOn ? ICON_SOUND_ON : ICON_SOUND_OFF;
    els.soundBtn.classList.toggle('muted', !soundOn);
    if (soundOn) { ensureAudio(); playQuakeSound(0.4, 0.5); }
  });

  /* ─────────── REFRESH ─────────── */
  els.refreshBtn.addEventListener('click', () => {
    els.refreshBtn.classList.add('spinning');
    loadData().finally(() => setTimeout(() => els.refreshBtn.classList.remove('spinning'), 600));
  });
  setInterval(loadData, REFRESH_MS);

  /* ─────────── INFO MODAL ─────────── */
  const openInfo = () => els.infoModal.classList.add('open');
  const closeInfo = () => els.infoModal.classList.remove('open');
  els.infoBtn.addEventListener('click', openInfo);
  els.infoClose.addEventListener('click', closeInfo);
  els.infoModal.querySelector('.modal-backdrop').addEventListener('click', closeInfo);
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeInfo(); els.eqDetail.classList.remove('open'); } });

  /* ─────────── GİRİŞ (10sn deprem sahnesi) ─────────── */
  let entering = false;
  els.enterBtn.addEventListener('click', () => {
    if (entering) return;
    entering = true;
    ensureAudio();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    // UI: buton → "ŞU ANDA DEPREM OLUYOR"
    els.enterBtn.style.display = 'none';
    const note = document.querySelector('.enter-note');
    if (note) note.style.display = 'none';
    els.quakeLive.hidden = false;
    els.landing.classList.add('quaking');

    // 10 saniye gürültülü ses + sürekli sarsıntı
    playQuakeSequence(QUAKE_INTRO_MS / 1000);
    quakeShakeSustained(QUAKE_INTRO_MS);

    // geri sayım
    let remain = Math.round(QUAKE_INTRO_MS / 1000);
    els.qlCount.textContent = remain;
    const ci = setInterval(() => { remain = Math.max(0, remain - 1); els.qlCount.textContent = remain; }, 1000);

    // ses bitince sisteme gir
    setTimeout(() => {
      clearInterval(ci);
      els.landing.classList.add('gone');
      if (map) setTimeout(() => map.invalidateSize(), 400);
    }, QUAKE_INTRO_MS);
  });

  /* ─────────── INIT ─────────── */
  buildWave(els.landingWave, 2400, 160, true);
  buildWave(els.statusWave, 1200, 40, true);
  initMap();
  loadData();
})();
