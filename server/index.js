'use strict';

const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const config = require('./config');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(config.paths.root, 'public')));

fs.mkdirSync(config.paths.reports, { recursive: true });

// --- yardimcilar ---------------------------------------------------------

// Dosya adi olarak kullanilacagi icin is emri adini siniriyoruz.
const SAFE_NAME = /^[A-Za-z0-9ÇĞİÖŞÜçğıöşü._-]{1,120}$/;

function safeName(name) {
  return typeof name === 'string' && SAFE_NAME.test(name) ? name : null;
}

function reportPath(name) {
  return path.join(config.paths.reports, name + '.json');
}

function useDemo() {
  return config.demoMode || !config.dbConfigured;
}

async function readSample(name) {
  const file = path.join(config.paths.sample, (name || 'IFS9599-DK') + '.xml');
  if (!file.startsWith(config.paths.sample) || !fs.existsSync(file)) return null;
  return fsp.readFile(file, 'utf8');
}

async function listSamples() {
  const files = await fsp.readdir(config.paths.sample).catch(function () { return []; });
  return files
    .filter(function (f) { return f.toLowerCase().endsWith('.xml'); })
    .map(function (f) {
      const name = f.replace(/\.xml$/i, '');
      return { id: null, name: name, number: name, created_on: null, status: 'DEMO', models: '', fabric_codes: '' };
    });
}

function fail(res, err, status) {
  console.error('[hata]', err && err.message ? err.message : err);
  res.status(status || 500).json({ ok: false, error: err && err.message ? err.message : String(err) });
}

// --- API -----------------------------------------------------------------

app.get('/api/health', function (req, res) {
  res.json({
    ok: true,
    demo: useDemo(),
    dbConfigured: config.dbConfigured,
    database: config.dbConfigured ? config.db.database : null,
    server: config.dbConfigured ? config.db.server : null
  });
});

// Is emri listesi (İŞEMRİ NO secim kutusunu besler)
app.get('/api/workorders', async function (req, res) {
  try {
    if (useDemo()) return res.json({ ok: true, demo: true, items: await listSamples() });
    const items = await db.listWorkOrders(req.query.q, parseInt(req.query.limit, 10) || 500);
    res.json({ ok: true, demo: false, items: items });
  } catch (err) {
    fail(res, err);
  }
});

// Secilen is emrinin document (varbinary -> XML) icerigi
app.get('/api/workorders/:name/document', async function (req, res) {
  const name = safeName(req.params.name);
  if (!name) return fail(res, new Error('Gecersiz is emri adi.'), 400);
  try {
    if (useDemo()) {
      const xml = await readSample(name);
      if (!xml) return fail(res, new Error('Ornek dosya bulunamadi: ' + name), 404);
      return res.json({ ok: true, demo: true, name: name, xml: xml });
    }
    const row = await db.getWorkOrderDocument(name);
    if (!row) return fail(res, new Error('Is emri bulunamadi: ' + name), 404);
    res.json({ ok: true, demo: false, ...row });
  } catch (err) {
    fail(res, err);
  }
});

// Kaydedilmis raporlar
app.get('/api/reports', async function (req, res) {
  try {
    const files = await fsp.readdir(config.paths.reports);
    const items = [];
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.json')) continue;
      const stat = await fsp.stat(path.join(config.paths.reports, file));
      items.push({ name: file.replace(/\.json$/i, ''), savedAt: stat.mtime, size: stat.size });
    }
    items.sort(function (a, b) { return new Date(b.savedAt) - new Date(a.savedAt); });
    res.json({ ok: true, items: items });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/api/reports/:name', async function (req, res) {
  const name = safeName(req.params.name);
  if (!name) return fail(res, new Error('Gecersiz is emri adi.'), 400);
  try {
    const text = await fsp.readFile(reportPath(name), 'utf8');
    res.json({ ok: true, name: name, report: JSON.parse(text) });
  } catch (err) {
    if (err.code === 'ENOENT') return fail(res, new Error('Kayitli rapor yok: ' + name), 404);
    fail(res, err);
  }
});

// Raporu is emri numarasi ile dosyaya kaydet
app.put('/api/reports/:name', async function (req, res) {
  const name = safeName(req.params.name);
  if (!name) return fail(res, new Error('Gecersiz is emri adi.'), 400);
  try {
    const payload = Object.assign({}, req.body, { savedAt: new Date().toISOString(), workOrder: name });
    await fsp.writeFile(reportPath(name), JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, name: name, file: reportPath(name), savedAt: payload.savedAt });
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/reports/:name', async function (req, res) {
  const name = safeName(req.params.name);
  if (!name) return fail(res, new Error('Gecersiz is emri adi.'), 400);
  try {
    await fsp.unlink(reportPath(name));
    res.json({ ok: true, name: name });
  } catch (err) {
    if (err.code === 'ENOENT') return fail(res, new Error('Kayitli rapor yok: ' + name), 404);
    fail(res, err);
  }
});

app.listen(config.port, function () {
  console.log('AccuplanReporter -> http://localhost:' + config.port);
  console.log(useDemo()
    ? '  Mod: DEMO (sample/*.xml). Veritabani icin .env dosyasini doldurun.'
    : '  Mod: MSSQL ' + config.db.server + ' / ' + config.db.database);
});
