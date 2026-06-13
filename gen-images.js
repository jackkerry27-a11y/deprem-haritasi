const fs = require('fs');

const wiki = JSON.parse(fs.readFileSync('wiki-images.json', 'utf8'));

const OVERRIDES = {
  "Ejder Yalçın": wiki["Kirpi II"],
  "Boran 105": wiki["Panter"],
  "Cirit": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/RoketsanIDEF2015_%288%29.JPG/960px-RoketsanIDEF2015_%288%29.JPG",
  "SOM-J": wiki["Bora"],
  "Korkut": wiki["HİSAR-A"],
  "Kargu-2": wiki["PARS İHA"],
  "NEB": wiki["MAM-L"],
  "T129 ATAK": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/BG12-1001_%2814662033896%29.jpg/960px-BG12-1001_%2814662033896%29.jpg",
  "SOM": wiki["MAM-L"],
  "Gökdoğan": wiki["Bozdoğan"],
  "Şimşek": wiki["Hürkuş"],
  "TF-2000": wiki["İSTİF Sınıfı"],
  "ATMACA": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/TCG_Burgazada_%28F-513%29.jpg/960px-TCG_Burgazada_%28F-513%29.jpg",
  "NETAŞ GEMİ": wiki["İSTİF Sınıfı"],
};

const CATEGORY_IMAGES = {
  "Zırhlı Araç": wiki["Altay"],
  "Topçu": wiki["T-155 Fırtına"],
  "Füze": wiki["Bora"],
  "Hava Savunma": wiki["HİSAR-A"],
  "İHA": wiki["Bayraktar TB2"],
  "Silah": wiki["MPT-76"],
  "Silah Sistemi": wiki["SARP"],
  "Mühimmat": wiki["MAM-L"],
  "Radar": wiki["Serhat"],
  "Elektronik Harp": wiki["Koral"],
  "SİHA": wiki["Bayraktar TB2"],
  "Helikopter": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/BG12-1001_%2814662033896%29.jpg/960px-BG12-1001_%2814662033896%29.jpg",
  "Uçak": wiki["KAAN (TF-X)"],
  "AEW": wiki["Barış Kartalı"],
  "Sensör": wiki["ASELFLIR-500"],
  "Simülasyon": wiki["HAVELSAN ADVENT"],
  "Hedef Uçağı": wiki["Turna"],
  "Modernizasyon": wiki["F-16 ÖZGÜR"],
  "Motor": wiki["Hürjet"],
  "Fırkateyn": wiki["İSTİF Sınıfı"],
  "Korvet": wiki["ADA Sınıfı"],
  "Destroyer": wiki["İSTİF Sınıfı"],
  "Denizaltı": wiki["Reis Sınıfı"],
  "İDA": wiki["ULAQ"],
  "Hücum Botu": wiki["MRTP-33"],
  "LHD": wiki["Türkiye Sınıfı"],
  "Destek Gemisi": wiki["Türkiye Sınıfı"],
  "Tanker": wiki["DİSTİNY"],
  "Sonar": wiki["YAKAMOS"],
  "C4ISR": wiki["İSTİF Sınıfı"],
};

const WEAPON_IMAGES = { ...wiki, ...OVERRIDES };
Object.keys(WEAPON_IMAGES).forEach(k => { if (!WEAPON_IMAGES[k]) delete WEAPON_IMAGES[k]; });

const BRANCH_HERO_IMAGES = {
  kara: wiki["Altay"],
  hava: wiki["Bayraktar TB2"],
  deniz: wiki["Türkiye Sınıfı"],
};

const DEFAULT_IMAGE = wiki["Altay"];

const out = `/* Otomatik oluşturuldu — Wikipedia Commons görselleri */
const WEAPON_IMAGES = ${JSON.stringify(WEAPON_IMAGES, null, 2)};

const CATEGORY_IMAGES = ${JSON.stringify(CATEGORY_IMAGES, null, 2)};

const BRANCH_HERO_IMAGES = ${JSON.stringify(BRANCH_HERO_IMAGES, null, 2)};

const DEFAULT_IMAGE = ${JSON.stringify(DEFAULT_IMAGE)};

function getWeaponImage(weapon) {
  return WEAPON_IMAGES[weapon.name] || CATEGORY_IMAGES[weapon.category] || DEFAULT_IMAGE;
}

WEAPONS_DATA.forEach(w => { w.image = getWeaponImage(w); });
`;

fs.writeFileSync('images.js', out);
console.log('images.js generated with', Object.keys(WEAPON_IMAGES).length, 'weapon images');
