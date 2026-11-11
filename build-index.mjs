// Kartix – baut die Bild-Datenbank für die Kartenerkennung (läuft automatisch auf GitHub)
// Ergebnis: vindex.json (Kartenliste) + vindex.bin (Bild-Fingerabdrücke, 336 Byte je Karte)
import sharp from 'sharp';
import fs from 'fs';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
require('./vsig.js');
const {vsig, VSIG_LEN} = globalThis;

const API = 'https://api.tcgdex.net/v2', ASSETS = 'https://assets.tcgdex.net/';
const POCKET = /^(A\d|B\d|P-A|P-B)/;           // TCG Pocket = Handyspiel, keine echten Karten
const LANGS = ['en', 'de', 'fr', 'it', 'es', 'pt'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, type = 'json') {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url); if (r.status === 404) return null; if (r.ok) return type === 'json' ? r.json() : Buffer.from(await r.arrayBuffer()); }
    catch (e) {}
    await sleep(800 * (i + 1));
  }
  return null;
}

// 1. alle Karten sammeln (gleiche ID = gleiche Karte in allen Sprachen; Bild bevorzugt Englisch, sonst Deutsch …)
const cards = new Map();
for (const lg of LANGS) {
  const list = await get(`${API}/${lg}/cards`) || [];
  let added = 0;
  for (const c of list) {
    if (!c.image || POCKET.test(c.id)) continue;
    const e = cards.get(c.id);
    if (!e) { cards.set(c.id, {id: c.id, img: c.image.replace(ASSETS, ''), name: c.name, nr: c.localId, langs: [lg]}); added++; }
    else e.langs.push(lg);
  }
  console.log(lg, list.length, 'Karten, neu', added);
}
const all = [...cards.values()];
console.log('gesamt', all.length);

// 2. Bilder laden und Fingerabdruck berechnen (parallel)
const sig = new Int8Array(all.length * VSIG_LEN), ok = new Uint8Array(all.length);
let done = 0, next = 0;
async function worker() {
  while (next < all.length) {
    const i = next++, c = all[i];
    const buf = await get(`${ASSETS}${c.img}/low.webp`, 'bin') || await get(`${ASSETS}${c.img}/low.png`, 'bin');
    if (buf) {
      try {
        const {data, info} = await sharp(buf).removeAlpha().resize(245, 342, {fit: 'fill'}).raw().toBuffer({resolveWithObject: true});
        sig.set(vsig(data, info.width, info.height, info.channels), i * VSIG_LEN); ok[i] = 1;
      } catch (e) {}
    }
    if (++done % 1000 === 0) console.log(done, '/', all.length);
  }
}
await Promise.all(Array.from({length: 24}, worker));

// 3. speichern (nur Karten mit Bild)
const keep = all.map((c, i) => i).filter(i => ok[i]);
const out = new Int8Array(keep.length * VSIG_LEN);
keep.forEach((i, j) => out.set(sig.subarray(i * VSIG_LEN, (i + 1) * VSIG_LEN), j * VSIG_LEN));
fs.writeFileSync('vindex.bin', Buffer.from(out.buffer));
const cardRows = keep.map(i => { const c = all[i]; return [c.id, c.img, c.name, c.nr, c.langs.join(',')]; });
console.log('fertig:', keep.length, 'Karten mit Bild');

// 4. Sets (Name je Sprache, Logo, Erscheinungsdatum, Serie) -> vsets.json
const sets = new Map();
for (const lg of LANGS) for (const st of (await get(`${API}/${lg}/sets`) || [])) {
  if (POCKET.test(st.id)) continue;
  const e = sets.get(st.id) || {id: st.id, names: {}, total: 0, official: 0};
  e.names[lg] = st.name; e.logo = e.logo || st.logo || ''; e.symbol = e.symbol || st.symbol || '';
  e.total = Math.max(e.total, +(st.cardCount?.total) || 0); e.official = Math.max(e.official, +(st.cardCount?.official) || 0);
  sets.set(st.id, e);
}
const setList = [...sets.values()];
let si = 0;
async function setWorker() {
  while (si < setList.length) {
    const e = setList[si++];
    for (const lg of ['en', ...LANGS.filter(l => l !== 'en')]) {
      if (!e.names[lg]) continue;
      const d = await get(`${API}/${lg}/sets/${e.id}`);
      if (d) { e.date = d.releaseDate || ''; e.serie = d.serie?.name || ''; if (!e.logo && d.logo) e.logo = d.logo; break; }
    }
  }
}
await Promise.all(Array.from({length: 12}, setWorker));
// Sets stehen mit in vindex.json (dann muss die Automatik-Datei nicht geändert werden)
fs.writeFileSync('vindex.json', JSON.stringify({v: 1, date: new Date().toISOString().slice(0, 10), n: keep.length, len: VSIG_LEN, cards: cardRows,
  sets: setList.map(e => ({id: e.id, n: e.names, logo: (e.logo || '').replace(ASSETS, ''), date: e.date || '', serie: e.serie || '', total: e.total, official: e.official}))}));
console.log('Sets:', setList.length);
