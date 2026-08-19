/*
 * report-render.js
 * -------------------------------------------------------------------------
 * Ayristirilan is emri modelini "EminAsortiKesimhane" sablonunun ekran
 * karsiligina cevirir: her kumas plani icin bir KESIM sayfasi + OZET.
 */
(function (window, $) {
  'use strict';

  var TR = 'tr-TR';

  function n(value, digits) {
    if (value === null || value === undefined || value === '' || isNaN(value)) return '';
    return Number(value).toLocaleString(TR, { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }
  function pct(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return '';
    return n(value * 100, digits === undefined ? 2 : digits) + '%';
  }
  function int(value) {
    return (value === null || value === undefined || value === '' || isNaN(value) || value === 0) ? '' : n(value, 0);
  }
  function esc(text) {
    return $('<div/>').text(text === null || text === undefined ? '' : text).html();
  }
  function dateText(rapor) {
    if (rapor.info.dateReceivedIso) {
      var d = new Date(rapor.info.dateReceivedIso);
      return d.toLocaleString(TR, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return rapor.info.dateReceived || '';
  }

  var COL_LABELS = ['İŞ ADETİ', 'KAT SAYISI', 'SERİM', 'TOPL. AD.', 'PASTAL BOYU', 'F. PASTAL BOYU',
    'BİRİM METRAJ', 'KUMAŞ SARF', 'VERİMLİLİK', 'SERİM SÜRESİ', 'KESİM SÜRESİ'];

  function renderHeaderBlock(rapor, plan) {
    return '' +
      '<table class="ap-info">' +
      '<tr><th>İŞEMRİ NO</th><td class="v-strong">' + esc(rapor.info.workOrderNumber) + '</td>' +
      '    <th>KESİM PLANI</th><td>' + esc(plan.orderSettings.name || '-') + '</td></tr>' +
      '<tr><th>MÜŞTERİ</th><td>' + esc(rapor.info.company) + '</td>' +
      '    <th>PASTAL KURALI</th><td>' + esc(plan.orderSettings.layLimits || '-') + '</td></tr>' +
      '<tr><th>MODEL</th><td>' + esc(rapor.model.name) + '</td>' +
      '    <th>SERİM YÖNTEMİ</th><td>' + esc(plan.spreadingMethod || '-') + '</td></tr>' +
      '<tr><th>KUMAŞ</th><td class="v-strong">' + esc(plan.fabric) + '</td>' +
      '    <th>YERLEŞİM</th><td>' + esc(plan.location || rapor.model.area || '-') + '</td></tr>' +
      '<tr><th>TARİH</th><td>' + esc(dateText(rapor)) + '</td>' +
      '    <th>HAZIRLAYAN</th><td>' + esc(rapor.info.manager) + '</td></tr>' +
      '</table>';
  }

  /* Beden/adet satirlari ile pastal tablosu, sablondaki gibi tek bir izgarada
     tutulur; boylece beden sutunlari her satirda ayni hizada kalir. */
  function renderCutTable(rapor, plan) {
    var t = plan.totals;
    var nMeta = COL_LABELS.length;                 // 11 sagdaki hesap sutunu
    var total = 1 + rapor.sizeIds.length + nMeta;  // toplam sutun sayisi

    function sizeHeaders() {
      var h = '';
      $.each(rapor.sizeIds, function (i, id) {
        h += '<th>' + esc(rapor.sizeById[id] ? rapor.sizeById[id].label : id) + '</th>';
      });
      return h;
    }
    function bosHucre(adet, cls) {
      var h = '';
      for (var i = 0; i < adet; i++) h += '<td class="' + (cls || '') + '">&nbsp;</td>';
      return h;
    }

    var h = '<table class="ap-grid ap-cut"><tbody>';

    // --- BEDENLER / İŞEMRİ ADETİ -------------------------------------------
    h += '<tr class="hdr"><th class="lbl">BEDENLER</th>' + sizeHeaders() +
      '<th>TOPLAM</th><th>EN (cm)</th><th>PASTAL PAYI (m)</th>' +
      new Array(nMeta - 2).join('<th>&nbsp;</th>') + '<th>&nbsp;</th></tr>';

    var siparisToplam = 0;
    h += '<tr class="order"><th class="lbl">İŞEMRİ ADETİ</th>';
    $.each(rapor.sizeIds, function (i, id) {
      var q = plan.order[id] || 0;
      siparisToplam += q;
      h += '<td class="num in">' + int(q) + '</td>';
    });
    h += '<td class="num tot">' + int(siparisToplam) + '</td>' +
      '<td class="num in">' + n(plan.width.cm, 1) + '</td>' +
      '<td class="num in">' + n(plan.pastalPayi, 3) + '</td>' +
      bosHucre(nMeta - 3) + '</tr>';

    h += '<tr class="spacer"><td colspan="' + total + '"></td></tr>';

    // --- KESİM tablosu ------------------------------------------------------
    h += '<tr class="hdr"><th class="lbl">KESİM</th>' + sizeHeaders();
    $.each(COL_LABELS, function (i, c) { h += '<th>' + c + '</th>'; });
    h += '</tr>';

    $.each(plan.rows, function (i, r) {
      var ad = r.customName || r.name;
      h += '<tr class="pastal" title="' + esc(ad + (r.layLimits ? ' | ' + r.layLimits : '')) + '">';
      h += '<th class="lbl">' + (i + 1) + '.PASTAL<span class="mname">' + esc(ad) + '</span></th>';
      $.each(rapor.sizeIds, function (j, id) {
        var q = r.asorti[id] || 0;
        h += '<td class="num' + (q ? ' in' : '') + '">' + int(q) + '</td>';
      });
      h += '<td class="num">' + int(r.isAdeti) + '</td>';
      h += '<td class="num in">' + int(r.katSayisi) + '</td>';
      h += '<td class="num in">' + int(r.serim) + '</td>';
      h += '<td class="num calc">' + int(r.toplamAdet) + '</td>';
      h += '<td class="num' + (r.pastalBoyuKaynak === 'hesap' ? ' est' : '') + '" title="' +
        (r.pastalBoyuKaynak === 'hesap' ? 'Alan / (en x verimlilik) ile hesaplandı' : 'Accuplan MadeLength (gerçekleşen)') +
        '">' + n(r.pastalBoyu, 3) + '</td>';
      h += '<td class="num calc">' + n(r.fPastalBoyu, 3) + '</td>';
      h += '<td class="num calc">' + n(r.birimMetraj, 4) + '</td>';
      h += '<td class="num calc">' + n(r.kumasSarf, 2) + '</td>';
      var vBaslik = r.madeVerimlilik
        ? 'Gerçekleşen (MadeUtilization) · planlanan ' + pct(r.planVerimlilik)
        : 'Planlanan verimlilik (Accuplan Utilization)';
      h += '<td class="num" title="' + esc(vBaslik) + '">' + pct(r.verimlilik) + '</td>';
      h += '<td class="num calc">' + n(r.serimSuresi, 1) + '</td>';
      h += '<td class="num calc">' + n(r.kesimSuresi, 1) + '</td>';
      h += '</tr>';
    });

    if (!plan.rows.length) {
      h += '<tr><td class="empty" colspan="' + total + '">Bu kumaş planında onaylı pastal yok.</td></tr>';
    }

    // TOPLAM ASORTİ
    h += '<tr class="sum"><th class="lbl">TOPLAM ASORTİ</th>';
    $.each(rapor.sizeIds, function (i, id) { h += '<td class="num">' + int(t.asorti[id]) + '</td>'; });
    h += '<td class="num">' + int(t.isAdeti) + '</td><td class="num">' + int(t.katSayisi) + '</td>' +
      '<td class="num">' + int(t.serim) + '</td><td class="num">' + int(t.toplamAdet) + '</td>' +
      '<td class="num">' + n(t.pastalBoyu, 3) + '</td><td class="num">' + n(t.fPastalBoyu, 3) + '</td>' +
      '<td class="num">' + n(t.birimMetraj, 4) + '</td><td class="num">' + n(t.kumasSarf, 2) + '</td>' +
      '<td class="num">' + pct(t.verimlilik) + '</td><td class="num">' + n(t.serimSuresi, 1) + '</td>' +
      '<td class="num">' + n(t.kesimSuresi, 1) + '</td></tr>';

    // TOPLAM KESİM
    h += '<tr class="sum strong"><th class="lbl">TOPLAM KESİM</th>';
    $.each(rapor.sizeIds, function (i, id) { h += '<td class="num">' + int(t.kesim[id]) + '</td>'; });
    h += bosHucre(3) + '<td class="num">' + int(t.kesimToplam) + '</td>' + bosHucre(7) + '</tr>';

    // KESİM FARKI
    h += '<tr class="diff"><th class="lbl">KESİM FARKI</th>';
    $.each(rapor.sizeIds, function (i, id) {
      var d = t.fark[id];
      h += '<td class="num ' + (d > 0 ? 'pos' : (d < 0 ? 'neg' : '')) + '">' + (d ? n(d, 0) : '0') + '</td>';
    });
    h += bosHucre(3) + '<td class="num ' + (t.farkToplam ? (t.farkToplam > 0 ? 'pos' : 'neg') : '') + '">' +
      n(t.farkToplam, 0) + '</td>' + bosHucre(7) + '</tr>';

    // BEDEN DAĞILIMI %
    h += '<tr class="dist"><th class="lbl">BEDEN DAĞILIMI %</th>';
    $.each(rapor.sizeIds, function (i, id) { h += '<td class="num">' + pct(t.dagilim[id], 1) + '</td>'; });
    h += bosHucre(nMeta) + '</tr>';

    h += '</tbody></table>';
    return h;
  }

  function renderPlan(rapor, plan, index) {
    var t = plan.totals;
    return '' +
      '<section class="ap-sheet" data-plan="' + index + '">' +
      '  <h2><span class="tag">KESİM-' + (index + 1) + '</span> ' + esc(plan.fabric) +
      '      <small>' + n(plan.rows.length, 0) + ' pastal · ' + n(t.kumasSarf, 2) + ' m kumaş · verimlilik ' + pct(t.verimlilik) + '</small></h2>' +
         renderHeaderBlock(rapor, plan) +
         renderCutTable(rapor, plan) +
      '  <p class="note">Pastal boyu: <b>' + (plan.rows.length && plan.rows[0].pastalBoyuKaynak === 'made' ? 'gerçekleşen (MadeLength)' : 'alan/(en × verimlilik) ile hesaplanan') + '</b> · ' +
      '     Pastal payı (EndLoss): ' + n(plan.pastalPayi, 3) + ' m · Kumaş eni: ' + n(plan.width.cm, 1) + ' cm' +
             (plan.calculationDate ? ' · Hesaplama: ' + esc(plan.calculationDate) : '') + '</p>' +
      '</section>';
  }

  function renderOzet(rapor) {
    var g = rapor.genel;
    var h = '<section class="ap-sheet ap-ozet">' +
      '<h2><span class="tag">ÖZET</span> ' + esc(rapor.info.workOrderNumber) + '</h2>' +
      '<div class="kpi">' +
      '  <div><span>İŞ EMRİ</span><b>' + esc(rapor.info.workOrderNumber) + '</b></div>' +
      '  <div><span>MODEL</span><b>' + esc(rapor.model.name) + '</b></div>' +
      '  <div><span>İŞ EMRİ ADEDİ</span><b>' + int(rapor.siparisToplam) + '</b></div>' +
      '  <div><span>TOPLAM PASTAL</span><b>' + int(g.pastalSayisi) + '</b></div>' +
      '  <div><span>TOPLAM KUMAŞ</span><b>' + n(g.kumasSarf, 2) + ' m</b></div>' +
      '  <div><span>AĞIRLIKLI VERİMLİLİK</span><b>' + pct(g.verimlilik) + '</b></div>' +
      '</div>' +
      '<table class="ap-grid ap-summary"><thead><tr>' +
      '<th class="lbl">Kesim Planı</th><th>Pastal</th><th>Toplam Kat</th><th>Serim</th><th>Kesim Adedi</th>' +
      '<th>Kumaş Sarfı (m)</th><th>Verimlilik</th><th>Serim Süresi (dk)</th><th>Kesim Süresi (dk)</th>' +
      '</tr></thead><tbody>';

    $.each(rapor.visiblePlans, function (i, p) {
      var t = p.totals;
      h += '<tr><th class="lbl">' + esc(p.fabric) + '</th>' +
        '<td class="num">' + int(t.pastalSayisi) + '</td>' +
        '<td class="num">' + int(t.katSayisi) + '</td>' +
        '<td class="num">' + int(t.serim) + '</td>' +
        '<td class="num">' + int(t.kesimToplam) + '</td>' +
        '<td class="num">' + n(t.kumasSarf, 2) + '</td>' +
        '<td class="num">' + pct(t.verimlilik) + '</td>' +
        '<td class="num">' + n(t.serimSuresi, 1) + '</td>' +
        '<td class="num">' + n(t.kesimSuresi, 1) + '</td></tr>';
    });

    h += '<tr class="sum strong"><th class="lbl">GENEL</th>' +
      '<td class="num">' + int(g.pastalSayisi) + '</td>' +
      '<td class="num">' + int(g.katSayisi) + '</td>' +
      '<td class="num">' + int(g.serim) + '</td>' +
      '<td class="num">' + int(g.toplamAdet) + '</td>' +
      '<td class="num">' + n(g.kumasSarf, 2) + '</td>' +
      '<td class="num">' + pct(g.verimlilik) + '</td>' +
      '<td class="num">' + n(g.serimSuresi, 1) + '</td>' +
      '<td class="num">' + n(g.kesimSuresi, 1) + '</td></tr></tbody></table>';

    // Beden dagilimi
    h += '<h3>BEDEN DAĞILIMI</h3><table class="ap-grid ap-dist"><thead><tr><th class="lbl">Beden</th>';
    $.each(rapor.sizeIds, function (i, id) {
      h += '<th>' + esc(rapor.sizeById[id] ? rapor.sizeById[id].label : id) + '</th>';
    });
    h += '<th class="tot">TOPLAM</th></tr></thead><tbody><tr><th class="lbl">İş Emri Adedi</th>';
    $.each(rapor.sizeIds, function (i, id) { h += '<td class="num">' + int(rapor.siparis[id]) + '</td>'; });
    h += '<td class="num tot">' + int(rapor.siparisToplam) + '</td></tr>';
    h += '<tr><th class="lbl">Dağılım %</th>';
    $.each(rapor.sizeIds, function (i, id) {
      var q = rapor.siparis[id] || 0;
      h += '<td class="num">' + pct(rapor.siparisToplam ? q / rapor.siparisToplam : 0, 1) + '</td>';
    });
    h += '<td class="num tot">100,0%</td></tr></tbody></table>';

    h += '</section>';
    return h;
  }

  function render($target, rapor) {
    var html = renderOzet(rapor);
    $.each(rapor.visiblePlans, function (i, plan) { html += renderPlan(rapor, plan, i); });
    $target.html(html);
  }

  window.AccuplanRender = { render: render, format: { n: n, pct: pct, int: int, dateText: dateText } };
})(window, jQuery);
