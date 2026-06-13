const https = require('https');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'assets', 'weapons');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const FILE_MAP = {
  "Altay": "Altay Tank.jpg",
  "Kaplan MT": "Kaplan MT.jpg",
  "PARS IV 8x8": "PARS III 6x6.jpg",
  "PARS Scout": "PARS III 6x6.jpg",
  "Kirpi II": "Kirpi MRAP.jpg",
  "Vuran": "Kirpi MRAP.jpg",
  "Ejder Yalçın": "Ejder Yalcin.jpg",
  "ACV-15": "ACV-15 in Iraq.jpg",
  "Tulpar": "Otokar Tulpar.jpg",
  "Arma 8x8": "Otokar Arma 8x8.jpg",
  "ZMA": "ACV-15 in Iraq.jpg",
  "MZK": "Kirpi MRAP.jpg",
  "TOSUN": "Kirpi MRAP.jpg",
  "T-155 Fırtına": "T-155Fırtına (1).jpg",
  "Boran 105": "Panterrr.JPG",
  "Panter": "Panterrr.JPG",
  "Bora": "Wakasad Tinjau Operational Training ITBM Khan di Fasilitas Roketsan, Ankara.jpg",
  "Khan": "RoketsanIDEF2015 (8).JPG",
  "T-122 ÇNRA": "RoketsanIDEF2015 (7).JPG",
  "T-300 Kasırga": "T-300 Kasırga.jpg",
  "OMTAS": "Roketsan display in Kyiv 01.jpg",
  "UMTAS": "Roketsan display in Kyiv 01.jpg",
  "Cirit": "RoketsanIDEF2015 (8).JPG",
  "HİSAR-A": "Hisar-A missile system.jpg",
  "HİSAR-O": "Hisar-A missile system.jpg",
  "Korkut": "Hisar-A missile system.jpg",
  "Kargu-2": "KARGU drone.jpg",
  "MPT-76": "MPT-76.jpg",
  "Bayraktar TB2": "Bayraktar TB2 Ground.jpg",
  "Akıncı": "Baykar Akinci.jpg",
  "Kızıl Elma": "Bayraktar Kızılelma Teknofest 2023.jpg",
  "Anka": "TAI Anka.jpg",
  "Aksungur": "TAI Aksungur.jpg",
  "Anka-3": "TAI Anka-3.jpg",
  "T129 ATAK": "T129 Atak helicopter.jpg",
  "Gökbey": "T625 Gokbey.jpg",
  "Hürkuş": "Hürkuş-P9187710.jpg",
  "Hürjet": "TAI Hürjet Teknofest2019 (1).jpg",
  "KAAN (TF-X)": "KAAN TF-X.jpg",
  "SOM": "SOM missile.jpg",
  "Gökdoğan": "Göktuğ.jpg",
  "MAM-L": "RoketsanIDEF2015 (8).JPG",
  "İSTİF Sınıfı": "TCG Istanbul F511.jpg",
  "ADA Sınıfı": "TCG Burgazada F513.jpg",
  "ATMACA": "Atmaca missile.jpg",
  "ULAQ": "ULAQ USV.jpg",
  "Türkiye Sınıfı": "TCG Anadolu (L-400).jpg",
  "Reis Sınıfı": "Type 214 submarine.jpg",
  "Preveze Sınıfı": "Type 214 submarine.jpg",
  "Gür Sınıfı": "Type 214 submarine.jpg",
  "Bayraktar TB3": "Bayraktar TB2 Runway.jpg",
  "F-16 ÖZGÜR": "F-16 Fighting Falcon 2.jpg",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TSK-Envanter/1.0 (educational; local)' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'TSK-Envanter/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', reject);
  });
}

async function getThumb(fileName) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + fileName)}&prop=imageinfo&iiprop=thumburl&iiurlwidth=800&format=json`;
  const data = await fetchJson(url);
  if (!data?.query?.pages) return null;
  const page = Object.values(data.query.pages)[0];
  return page.imageinfo?.[0]?.thumburl || null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const results = {};
  const entries = Object.entries(FILE_MAP);
  for (let i = 0; i < entries.length; i++) {
    const [name, file] = entries[i];
    const slug = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const dest = path.join(DIR, `${slug}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
      results[name] = `assets/weapons/${slug}.jpg`;
      process.stdout.write(`[${i+1}/${entries.length}] ${name}: cached\n`);
      continue;
    }
    const thumb = await getThumb(file);
    if (thumb) {
      try {
        await download(thumb, dest);
        results[name] = `assets/weapons/${slug}.jpg`;
        process.stdout.write(`[${i+1}/${entries.length}] ${name}: OK\n`);
      } catch (e) {
        results[name] = thumb;
        process.stdout.write(`[${i+1}/${entries.length}] ${name}: remote only\n`);
      }
    } else {
      process.stdout.write(`[${i+1}/${entries.length}] ${name}: MISS\n`);
    }
    await sleep(2500);
  }
  fs.writeFileSync('downloaded-images.json', JSON.stringify(results, null, 2));
  console.log('Done');
})();
