'use strict';

const sql = require('mssql');
const config = require('./config');

let poolPromise = null;

function getPool() {
  if (!config.dbConfigured) {
    return Promise.reject(new Error('Veritabani ayarlari eksik (.env icindeki DB_SERVER doldurun).'));
  }
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config.db).connect().catch(function (err) {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/**
 * document sutunu varbinary(max) olarak tutuluyor. Icerik UTF-8 (bazi kurulumlarda
 * UTF-16LE) XML metnidir. SQL tarafinda CAST(... AS VARCHAR(MAX)) yapildiginda Turkce
 * karakterler bozuluyor; bu yuzden ham byte dizisini alip burada cozuyoruz.
 */
function decodeDocument(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return stripBom(value);

  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return swap16(buf.slice(2)).toString('utf16le');
  // BOM yoksa: ikinci byte 0x00 ise buyuk olasilikla UTF-16LE
  if (buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00) return buf.toString('utf16le');
  return stripBom(buf.toString('utf8'));
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function swap16(buf) {
  const out = Buffer.from(buf);
  for (let i = 0; i + 1 < out.length; i += 2) {
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
  }
  return out;
}

async function listWorkOrders(search, limit) {
  const pool = await getPool();
  const request = pool.request();
  request.input('limit', sql.Int, limit || 500);
  let where = '';
  if (search) {
    request.input('search', sql.NVarChar(200), '%' + search + '%');
    where = 'WHERE w.name LIKE @search OR w.number LIKE @search OR w.models LIKE @search';
  }
  const result = await request.query(
    'SELECT TOP (@limit) w.id, w.name, w.number, w.created_on, w.status, w.models, ' +
    '       w.model_quantity, w.fabric_codes, w.job_quantity, w.fabric_required, ' +
    '       w.fabric_consumption, w.utilization, w.cut_due_date ' +
    '  FROM dbo.WorkOrder AS w ' +
    where +
    ' ORDER BY w.created_on DESC, w.id DESC'
  );
  return result.recordset;
}

async function getWorkOrderDocument(name) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('name', sql.NVarChar(200), name)
    .query(
      'SELECT TOP (1) w.id, w.name, w.number, w.document, w.created_on, w.status, ' +
      '       w.models, w.fabric_codes, w.utilization, w.fabric_consumption ' +
      '  FROM dbo.WorkOrder AS w WHERE w.name = @name ORDER BY w.id DESC'
    );
  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    createdOn: row.created_on,
    status: row.status,
    models: row.models,
    fabricCodes: row.fabric_codes,
    utilization: row.utilization,
    fabricConsumption: row.fabric_consumption,
    xml: decodeDocument(row.document)
  };
}

module.exports = { getPool, listWorkOrders, getWorkOrderDocument, decodeDocument };
