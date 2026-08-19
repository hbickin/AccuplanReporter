/*
 * Ornek is emri (IFS9599-DK) uzerinde parser dogrulamasi.
 * Calistirmak icin:  npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const $ = require('jquery')(dom.window);
global.window = dom.window;
global.document = dom.window.document;
global.jQuery = $;
dom.window.jQuery = $;

// Tarayici modulunu ayni sekilde yukle
new Function('window', 'jQuery', fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'accuplan-parser.js'), 'utf8'))
  (dom.window, $);

const Accuplan = dom.window.Accuplan;
const xml = fs.readFileSync(path.join(__dirname, '..', 'sample', 'IFS9599-DK.xml'), 'utf8');
const rapor = Accuplan.parse(xml);

let fails = 0;
function check(baslik, fn) {
  try {
    fn();
    console.log('  ok   ' + baslik);
  } catch (err) {
    fails++;
    console.log('  HATA ' + baslik + ' -> ' + err.message);
  }
}
function yakin(a, b, tolerans, mesaj) {
  assert.ok(Math.abs(a - b) <= tolerans, (mesaj || '') + ' beklenen ' + b + ', gelen ' + a);
}

console.log('Is emri basligi');
check('is emri no', () => assert.strictEqual(rapor.info.workOrderNumber, 'IFS9599-DK'));
check('musteri', () => assert.strictEqual(rapor.info.company, 'KIVANC'));
check('model', () => assert.strictEqual(rapor.model.name, '843627-CKT-001'));
check('kesim plani sorumlusu', () => assert.strictEqual(rapor.info.manager, 'OKN KRKMZ'));
check('kullanilan bedenler 48..62', () => assert.deepStrictEqual(rapor.sizeLabels, ['48', '50', '52', '54', '56', '58', '62']));
check('is emri toplam adedi 910', () => assert.strictEqual(rapor.siparisToplam, 910));

const cp = rapor.plans.find(p => p.fabric === 'CP');
const dk = rapor.plans.find(p => p.fabric === 'DK');

console.log('CP kesim plani');
check('4 kumas plani, 2 tanesi pastalli', () => {
  assert.strictEqual(rapor.plans.length, 4);
  assert.strictEqual(rapor.visiblePlans.length, 2);
});
check('kumas eni 150 cm', () => yakin(cp.width.cm, 150, 0.01, 'CP eni'));
check('pastal payi 0.04 m (EndLoss)', () => yakin(cp.pastalPayi, 0.04, 0.0005, 'pastal payi'));
check('3 pastal satiri', () => assert.strictEqual(cp.rows.length, 3));
check('CP-01 gerceklesen pastal boyu 1.5927 m (MadeLength)', () => {
  const r = cp.rows[0];
  assert.strictEqual(r.pastalBoyuKaynak, 'made');
  yakin(r.pastalBoyu, 62.70325 * 0.0254, 0.0001, 'pastal boyu');
  yakin(r.verimlilik, 0.95355, 1e-6, 'made verimlilik');
});
check('CP-01 asorti/kat/serim -> toplam adet', () => {
  const r = cp.rows[0];
  assert.strictEqual(r.isAdeti, 8);       // 1+3+3+1
  assert.strictEqual(r.katSayisi, 60);
  assert.strictEqual(r.serim, 1);
  assert.strictEqual(r.toplamAdet, 480);
});
check('CP-01 kumas sarfi = (boy + pay) x kat x serim', () => {
  const r = cp.rows[0];
  // Boy mm hassasiyetine yuvarlanir, turev degerler bu yuvarlanmis boydan uretilir.
  const boy = Math.round(62.70325 * 0.0254 * 1e4) / 1e4;
  yakin(r.kumasSarf, (boy + 0.04) * 60, 1e-9, 'sarf');
  yakin(r.pastalBoyu, boy, 1e-12, 'yuvarlanmis boy');
});
check('CP toplam kesim adetleri', () => {
  // 48:1x60+2x50+1x10=170, 50:3x60+2x10=200, 52:3x60+2x10=200,
  // 54:1x60+2x50+2x10=180, 56:2x50=100, 58:1x50=50, 62:1x10=10
  assert.deepStrictEqual(
    rapor.sizeIds.map(id => cp.totals.kesim[id]),
    [170, 200, 200, 180, 100, 50, 10]
  );
});
check('CP kesim farki sifir (siparisi birebir karsiliyor)', () => {
  rapor.sizeIds.forEach(id => assert.strictEqual(cp.totals.fark[id], 0));
  assert.strictEqual(cp.totals.farkToplam, 0);
});

console.log('DK kesim plani');
check('kumas eni 154 cm', () => yakin(dk.width.cm, 154, 0.01, 'DK eni'));
check('4 pastal satiri', () => assert.strictEqual(dk.rows.length, 4));
check('DK-01 pastal boyu alan/(en x verimlilik) ile hesaplanir', () => {
  const r = dk.rows[0];
  assert.strictEqual(r.pastalBoyuKaynak, 'hesap');
  // 1x3062.17513 + 2x3161.06559 + 2x3296.79638 inch^2
  const alan = 3062.17513 + 2 * 3161.06559 + 2 * 3296.79638;
  const boyInch = alan / (60.62992 * 0.845);
  yakin(r.pastalBoyu, boyInch * 0.0254, 0.0001, 'DK-01 boy');
});
check('DK toplam kesim adetleri siparise esit', () => {
  assert.deepStrictEqual(
    rapor.sizeIds.map(id => dk.totals.kesim[id]),
    [170, 200, 200, 180, 100, 50, 10]
  );
  assert.strictEqual(dk.totals.kesimToplam, 910);
});
check('DK agirlikli verimlilik 0.83 - 0.845 araliginda', () => {
  assert.ok(dk.totals.verimlilik > 0.83 && dk.totals.verimlilik < 0.845,
    'verimlilik ' + dk.totals.verimlilik);
});

console.log('OZET');
check('genel pastal sayisi 7', () => assert.strictEqual(rapor.genel.pastalSayisi, 7));
check('genel kumas sarfi = CP + DK', () => {
  yakin(rapor.genel.kumasSarf, cp.totals.kumasSarf + dk.totals.kumasSarf, 1e-9, 'genel sarf');
  assert.ok(rapor.genel.kumasSarf > 0);
});
check('sure hesaplari uretiliyor', () => {
  assert.ok(cp.rows[0].serimSuresi > 0, 'serim suresi');
  assert.ok(cp.rows[0].kesimSuresi > 0, 'kesim suresi');
});

console.log('');
console.log('CP sarf: ' + cp.totals.kumasSarf.toFixed(2) + ' m, verimlilik %' + (cp.totals.verimlilik * 100).toFixed(2));
console.log('DK sarf: ' + dk.totals.kumasSarf.toFixed(2) + ' m, verimlilik %' + (dk.totals.verimlilik * 100).toFixed(2));
console.log(fails ? (fails + ' test BASARISIZ') : 'Tum testler basarili.');
process.exit(fails ? 1 : 0);
