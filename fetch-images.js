const https = require('https');
const fs = require('fs');

const SEARCH_MAP = {
  "Altay": "Altay main battle tank",
  "Kaplan MT": "Kaplan MT tank",
  "PARS IV 8x8": "FNSS Pars",
  "PARS Scout": "FNSS Pars Scout",
  "Kirpi II": "Kirpi MRAP",
  "Vuran": "BMC Vuran",
  "Ejder Yalçın": "Ejder Yalcin APC",
  "ACV-15": "ACV-15",
  "Tulpar": "Otokar Tulpar",
  "Arma 8x8": "Otokar Arma",
  "ZMA": "ACV-15",
  "MZK": "Kirpi MRAP",
  "TOSUN": "Kirpi MRAP",
  "T-155 Fırtına": "T-155 Fırtına",
  "Boran 105": "105mm howitzer",
  "Panter": "Panter howitzer Turkey",
  "MArG 105": "Mortar 105mm",
  "Alkar": "Guided mortar",
  "Bora": "Bora missile Turkey",
  "Khan": "Roketsan",
  "T-122 ÇNRA": "T-122 Sakarya",
  "T-300 Kasırga": "T-300 Kasırga",
  "Kaplan-10": "OMTAS",
  "OMTAS": "OMTAS",
  "UMTAS": "UMTAS",
  "Cirit": "Cirit rocket",
  "SOM-J": "SOM missile",
  "Bozok": "Roketsan",
  "HİSAR-A": "Hisar missile",
  "HİSAR-O": "Hisar missile",
  "Korkut": "Korkut anti-aircraft gun",
  "SİPER": "Hisar missile",
  "S-400 Entegrasyon": "S-400",
  "PARS İHA": "Loitering munition",
  "Kargu-2": "Kargu drone",
  "Alpagu": "STM Alpagu",
  "Songar": "Asisguard Songar",
  "TOGAN": "Loitering munition drone",
  "MPT-76": "MPT-76",
  "MPT-55": "MPT-55",
  "JNG-90": "M2 Browning",
  "Gürz": "Machine gun",
  "SARP": "Aselsan SARP",
  "STAMP": "Aselsan STAMP",
  "NEB": "Penetrator bomb",
  "Serhat": "Aselsan radar",
  "Koral": "Aselsan Koral",
  "I-DER": "Electronic warfare",
  "Bayraktar TB2": "Bayraktar TB2",
  "Akıncı": "Bayraktar Akıncı",
  "Kızıl Elma": "Bayraktar Kızılelma",
  "Mini Akıncı": "Bayraktar Akıncı",
  "Anka": "TAI Anka",
  "Aksungur": "TAI Aksungur",
  "Anka-3": "TAI Anka-3",
  "T129 ATAK": "TAI T929 Atak",
  "Gökbey": "TAI T625 Gökbey",
  "Hürkuş": "TAI Hürkuş",
  "Hürjet": "TAI Hürjet",
  "KAAN (TF-X)": "TAI Kaan",
  "MMU (HÜRJET)": "TAI Hürjet",
  "SOM": "SOM missile",
  "Gökdoğan": "Gökdoğan missile",
  "Bozdoğan": "Bozdoğan missile",
  "MAM-L": "Roketsan MAM-L",
  "MAM-C": "Roketsan MAM-C",
  "MAM-T": "Roketsan MAM-T",
  "LGK-82": "Laser-guided bomb",
  "HGK-84": "Precision-guided munition",
  "KGK-83": "Precision-guided munition",
  "BOZOK": "Roketsan",
  "EHSİM": "Electronic warfare pod",
  "ASELFLIR-500": "Targeting pod",
  "MURAD": "AESA radar",
  "EİRS": "Radar",
  "Barış Kartalı": "Boeing 737 AEW",
  "HAVELSAN ADVENT": "Command and control",
  "Şimşek": "TAI Şimşek",
  "Turna": "Target drone",
  "F-16 ÖZGÜR": "F-16 Fighting Falcon",
  "TEI TS1400": "Turboshaft engine",
  "TEI TF6000": "Turbofan",
  "DIHA": "VTOL drone",
  "İSTİF Sınıfı": "I-class frigate",
  "ADA Sınıfı": "Ada-class corvette",
  "TF-2000": "TF2000-class destroyer",
  "Preveze Sınıfı": "Preveze-class submarine",
  "Gür Sınıfı": "Gür-class submarine",
  "Reis Sınıfı": "Reis-class submarine",
  "STM500": "STM500 submarine",
  "MİLDEN": "Submarine",
  "ATMACA": "Atmaca missile",
  "Gezgin": "Cruise missile",
  "Zargana": "Torpedo",
  "Orka": "Torpedo",
  "ULAQ": "ULAQ USV",
  "MARLIN": "Unmanned surface vehicle",
  "SİMAV": "Unmanned surface vehicle",
  "Hızır": "Fast attack craft",
  "MRTP-33": "Fast attack craft",
  "MRTP-29": "Fast attack craft",
  "Türkiye Sınıfı": "TCG Anadolu",
  "DİMDEG": "TCG Anadolu",
  "DİSTİNY": "Replenishment oiler",
  "Barbaros Modernizasyon": "Barbaros-class frigate",
  "Gökdeniz": "Close-in weapon system",
  "YAKAMOS": "Sonar",
  "ÇAFRAD": "Radar",
  "NETAŞ GEMİ": "Combat management system",
  "Bayraktar TB3": "Bayraktar TB2",
  "KERİM": "Unmanned surface vehicle",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TSK-Envanter/1.0 (educational)' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function searchImage(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=pageimages&format=json&pithumbsize=800&redirects=1`;
  const data = await fetchJson(url);
  if (!data?.query?.pages) return null;
  for (const p of Object.values(data.query.pages)) {
    if (p.thumbnail?.source) return p.thumbnail.source;
  }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const results = {};
  const names = Object.keys(SEARCH_MAP);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const img = await searchImage(SEARCH_MAP[name]);
    results[name] = img;
    process.stdout.write(`[${i+1}/${names.length}] ${name}: ${img ? 'OK' : 'MISS'}\n`);
    await sleep(1200);
  }
  fs.writeFileSync('fetched-images.json', JSON.stringify(results, null, 2));
  console.log('Done -> fetched-images.json');
})();
