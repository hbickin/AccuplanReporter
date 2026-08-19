'use strict';

require('dotenv').config();

const path = require('path');

function bool(value, def) {
  if (value === undefined || value === null || value === '') return def;
  return ['1', 'true', 'yes', 'evet', 'on'].indexOf(String(value).toLowerCase()) !== -1;
}

/*
 * Named instance destegi (or. WHBICKIN\SQLEXPRESS):
 *   - DB_SERVER'a "SUNUCU\ORNEK" yazilabilir; sunucu ve ornek adi ayristirilir.
 *   - tedious'ta port ile instanceName birlikte verilemez ("Port and instanceName
 *     are mutually exclusive"), bu yuzden ornek adi varken port gonderilmez.
 *   - DB_PORT acikca verilmisse port kazanir (SQL Browser servisi kapaliysa
 *     named instance'a sabit portla baglanmak gerekir).
 */
function resolveServer() {
  let server = (process.env.DB_SERVER || '').trim();
  let instance = (process.env.DB_INSTANCE || '').trim();
  const m = /^(.*?)[\\/](.+)$/.exec(server);
  if (m) {
    server = m[1].trim();
    instance = instance || m[2].trim();
  }
  const explicitPort = parseInt(process.env.DB_PORT, 10) || 0;
  const useInstance = Boolean(instance) && !explicitPort;
  return {
    server: server,
    instanceName: useInstance ? instance : undefined,
    port: useInstance ? undefined : (explicitPort || 1433)
  };
}

const target = resolveServer();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,

  // Veritabani erisimi yoksa (veya DEMO_MODE=1 ise) sample/ altindaki ornek
  // is emri dokumani kullanilir; arayuz birebir ayni sekilde calisir.
  demoMode: bool(process.env.DEMO_MODE, false),

  db: {
    server: target.server,
    database: process.env.DB_DATABASE || 'Accuplan',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    port: target.port,
    options: {
      encrypt: bool(process.env.DB_ENCRYPT, false),
      trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
      instanceName: target.instanceName,
      enableArithAbort: true
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT, 10) || 30000,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 15000
  },

  paths: {
    root: path.join(__dirname, '..'),
    reports: process.env.REPORT_DIR || path.join(__dirname, '..', 'data', 'reports'),
    sample: path.join(__dirname, '..', 'sample')
  }
};

config.dbConfigured = Boolean(config.db.server);
config.dbTarget = config.db.server +
  (config.db.options.instanceName ? '\\' + config.db.options.instanceName : ':' + config.db.port);

module.exports = config;
