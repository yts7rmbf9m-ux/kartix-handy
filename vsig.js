// Kartix – Bild-Fingerabdruck einer Karte (gleicher Code im Handy und beim Erstellen der Datenbank)
// p = RGBA- oder RGB-Pixel des ganzen Kartenbilds (Breite w, Höhe h, ch = 4 oder 3 Kanäle)
// Ergebnis: 336 Werte (Int8) = Artwork 16×12 Graustufen + Artwork 8×6 Farbe, je normalisiert
(function (root) {
  const ART = [.1, .11, .8, .4];
  function boxAvg(p, w, h, ch, gw, gh, gray) {
    const x0 = Math.round(w * ART[0]), y0 = Math.round(h * ART[1]), aw = Math.round(w * ART[2]), ah = Math.round(h * ART[3]);
    const n = gray ? 1 : 3, out = new Float32Array(gw * gh * n), cnt = new Float32Array(gw * gh);
    for (let y = 0; y < ah; y++) {
      const gy = Math.min(gh - 1, Math.floor(y * gh / ah));
      for (let x = 0; x < aw; x++) {
        const gx = Math.min(gw - 1, Math.floor(x * gw / aw)), i = ((y0 + y) * w + (x0 + x)) * ch, k = gy * gw + gx;
        if (gray) out[k] += p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11;
        else { out[k * 3] += p[i]; out[k * 3 + 1] += p[i + 1]; out[k * 3 + 2] += p[i + 2]; }
        cnt[k]++;
      }
    }
    for (let k = 0; k < gw * gh; k++) for (let c = 0; c < n; c++) out[k * n + c] /= cnt[k] || 1;
    return out;
  }
  function znorm(v, stride, off, dst, at) {   // je Kanal: Mittelwert 0, Streuung 1 -> unabhängig von Licht/Weißabgleich
    let m = 0, s = 0, n = 0;
    for (let i = off; i < v.length; i += stride) { m += v[i]; n++; }
    m /= n; for (let i = off; i < v.length; i += stride) s += (v[i] - m) ** 2;
    s = Math.sqrt(s / n) || 1;
    let j = at; for (let i = off; i < v.length; i += stride) dst[j++] = Math.max(-127, Math.min(127, Math.round((v[i] - m) / s * 40)));
    return j;
  }
  function vsig(p, w, h, ch) {
    const out = new Int8Array(336);
    const g = boxAvg(p, w, h, ch, 16, 12, true), c = boxAvg(p, w, h, ch, 8, 6, false);
    znorm(g, 1, 0, out, 0);
    let j = 192; for (let k = 0; k < 3; k++) { const t = new Int8Array(48); znorm(c, 3, k, t, 0); out.set(t, j); j += 48; }
    return out;
  }
  // Ähnlichkeit -1..1 (Graustufen-Struktur und Farbe je zur Hälfte)
  function vsim(a, ao, b, bo) {
    let s1 = 0, s2 = 0;
    for (let i = 0; i < 192; i++) s1 += a[ao + i] * b[bo + i];
    for (let i = 192; i < 336; i++) s2 += a[ao + i] * b[bo + i];
    return (s1 / 192 + s2 / 144) / 3200;
  }
  root.vsig = vsig; root.vsim = vsim; root.VSIG_LEN = 336;
})(typeof window !== 'undefined' ? window : globalThis);
