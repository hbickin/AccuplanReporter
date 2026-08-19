/*
 * app.js — arayuz akisi
 * -------------------------------------------------------------------------
 * 1) Is emri listesi cekilir (İŞEMRİ NO secimi = WorkOrder.name)
 * 2) Secilen is emrinin document (XML) icerigi alinir
 * 3) jQuery ile ayristirilip sablon duzeninde ekrana basilir
 * 4) Rapor is emri adiyla sunucuda saklanabilir / geri yuklenebilir
 * 5) Tek tusla Excel'e aktarilir
 */
(function (window, $) {
  'use strict';

  // index.html cift tiklanarak (file://) acildiginda sunucu yoktur: veritabani
  // uclari devre disi kalir, rapor yalnizca XML/JSON dosyasindan uretilir.
  var OFFLINE = window.location.protocol === 'file:';

  var state = {
    workOrders: [],
    xml: '',
    rapor: null,
    name: '',
    demo: false,
    kaynak: ''
  };

  function toast(message, type) {
    var $t = $('<div class="toast ' + (type || 'info') + '"></div>').text(message);
    $('#toasts').append($t);
    window.setTimeout(function () { $t.addClass('out'); }, 3200);
    window.setTimeout(function () { $t.remove(); }, 3800);
  }

  function busy(on, text) {
    $('#busy').toggleClass('show', !!on).find('span').text(text || 'Yükleniyor...');
  }

  function apiError(xhr, fallback) {
    var msg = fallback || 'İşlem başarısız.';
    try {
      var body = JSON.parse(xhr.responseText);
      if (body && body.error) msg = body.error;
    } catch (e) { /* yoksay */ }
    toast(msg, 'error');
  }

  // --- Is emri listesi -----------------------------------------------------

  function fillWorkOrderSelect(items, filter) {
    var $sel = $('#wo-select');
    var current = $sel.val();
    var f = ($.trim(filter || '')).toLocaleUpperCase('tr-TR');
    $sel.empty().append('<option value="">— iş emri seçin —</option>');
    var count = 0;
    $.each(items, function (i, w) {
      var name = w.name || w.number;
      if (!name) return;
      if (f && name.toLocaleUpperCase('tr-TR').indexOf(f) === -1 &&
        String(w.models || '').toLocaleUpperCase('tr-TR').indexOf(f) === -1) return;
      var label = name + (w.models ? '  —  ' + w.models : '') + (w.fabric_codes ? '  (' + w.fabric_codes + ')' : '');
      $sel.append($('<option/>').attr('value', name).text(label));
      count++;
    });
    if (current) $sel.val(current);
    $('#wo-count').text(count + ' iş emri');
  }

  function loadWorkOrders() {
    if (OFFLINE) return $.Deferred().resolve().promise();
    busy(true, 'İş emirleri okunuyor...');
    return $.getJSON('/api/workorders')
      .done(function (res) {
        state.workOrders = res.items || [];
        state.demo = !!res.demo;
        fillWorkOrderSelect(state.workOrders, $('#wo-filter').val());
      })
      .fail(function (xhr) { apiError(xhr, 'İş emri listesi alınamadı.'); })
      .always(function () { busy(false); });
  }

  function loadHealth() {
    if (OFFLINE) {
      $('#mode-badge').addClass('demo').text('ÇEVRİMDIŞI · dosyadan rapor');
      $('#wo-filter, #wo-select, #btn-load, #btn-refresh').prop('disabled', true);
      $('#wo-select').empty().append('<option>— sunucu yok, XML dosyası yükleyin —</option>');
      $('#saved-select').empty().append('<option>— sunucu yok —</option>').prop('disabled', true);
      $('#btn-open, #btn-delete').prop('disabled', true);
      $('#file-xml').attr('accept', '.xml,.json,text/xml,application/xml,application/json');
      $('label[for=file-xml]').text('XML / kayıtlı JSON dosyası');
      return $.Deferred().resolve().promise();
    }
    return $.getJSON('/api/health').done(function (h) {
      state.demo = h.demo;
      $('#mode-badge')
        .toggleClass('demo', h.demo)
        .text(h.demo ? 'DEMO (örnek dosya)' : 'MSSQL · ' + h.server + ' / ' + h.database);
    });
  }

  // --- Rapor olusturma -----------------------------------------------------

  function options() {
    var pay = $.trim($('#opt-pay').val());
    var o = { includeEmptyPlans: $('#opt-bos').is(':checked') };
    if (pay !== '') {
      var v = parseFloat(pay.replace(',', '.'));
      if (!isNaN(v)) o.pastalPayiM = v;
    }
    return o;
  }

  function renderCurrent() {
    if (!state.xml) return;
    try {
      state.rapor = window.Accuplan.parse(state.xml, options());
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    window.AccuplanRender.render($('#report'), state.rapor);
    $('#report-actions').show();
    $('#empty-state').hide();
    var p = state.rapor.visiblePlans.length;
    $('#report-meta').text(
      state.rapor.info.workOrderNumber + ' · ' + p + ' kesim planı · ' +
      state.rapor.genel.pastalSayisi + ' pastal · ' + state.kaynak
    );
    document.title = state.rapor.info.workOrderNumber + ' — Kesimhane Asorti Raporu';
  }

  function loadWorkOrder(name) {
    if (!name) { toast('Önce bir İŞEMRİ NO seçin.', 'error'); return; }
    busy(true, name + ' dokümanı okunuyor...');
    $.getJSON('/api/workorders/' + encodeURIComponent(name) + '/document')
      .done(function (res) {
        state.xml = res.xml || '';
        state.name = res.name || name;
        state.kaynak = res.demo ? 'kaynak: örnek dosya' : 'kaynak: veritabanı (id ' + (res.id || '?') + ')';
        renderCurrent();
        toast(state.name + ' raporu oluşturuldu.', 'ok');
      })
      .fail(function (xhr) { apiError(xhr, 'İş emri dokümanı okunamadı.'); })
      .always(function () { busy(false); });
  }

  // Veritabanina erisim olmadiginda: elle alinmis document XML'ini dosyadan oku
  function loadFromFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var icerik = String(e.target.result || '');
      state.name = file.name.replace(/\.(xml|json)$/i, '');
      state.kaynak = 'kaynak: ' + file.name;

      if (/\.json$/i.test(file.name)) {          // daha once kaydedilmis rapor
        var payload;
        try {
          payload = JSON.parse(icerik);
        } catch (err) {
          toast('JSON okunamadı: ' + err.message, 'error');
          return;
        }
        if (payload.options) {
          $('#opt-bos').prop('checked', !!payload.options.includeEmptyPlans);
          if (payload.options.pastalPayiM !== undefined) $('#opt-pay').val(payload.options.pastalPayiM);
        }
        state.xml = payload.xml || '';
        if (state.xml) {
          renderCurrent();
        } else if (payload.rapor) {
          state.rapor = payload.rapor;
          window.AccuplanRender.render($('#report'), state.rapor);
          $('#report-actions').show();
          $('#empty-state').hide();
        } else {
          toast('Dosyada rapor verisi yok.', 'error');
          return;
        }
      } else {
        state.xml = icerik;
        renderCurrent();
      }
      toast(file.name + ' okundu.', 'ok');
    };
    reader.onerror = function () { toast('Dosya okunamadı.', 'error'); };
    reader.readAsText(file, 'utf-8');
  }

  // --- Kaydetme / geri yukleme --------------------------------------------

  function saveReport() {
    if (!state.rapor) { toast('Önce rapor oluşturun.', 'error'); return; }
    var name = state.name || state.rapor.info.workOrderNumber;

    if (OFFLINE) {   // sunucu yok: rapor dosya olarak indirilir
      var payload = { workOrder: name, savedAt: new Date().toISOString(), rapor: state.rapor, xml: state.xml, options: options() };
      window.saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), name + '.json');
      toast(name + '.json indirildi. Geri yüklemek için dosya alanından seçin.', 'ok');
      return;
    }
    busy(true, 'Kaydediliyor...');
    $.ajax({
      url: '/api/reports/' + encodeURIComponent(name),
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ rapor: state.rapor, xml: state.xml, options: options() })
    })
      .done(function (res) {
        toast(name + ' kaydedildi (' + res.file + ')', 'ok');
        loadSavedList();
      })
      .fail(function (xhr) { apiError(xhr, 'Rapor kaydedilemedi.'); })
      .always(function () { busy(false); });
  }

  function loadSavedList() {
    if (OFFLINE) return $.Deferred().resolve().promise();
    return $.getJSON('/api/reports').done(function (res) {
      var $sel = $('#saved-select').empty().append('<option value="">— kayıtlı rapor —</option>');
      $.each(res.items || [], function (i, r) {
        var d = new Date(r.savedAt);
        $sel.append($('<option/>').attr('value', r.name)
          .text(r.name + '  (' + d.toLocaleString('tr-TR') + ')'));
      });
      $('#saved-count').text((res.items || []).length + ' kayıt');
    });
  }

  function openSaved(name) {
    if (!name) { toast('Kayıtlı bir rapor seçin.', 'error'); return; }
    busy(true, 'Kayıtlı rapor açılıyor...');
    $.getJSON('/api/reports/' + encodeURIComponent(name))
      .done(function (res) {
        var payload = res.report || {};
        state.name = name;
        state.xml = payload.xml || '';
        if (payload.options) {
          $('#opt-bos').prop('checked', !!payload.options.includeEmptyPlans);
          if (payload.options.pastalPayiM !== undefined) $('#opt-pay').val(payload.options.pastalPayiM);
        }
        state.kaynak = 'kaynak: kayıtlı dosya (' + new Date(payload.savedAt).toLocaleString('tr-TR') + ')';
        if (state.xml) {
          renderCurrent();
        } else if (payload.rapor) {
          state.rapor = payload.rapor;
          window.AccuplanRender.render($('#report'), state.rapor);
          $('#report-actions').show();
          $('#empty-state').hide();
        }
        $('#wo-select').val(name);
        toast(name + ' kayıtlı raporu açıldı.', 'ok');
      })
      .fail(function (xhr) { apiError(xhr, 'Kayıtlı rapor açılamadı.'); })
      .always(function () { busy(false); });
  }

  function deleteSaved(name) {
    if (!name) return;
    if (!window.confirm(name + ' kaydı silinsin mi?')) return;
    $.ajax({ url: '/api/reports/' + encodeURIComponent(name), method: 'DELETE' })
      .done(function () { toast(name + ' silindi.', 'ok'); loadSavedList(); })
      .fail(function (xhr) { apiError(xhr, 'Kayıt silinemedi.'); });
  }

  // --- Excel ---------------------------------------------------------------

  function exportExcel() {
    if (!state.rapor) { toast('Önce rapor oluşturun.', 'error'); return; }
    busy(true, 'Excel hazırlanıyor...');
    window.AccuplanExcel.download(state.rapor)
      .then(function () { busy(false); toast('Excel dosyası indirildi.', 'ok'); })
      .catch(function (err) { busy(false); toast('Excel oluşturulamadı: ' + err.message, 'error'); });
  }

  function downloadXml() {
    if (!state.xml) { toast('Önce rapor oluşturun.', 'error'); return; }
    var blob = new Blob([state.xml], { type: 'application/xml;charset=utf-8' });
    window.saveAs(blob, (state.name || 'isemri') + '-document.xml');
  }

  // --- Baglantilar ---------------------------------------------------------

  $(function () {
    loadHealth().always(function () {
      loadWorkOrders();
      loadSavedList();
    });

    $('#wo-filter').on('input', function () {
      fillWorkOrderSelect(state.workOrders, $(this).val());
    });
    $('#btn-refresh').on('click', function () { loadWorkOrders(); loadSavedList(); });
    $('#btn-load').on('click', function () { loadWorkOrder($('#wo-select').val()); });
    $('#wo-select').on('change', function () { if ($(this).val()) loadWorkOrder($(this).val()); });
    $('#file-xml').on('change', function () { loadFromFile(this.files && this.files[0]); });
    $('#btn-save').on('click', saveReport);
    $('#btn-open').on('click', function () { openSaved($('#saved-select').val()); });
    $('#btn-delete').on('click', function () { deleteSaved($('#saved-select').val()); });
    $('#btn-excel').on('click', exportExcel);
    $('#btn-xml').on('click', downloadXml);
    $('#btn-print').on('click', function () { window.print(); });
    $('#opt-pay, #opt-bos').on('change', function () { if (state.xml) renderCurrent(); });
  });

  window.AccuplanApp = { state: state, render: renderCurrent };
})(window, jQuery);
