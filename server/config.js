'use strict';

require('dotenv').config();

const path = require('path');

function bool(value, def) {
  if (value === undefined || value === null || value === '') return def;
  return ['1', 'true', 'yes', 'evet', 'on'].indexOf(String(value).toLowerCase()) !== -1;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,

  // Veritabani erisimi yoksa (veya DEMO_MODE=1 ise) sample/ altindaki ornek
  // is emri dokumani kullanilir; arayuz birebir ayni sekilde calisir.
  demoMode: bool(process.env.DEMO_MODE, false),

  db: {
    server: process.env.DB_SERVER || '',
    database: process.env.DB_DATABASE || 'Accuplan',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    options: {
      encrypt: bool(process.env.DB_ENCRYPT, false),
      trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
      instanceName: process.env.DB_INSTANCE || undefined,
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

module.exports = config;
