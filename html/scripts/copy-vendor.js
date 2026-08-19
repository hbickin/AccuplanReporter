/*
 * jQuery / ExcelJS / FileSaver dosyalarini node_modules icinden public/vendor altina kopyalar.
 * Boylece rapor sayfasi internet baglantisi olmayan fabrika aglarinda da calisir.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'public', 'vendor');

const files = [
  ['jquery/dist/jquery.min.js', 'jquery.min.js'],
  ['exceljs/dist/exceljs.min.js', 'exceljs.min.js'],
  ['file-saver/dist/FileSaver.min.js', 'FileSaver.min.js']
];

fs.mkdirSync(target, { recursive: true });

let missing = 0;
for (const [src, dest] of files) {
  const from = path.join(root, 'node_modules', src);
  if (!fs.existsSync(from)) {
    console.warn('[vendor] bulunamadi, atlandi: ' + src);
    missing++;
    continue;
  }
  fs.copyFileSync(from, path.join(target, dest));
  console.log('[vendor] ' + dest);
}
if (missing) console.warn('[vendor] Eksik dosyalar icin: npm install');
