/*
 * excel-export.js
 * -------------------------------------------------------------------------
 * Ekrandaki raporu, "EminAsortiKesimhaneBosSablon.xlsx" duzeninde bir Excel
 * dosyasina cevirir: her kumas plani icin KESIM-n sayfasi + OZET sayfasi.
 * Hesaplanan hucreler formul olarak yazilir; boylece dosya Excel'de canli kalir.
 */
(function (window, $) {
  'use strict';

  var FILL = {
    baslik: 'FF1F4E78',   // koyu mavi baslik
    etiket: 'FFDDEBF7',   // acik mavi etiket
    veri: 'FFFFF2CC',     // sari - Accuplan'dan gelen veri
    formul: 'FFF2F2F2',   // gri - formul
    toplam: 'FFE2EFDA',   // yesil - toplam
    fark: 'FFFCE4D6'      // turuncu - fark
  };

  var THIN = { style: 'thin', color: { argb: 'FFB7B7B7' } };
  var BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

  function colLetter(index) { // 1 -> A
    var s = '';
    while (index > 0) {
      var m = (index - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      index = (index - m - 1) / 26;
    }
    return s;
  }

  function fill(cell, argb) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
  }

  function styleCell(cell, opts) {
    opts = opts || {};
    cell.border = BORDER;
    if (opts.fillColor) fill(cell, opts.fillColor);
    cell.font = $.extend({ name: 'Calibri', size: 10, bold: !!opts.bold, color: { argb: opts.fontColor || 'FF000000' } }, opts.font || {});
    cell.alignment = $.extend({ vertical: 'middle', horizontal: opts.align || 'center', wrapText: !!opts.wrap }, opts.alignment || {});
    if (opts.numFmt) cell.numFmt = opts.numFmt;
  }

  function safeSheetName(name) {
    return String(name).replace(/[\\\/\?\*\[\]:]/g, '-').substring(0, 31);
  }

  function buildPlanSheet(wb, rapor, plan, index) {
    var ws = wb.addWorksheet(safeSheetName('KESİM-' + (index + 1)), {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 10 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    var sizeIds = rapor.sizeIds;
    var nSize = sizeIds.length;
    var C = {
      isAdeti: 2 + nSize,
      kat: 3 + nSize,
      serim: 4 + nSize,
      toplamAdet: 5 + nSize,
      boy: 6 + nSize,
      fBoy: 7 + nSize,
      birim: 8 + nSize,
      sarf: 9 + nSize,
      verim: 10 + nSize,
      serimSure: 11 + nSize,
      kesimSure: 12 + nSize
    };
    var lastCol = C.kesimSure;

    ws.getColumn(1).width = 18;
    for (var c = 2; c <= 1 + nSize; c++) ws.getColumn(c).width = 7;
    for (var c2 = C.isAdeti; c2 <= lastCol; c2++) ws.getColumn(c2).width = 13;

    // --- Baslik blogu (sablon: A1:M5) ---------------------------------------
    var head = [
      ['İŞEMRİ NO', rapor.info.workOrderNumber, 'KESİM PLANI', plan.orderSettings.name || ''],
      ['MÜŞTERİ', rapor.info.company, 'PASTAL KURALI', plan.orderSettings.layLimits || ''],
      ['MODEL', rapor.model.name, 'SERİM YÖNTEMİ', plan.spreadingMethod || ''],
      ['KUMAŞ', plan.fabric, 'YERLEŞİM', plan.location || rapor.model.area || ''],
      ['TARİH', window.AccuplanRender.format.dateText(rapor), 'HAZIRLAYAN', rapor.info.manager]
    ];
    var midCol = Math.max(5, Math.min(1 + nSize, 8));
    $.each(head, function (i, row) {
      var r = i + 1;
      ws.getCell(r, 1).value = row[0];
      styleCell(ws.getCell(r, 1), { fillColor: FILL.etiket, bold: true, align: 'left' });
      ws.mergeCells(r, 2, r, midCol);
      ws.getCell(r, 2).value = row[1];
      styleCell(ws.getCell(r, 2), { fillColor: FILL.veri, bold: i === 0, align: 'left' });

      ws.getCell(r, midCol + 1).value = row[2];
      styleCell(ws.getCell(r, midCol + 1), { fillColor: FILL.etiket, bold: true, align: 'left' });
      ws.mergeCells(r, midCol + 2, r, Math.max(midCol + 3, C.isAdeti));
      ws.getCell(r, midCol + 2).value = row[3];
      styleCell(ws.getCell(r, midCol + 2), { fillColor: FILL.veri, align: 'left' });
    });

    // --- Beden / is emri adedi (sablon satir 8-9) ---------------------------
    var R_SIZE = 7, R_ORDER = 8;
    ws.getCell(R_SIZE, 1).value = 'BEDENLER';
    styleCell(ws.getCell(R_SIZE, 1), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF', align: 'left' });
    ws.getCell(R_ORDER, 1).value = 'İŞEMRİ ADETİ';
    styleCell(ws.getCell(R_ORDER, 1), { fillColor: FILL.etiket, bold: true, align: 'left' });

    $.each(sizeIds, function (i, id) {
      var col = 2 + i;
      ws.getCell(R_SIZE, col).value = rapor.sizeById[id] ? rapor.sizeById[id].label : id;
      styleCell(ws.getCell(R_SIZE, col), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF' });
      ws.getCell(R_ORDER, col).value = plan.order[id] || 0;
      styleCell(ws.getCell(R_ORDER, col), { fillColor: FILL.veri, numFmt: '#,##0' });
    });

    ws.getCell(R_SIZE, C.isAdeti).value = 'TOPLAM';
    styleCell(ws.getCell(R_SIZE, C.isAdeti), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF' });
    ws.getCell(R_ORDER, C.isAdeti).value = {
      formula: 'SUM(' + colLetter(2) + R_ORDER + ':' + colLetter(1 + nSize) + R_ORDER + ')',
      result: rapor.siparisToplam
    };
    styleCell(ws.getCell(R_ORDER, C.isAdeti), { fillColor: FILL.toplam, bold: true, numFmt: '#,##0' });

    ws.getCell(R_SIZE, C.kat).value = 'EN (cm)';
    styleCell(ws.getCell(R_SIZE, C.kat), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF' });
    ws.getCell(R_ORDER, C.kat).value = plan.width.cm;
    styleCell(ws.getCell(R_ORDER, C.kat), { fillColor: FILL.veri, numFmt: '#,##0.0' });

    ws.getCell(R_SIZE, C.serim).value = 'PASTAL PAYI (m)';
    styleCell(ws.getCell(R_SIZE, C.serim), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF', wrap: true });
    var payAddr = '$' + colLetter(C.serim) + '$' + R_ORDER;
    ws.getCell(R_ORDER, C.serim).value = plan.pastalPayi;
    styleCell(ws.getCell(R_ORDER, C.serim), { fillColor: FILL.veri, numFmt: '#,##0.000' });

    // --- Kesim tablosu ------------------------------------------------------
    var R_HEAD = 10;
    var headers = ['KESİM'].concat($.map(sizeIds, function (id) {
      return rapor.sizeById[id] ? rapor.sizeById[id].label : id;
    })).concat(['İŞ ADETİ', 'KAT SAYISI', 'SERİM', 'TOPL. AD.', 'PASTAL BOYU (m)', 'F. PASTAL BOYU (m)',
      'BİRİM METRAJ (m)', 'KUMAŞ SARF (m)', 'VERİMLİLİK', 'SERİM SÜRESİ (dk)', 'KESİM SÜRESİ (dk)']);
    $.each(headers, function (i, h) {
      var cell = ws.getCell(R_HEAD, i + 1);
      cell.value = h;
      styleCell(cell, { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF', wrap: true, align: i === 0 ? 'left' : 'center' });
    });
    ws.getRow(R_HEAD).height = 30;

    var first = R_HEAD + 1;
    $.each(plan.rows, function (i, r) {
      var row = first + i;
      var L = function (col) { return colLetter(col) + row; };

      ws.getCell(row, 1).value = (i + 1) + '.PASTAL  ' + (r.customName || r.name);
      styleCell(ws.getCell(row, 1), { fillColor: FILL.etiket, bold: true, align: 'left' });

      $.each(sizeIds, function (j, id) {
        var cell = ws.getCell(row, 2 + j);
        var q = r.asorti[id] || 0;
        cell.value = q || null;
        styleCell(cell, { fillColor: FILL.veri, numFmt: '#,##0' });
      });

      ws.getCell(row, C.isAdeti).value = {
        formula: 'SUM(' + colLetter(2) + row + ':' + colLetter(1 + nSize) + row + ')', result: r.isAdeti
      };
      styleCell(ws.getCell(row, C.isAdeti), { fillColor: FILL.formul, numFmt: '#,##0' });

      ws.getCell(row, C.kat).value = r.katSayisi || null;
      styleCell(ws.getCell(row, C.kat), { fillColor: FILL.veri, numFmt: '#,##0' });

      ws.getCell(row, C.serim).value = r.serim || null;
      styleCell(ws.getCell(row, C.serim), { fillColor: FILL.veri, numFmt: '#,##0' });

      ws.getCell(row, C.toplamAdet).value = {
        formula: L(C.isAdeti) + '*' + L(C.kat) + '*IF(' + L(C.serim) + '="",1,' + L(C.serim) + ')',
        result: r.toplamAdet
      };
      styleCell(ws.getCell(row, C.toplamAdet), { fillColor: FILL.formul, numFmt: '#,##0' });

      ws.getCell(row, C.boy).value = r.pastalBoyu;
      styleCell(ws.getCell(row, C.boy), { fillColor: FILL.veri, numFmt: '#,##0.000' });

      ws.getCell(row, C.fBoy).value = {
        formula: 'IF(' + L(C.boy) + '="","",' + L(C.boy) + '+' + payAddr + ')', result: r.fPastalBoyu
      };
      styleCell(ws.getCell(row, C.fBoy), { fillColor: FILL.formul, numFmt: '#,##0.000' });

      ws.getCell(row, C.birim).value = {
        formula: 'IFERROR(' + L(C.boy) + '/' + L(C.isAdeti) + ',"")', result: r.birimMetraj
      };
      styleCell(ws.getCell(row, C.birim), { fillColor: FILL.formul, numFmt: '#,##0.0000' });

      ws.getCell(row, C.sarf).value = {
        formula: 'IF(' + L(C.fBoy) + '="","",' + L(C.fBoy) + '*' + L(C.kat) + '*IF(' + L(C.serim) + '="",1,' + L(C.serim) + '))',
        result: r.kumasSarf
      };
      styleCell(ws.getCell(row, C.sarf), { fillColor: FILL.formul, numFmt: '#,##0.00' });

      ws.getCell(row, C.verim).value = r.verimlilik;
      styleCell(ws.getCell(row, C.verim), { fillColor: FILL.veri, numFmt: '0.00%' });

      ws.getCell(row, C.serimSure).value = r.serimSuresi;
      styleCell(ws.getCell(row, C.serimSure), { fillColor: FILL.veri, numFmt: '#,##0.0' });

      ws.getCell(row, C.kesimSure).value = r.kesimSuresi;
      styleCell(ws.getCell(row, C.kesimSure), { fillColor: FILL.veri, numFmt: '#,##0.0' });
    });

    var last = first + Math.max(plan.rows.length, 1) - 1;
    var rng = function (col) { return colLetter(col) + first + ':' + colLetter(col) + last; };

    // TOPLAM ASORTİ
    var rAsorti = last + 1;
    ws.getCell(rAsorti, 1).value = 'TOPLAM ASORTİ';
    styleCell(ws.getCell(rAsorti, 1), { fillColor: FILL.toplam, bold: true, align: 'left' });
    $.each(sizeIds, function (i, id) {
      var col = 2 + i;
      ws.getCell(rAsorti, col).value = { formula: 'SUM(' + rng(col) + ')', result: plan.totals.asorti[id] };
      styleCell(ws.getCell(rAsorti, col), { fillColor: FILL.toplam, bold: true, numFmt: '#,##0' });
    });
    var toplamMap = [
      [C.isAdeti, plan.totals.isAdeti, '#,##0'],
      [C.kat, plan.totals.katSayisi, '#,##0'],
      [C.serim, plan.totals.serim, '#,##0'],
      [C.toplamAdet, plan.totals.toplamAdet, '#,##0'],
      [C.boy, plan.totals.pastalBoyu, '#,##0.000'],
      [C.fBoy, plan.totals.fPastalBoyu, '#,##0.000'],
      [C.sarf, plan.totals.kumasSarf, '#,##0.00'],
      [C.serimSure, plan.totals.serimSuresi, '#,##0.0'],
      [C.kesimSure, plan.totals.kesimSuresi, '#,##0.0']
    ];
    $.each(toplamMap, function (i, m) {
      ws.getCell(rAsorti, m[0]).value = { formula: 'SUM(' + rng(m[0]) + ')', result: m[1] };
      styleCell(ws.getCell(rAsorti, m[0]), { fillColor: FILL.toplam, bold: true, numFmt: m[2] });
    });
    ws.getCell(rAsorti, C.birim).value = {
      formula: 'IFERROR(SUM(' + rng(C.boy) + ')/SUM(' + rng(C.isAdeti) + '),0)', result: plan.totals.birimMetraj
    };
    styleCell(ws.getCell(rAsorti, C.birim), { fillColor: FILL.toplam, bold: true, numFmt: '#,##0.0000' });
    ws.getCell(rAsorti, C.verim).value = {
      formula: 'IFERROR(SUMPRODUCT(' + rng(C.sarf) + ',' + rng(C.verim) + ')/SUM(' + rng(C.sarf) + '),0)',
      result: plan.totals.verimlilik
    };
    styleCell(ws.getCell(rAsorti, C.verim), { fillColor: FILL.toplam, bold: true, numFmt: '0.00%' });

    // TOPLAM KESİM
    var rKesim = rAsorti + 1;
    ws.getCell(rKesim, 1).value = 'TOPLAM KESİM';
    styleCell(ws.getCell(rKesim, 1), { fillColor: FILL.toplam, bold: true, align: 'left' });
    $.each(sizeIds, function (i, id) {
      var col = 2 + i;
      var parts = [];
      for (var r2 = first; r2 <= last; r2++) {
        parts.push(colLetter(col) + r2 + '*' + colLetter(C.kat) + r2 + '*IF(' + colLetter(C.serim) + r2 + '="",1,' + colLetter(C.serim) + r2 + ')');
      }
      ws.getCell(rKesim, col).value = { formula: parts.join('+'), result: plan.totals.kesim[id] };
      styleCell(ws.getCell(rKesim, col), { fillColor: FILL.toplam, bold: true, numFmt: '#,##0' });
    });
    ws.getCell(rKesim, C.toplamAdet).value = {
      formula: 'SUM(' + colLetter(2) + rKesim + ':' + colLetter(1 + nSize) + rKesim + ')', result: plan.totals.kesimToplam
    };
    styleCell(ws.getCell(rKesim, C.toplamAdet), { fillColor: FILL.toplam, bold: true, numFmt: '#,##0' });

    // KESİM FARKI
    var rFark = rKesim + 1;
    ws.getCell(rFark, 1).value = 'KESİM FARKI';
    styleCell(ws.getCell(rFark, 1), { fillColor: FILL.fark, bold: true, align: 'left' });
    $.each(sizeIds, function (i, id) {
      var col = 2 + i;
      ws.getCell(rFark, col).value = {
        formula: colLetter(col) + rKesim + '-' + colLetter(col) + R_ORDER, result: plan.totals.fark[id]
      };
      styleCell(ws.getCell(rFark, col), { fillColor: FILL.fark, numFmt: '#,##0;[Red]-#,##0' });
    });
    ws.getCell(rFark, C.toplamAdet).value = {
      formula: 'SUM(' + colLetter(2) + rFark + ':' + colLetter(1 + nSize) + rFark + ')', result: plan.totals.farkToplam
    };
    styleCell(ws.getCell(rFark, C.toplamAdet), { fillColor: FILL.fark, bold: true, numFmt: '#,##0;[Red]-#,##0' });

    // BEDEN DAĞILIMI %
    var rDagilim = rFark + 1;
    ws.getCell(rDagilim, 1).value = 'BEDEN DAĞILIMI %';
    styleCell(ws.getCell(rDagilim, 1), { fillColor: FILL.formul, bold: true, align: 'left' });
    $.each(sizeIds, function (i, id) {
      var col = 2 + i;
      ws.getCell(rDagilim, col).value = {
        formula: 'IFERROR(' + colLetter(col) + R_ORDER + '/$' + colLetter(C.isAdeti) + '$' + R_ORDER + ',0)',
        result: plan.totals.dagilim[id]
      };
      styleCell(ws.getCell(rDagilim, col), { fillColor: FILL.formul, numFmt: '0.0%' });
    });

    // Aciklama
    var rNot = rDagilim + 2;
    ws.mergeCells(rNot, 1, rNot + 1, lastCol);
    ws.getCell(rNot, 1).value =
      'Sarı hücreler Accuplan iş emri dokümanından (WorkOrder.document) gelir, gri hücreler formüldür. ' +
      'Pastal boyu Marker/@MadeLength varsa gerçekleşen değerdir; yoksa alan / (kumaş eni × verimlilik) ile hesaplanır. ' +
      'Pastal payı kumaşın EndLoss değeridir (' + plan.pastalPayi.toFixed(3) + ' m). Süreler Accuplan CostSettings hızlarına göre tahminidir.';
    styleCell(ws.getCell(rNot, 1), { fillColor: FILL.formul, align: 'left', wrap: true, font: { size: 9, italic: true } });

    return ws;
  }

  function buildOzetSheet(wb, rapor) {
    var ws = wb.addWorksheet('ÖZET', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws.getColumn(1).width = 22;
    for (var c = 2; c <= 10; c++) ws.getColumn(c).width = 15;

    ws.mergeCells(1, 1, 1, 9);
    ws.getCell(1, 1).value = 'KESİMHANE ASORTİ RAPORU — ' + rapor.info.workOrderNumber;
    styleCell(ws.getCell(1, 1), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF', align: 'left', font: { size: 13, bold: true, color: { argb: 'FFFFFFFF' } } });
    ws.getRow(1).height = 24;

    var kpi = [
      ['İŞ EMRİ', rapor.info.workOrderNumber, 'MODEL', rapor.model.name, 'MÜŞTERİ', rapor.info.company],
      ['İŞ EMRİ ADEDİ', rapor.siparisToplam, 'TOPLAM PASTAL', rapor.genel.pastalSayisi, 'TOPLAM KUMAŞ (m)', rapor.genel.kumasSarf],
      ['AĞIRLIKLI VERİMLİLİK', rapor.genel.verimlilik, 'TARİH', window.AccuplanRender.format.dateText(rapor), 'HAZIRLAYAN', rapor.info.manager]
    ];
    $.each(kpi, function (i, row) {
      var r = i + 3;
      for (var k = 0; k < 3; k++) {
        var labelCol = 1 + k * 3;
        ws.getCell(r, labelCol).value = row[k * 2];
        styleCell(ws.getCell(r, labelCol), { fillColor: FILL.etiket, bold: true, align: 'left' });
        ws.mergeCells(r, labelCol + 1, r, labelCol + 2);
        var cell = ws.getCell(r, labelCol + 1);
        cell.value = row[k * 2 + 1];
        var fmt = null;
        if (row[k * 2] === 'AĞIRLIKLI VERİMLİLİK') fmt = '0.00%';
        else if (row[k * 2] === 'TOPLAM KUMAŞ (m)') fmt = '#,##0.00';
        else if (typeof row[k * 2 + 1] === 'number') fmt = '#,##0';
        styleCell(cell, { fillColor: FILL.veri, align: 'left', numFmt: fmt });
      }
    });

    var R = 7;
    var headers = ['Kesim Planı', 'Pastal', 'Toplam Kat', 'Serim', 'Kesim Adedi', 'Kumaş Sarfı (m)',
      'Verimlilik', 'Serim Süresi (dk)', 'Kesim Süresi (dk)'];
    $.each(headers, function (i, h) {
      ws.getCell(R, i + 1).value = h;
      styleCell(ws.getCell(R, i + 1), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF', wrap: true, align: i === 0 ? 'left' : 'center' });
    });
    ws.getRow(R).height = 28;

    $.each(rapor.visiblePlans, function (i, p) {
      var r = R + 1 + i;
      var t = p.totals;
      var values = [p.fabric, t.pastalSayisi, t.katSayisi, t.serim, t.kesimToplam, t.kumasSarf, t.verimlilik, t.serimSuresi, t.kesimSuresi];
      var fmts = [null, '#,##0', '#,##0', '#,##0', '#,##0', '#,##0.00', '0.00%', '#,##0.0', '#,##0.0'];
      $.each(values, function (j, v) {
        var cell = ws.getCell(r, j + 1);
        cell.value = v;
        styleCell(cell, { fillColor: j === 0 ? FILL.etiket : FILL.formul, bold: j === 0, align: j === 0 ? 'left' : 'center', numFmt: fmts[j] });
      });
    });

    var rGenel = R + 1 + rapor.visiblePlans.length;
    var firstRow = R + 1, lastRow = rGenel - 1;
    ws.getCell(rGenel, 1).value = 'GENEL';
    styleCell(ws.getCell(rGenel, 1), { fillColor: FILL.toplam, bold: true, align: 'left' });
    var genelCols = [
      [2, rapor.genel.pastalSayisi, '#,##0'], [3, rapor.genel.katSayisi, '#,##0'],
      [4, rapor.genel.serim, '#,##0'], [5, rapor.genel.toplamAdet, '#,##0'],
      [6, rapor.genel.kumasSarf, '#,##0.00'], [8, rapor.genel.serimSuresi, '#,##0.0'],
      [9, rapor.genel.kesimSuresi, '#,##0.0']
    ];
    $.each(genelCols, function (i, m) {
      var L = colLetter(m[0]);
      ws.getCell(rGenel, m[0]).value = lastRow >= firstRow
        ? { formula: 'SUM(' + L + firstRow + ':' + L + lastRow + ')', result: m[1] }
        : m[1];
      styleCell(ws.getCell(rGenel, m[0]), { fillColor: FILL.toplam, bold: true, numFmt: m[2] });
    });
    ws.getCell(rGenel, 7).value = lastRow >= firstRow
      ? { formula: 'IFERROR(SUMPRODUCT(F' + firstRow + ':F' + lastRow + ',G' + firstRow + ':G' + lastRow + ')/SUM(F' + firstRow + ':F' + lastRow + '),0)', result: rapor.genel.verimlilik }
      : rapor.genel.verimlilik;
    styleCell(ws.getCell(rGenel, 7), { fillColor: FILL.toplam, bold: true, numFmt: '0.00%' });

    // Beden dagilimi
    var rBase = rGenel + 2;
    ws.getCell(rBase, 1).value = 'BEDEN DAĞILIMI';
    styleCell(ws.getCell(rBase, 1), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF', align: 'left' });
    var labels = ['Beden', 'İş Emri Adedi', 'Dağılım %'];
    $.each(labels, function (i, lab) {
      ws.getCell(rBase + 1 + i, 1).value = lab;
      styleCell(ws.getCell(rBase + 1 + i, 1), { fillColor: FILL.etiket, bold: true, align: 'left' });
    });
    $.each(rapor.sizeIds, function (i, id) {
      var col = 2 + i;
      ws.getColumn(col).width = Math.max(ws.getColumn(col).width || 8, 8);
      ws.getCell(rBase + 1, col).value = rapor.sizeById[id] ? rapor.sizeById[id].label : id;
      styleCell(ws.getCell(rBase + 1, col), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF' });
      ws.getCell(rBase + 2, col).value = rapor.siparis[id] || 0;
      styleCell(ws.getCell(rBase + 2, col), { fillColor: FILL.veri, numFmt: '#,##0' });
      ws.getCell(rBase + 3, col).value = rapor.siparisToplam ? (rapor.siparis[id] || 0) / rapor.siparisToplam : 0;
      styleCell(ws.getCell(rBase + 3, col), { fillColor: FILL.formul, numFmt: '0.0%' });
    });
    var totCol = 2 + rapor.sizeIds.length;
    ws.getCell(rBase + 1, totCol).value = 'TOPLAM';
    styleCell(ws.getCell(rBase + 1, totCol), { fillColor: FILL.baslik, bold: true, fontColor: 'FFFFFFFF' });
    ws.getCell(rBase + 2, totCol).value = rapor.siparisToplam;
    styleCell(ws.getCell(rBase + 2, totCol), { fillColor: FILL.toplam, bold: true, numFmt: '#,##0' });
    ws.getCell(rBase + 3, totCol).value = 1;
    styleCell(ws.getCell(rBase + 3, totCol), { fillColor: FILL.toplam, bold: true, numFmt: '0.0%' });

    return ws;
  }

  function build(rapor) {
    var wb = new window.ExcelJS.Workbook();
    wb.creator = 'AccuplanReporter';
    wb.created = new Date();
    buildOzetSheet(wb, rapor);
    $.each(rapor.visiblePlans, function (i, plan) { buildPlanSheet(wb, rapor, plan, i); });
    return wb;
  }

  function download(rapor, fileName) {
    return build(rapor).xlsx.writeBuffer().then(function (buffer) {
      var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      window.saveAs(blob, fileName || (rapor.info.workOrderNumber || 'isemri') + '-kesim-raporu.xlsx');
    });
  }

  window.AccuplanExcel = { build: build, download: download };
})(window, jQuery);
