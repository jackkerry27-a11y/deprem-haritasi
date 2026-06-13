const https = require('https');
const fs = require('fs');

const WIKI_TITLES = {
  "Altay": "Altay_(tank)",
  "Kaplan MT": "Kaplan_MT",
  "PARS IV 8x8": "FNSS_Pars",
  "PARS Scout": "FNSS_Pars",
  "Kirpi II": "BMC_Kirpi",
  "Vuran": "BMC_Vuran",
  "Ejder Yalçın": "Ejder_Yalçın",
  "ACV-15": "ACV-15",
  "Tulpar": "Otokar_Tulpar",
  "Arma 8x8": "Otokar_Arma",
  "ZMA": "ACV-15",
  "MZK": "BMC_Kirpi",
  "TOSUN": "BMC_Kirpi",
  "T-155 Fırtına": "T-155_Fırtına",
  "Boran 105": "Boran_(howitzer)",
  "Panter": "Panter_(howitzer)",
  "MArG 105": "Mortar_(weapon)",
  "Alkar": "Mortar_(weapon)",
  "Bora": "Bora_(missile)",
  "Khan": "Roketsan",
  "T-122 ÇNRA": "T-122_Sakarya",
  "T-300 Kasırga": "T-300_Kasırga",
  "Kaplan-10": "OMTAS",
  "OMTAS": "OMTAS",
  "UMTAS": "UMTAS",
  "Cirit": "Cirit",
  "SOM-J": "Stand-off_Missile",
  "Bozok": "Roketsan",
  "HİSAR-A": "Hisar_(missile_family)",
  "HİSAR-O": "Hisar_(missile_family)",
  "Korkut": "Korkut_(anti-aircraft_gun)",
  "SİPER": "Hisar_(missile_family)",
  "S-400 Entegrasyon": "S-400_missile_system",
  "PARS İHA": "Loitering_munition",
  "Kargu-2": "Kargu",
  "Alpagu": "Loitering_munition",
  "Songar": "Drone_warfare",
  "TOGAN": "Loitering_munition",
  "MPT-76": "MPT-76",
  "MPT-55": "MPT-55",
  "JNG-90": "M2_Browning",
  "Gürz": "Machine_gun",
  "SARP": "Remote_weapon_station",
  "STAMP": "Remote_weapon_station",
  "NEB": "Penetration_bomb",
  "Serhat": "Radar",
  "Koral": "Electronic_warfare",
  "I-DER": "Electronic_warfare",
  "Bayraktar TB2": "Bayraktar_TB2",
  "Akıncı": "Bayraktar_Akıncı",
  "Kızıl Elma": "Bayraktar_Kızılelma",
  "Mini Akıncı": "Bayraktar_Akıncı",
  "Anka": "TAI_Anka",
  "Aksungur": "TAI_Aksungur",
  "Anka-3": "TAI_Anka-3",
  "T129 ATAK": "TAI_T929_Atak",
  "Gökbey": "TAI_T625_Gökbey",
  "Hürkuş": "TAI_Hürkuş",
  "Hürjet": "TAI_Hürjet",
  "KAAN (TF-X)": "TAI_Kaan",
  "MMU (HÜRJET)": "TAI_Hürjet",
  "SOM": "Stand-off_Missile",
  "Gökdoğan": "Gökdoğan_(missile)",
  "Bozdoğan": "Bozdoğan_(missile)",
  "MAM-L": "Roketsan",
  "MAM-C": "Roketsan",
  "MAM-T": "Roketsan",
  "LGK-82": "Precision-guided_munition",
  "HGK-84": "Precision-guided_munition",
  "KGK-83": "Precision-guided_munition",
  "BOZOK": "Roketsan",
  "EHSİM": "Electronic_warfare",
  "ASELFLIR-500": "Targeting_pod",
  "MURAD": "Active_electronically_scanned_array",
  "EİRS": "Radar",
  "Barış Kartalı": "Boeing_737_AEW&C",
  "HAVELSAN ADVENT": "Command_and_control",
  "Şimşek": "TAI_Şimşek",
  "Turna": "Target_drone",
  "F-16 ÖZGÜR": "General_Dynamics_F-16_Fighting_Falcon",
  "TEI TS1400": "Turboshaft",
  "TEI TF6000": "Turbofan",
  "DIHA": "Unmanned_aerial_vehicle",
  "İSTİF Sınıfı": "Istanbul-class_frigate",
  "ADA Sınıfı": "Ada-class_corvette",
  "TF-2000": "TF2000-class_destroyer",
  "Preveze Sınıfı": "Preveze-class_submarine",
  "Gür Sınıfı": "Gür-class_submarine",
  "Reis Sınıfı": "Reis-class_submarine",
  "STM500": "Submarine",
  "MİLDEN": "Submarine",
  "ATMACA": "Atmaca_(missile)",
  "Gezgin": "Cruise_missile",
  "Zargana": "Torpedo",
  "Orka": "Torpedo",
  "ULAQ": "Unmanned_surface_vehicle",
  "MARLIN": "Unmanned_surface_vehicle",
  "SİMAV": "Unmanned_surface_vehicle",
  "Hızır": "Patrol_boat",
  "MRTP-33": "Patrol_boat",
  "MRTP-29": "Patrol_boat",
  "Türkiye Sınıfı": "TCG_Anadolu",
  "DİMDEG": "TCG_Anadolu",
  "DİSTİNY": "Replenishment_oiler",
  "Barbaros Modernizasyon": "Barbaros-class_frigate",
  "Gökdeniz": "Close-in_weapon_system",
  "YAKAMOS": "Sonar",
  "ÇAFRAD": "Radar",
  "NETAŞ GEMİ": "Combat_management_system",
  "Bayraktar TB3": "Bayraktar_TB2",
  "KERİM": "Unmanned_surface_vehicle",
};

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'TSK-Envanter/1.0 (educational)' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function upscale(url) {
  if (!url) return null;
  return url.replace(/\/(\d+)px-/, '/960px-');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const results = {};
  const entries = Object.entries(WIKI_TITLES);
  for (let i = 0; i < entries.length; i++) {
    const [name, title] = entries[i];
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const data = await fetchJson(url);
    const img = upscale(data?.thumbnail?.source);
    results[name] = img;
    process.stdout.write(`[${i+1}/${entries.length}] ${name}: ${img ? 'OK' : 'MISS'}\n`);
    await sleep(3500);
  }
  fs.writeFileSync('wiki-images.json', JSON.stringify(results, null, 2));
  console.log('Saved wiki-images.json');
})();
