/*
 * accuplan-parser.js
 * -------------------------------------------------------------------------
 * [Accuplan].[dbo].[WorkOrder].[document] icindeki XML'i jQuery ile ayristirip
 * kesimhane asorti sablonunun (KESIM-1..n + OZET) ihtiyac duydugu modele cevirir.
 *
 * Accuplan olculeri inch cinsinden tutar:
 *   Fabric/@Width, Marker/@MadeLength, Bundle/@Area, Bundle/@Perimeter ...
 * Rapor metre / cm cinsinden gosterilir.
 *
 * Pastal boyu:
 *   Marker/@MadeLength varsa dogrudan kullanilir (gerceklesen pastal).
 *   Yoksa   boy = (asortideki parcalarin toplam alani) / (kumas eni * verimlilik)
 *   formulu ile hesaplanir. (Ornek IFS9599-DK / CP-01 pastalinda bu formul
 *   MadeLength=62.70325 degerini birebir dogrular.)
 */
(function (window, $) {
  'use strict';

  var IN_TO_M = 0.0254;
  var IN_TO_CM = 2.54;

  function round(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return value;
    var f = Math.pow(10, digits);
    return Math.round(value * f) / f;
  }

  function num(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback === undefined ? null : fallback;
    var n = parseFloat(String(value).replace(',', '.'));
    return isNaN(n) ? (fallback === undefined ? null : fallback) : n;
  }

  function text($node) {
    return $node && $node.length ? $.trim($node.first().text()) : '';
  }

  // "10/21/2024 13:45:40" (Accuplan MM/dd/yyyy) -> Date
  function parseAccuplanDate(value) {
    if (!value) return null;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec($.trim(value));
    if (m) {
      return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function collectFabricCodes($parent) {
    var codes = [];
    $parent.children('FabricCodes').children('Code').each(function () {
      var c = $.trim($(this).text());
      if (c) codes.push(c);
    });
    return codes;
  }

  function parseSizes($model) {
    var sizes = [];
    $model.find('SizeLine > Size').each(function () {
      var $s = $(this);
      sizes.push({
        id: String($s.attr('Id')),
        label: $.trim($s.text()),
        active: String($s.attr('Active')) === 'true'
      });
    });
    return sizes;
  }

  function parseBundleMeasures($input) {
    var map = {};
    $input.children('BundleMeasures').children('Bundle').each(function () {
      var $b = $(this);
      map[String($b.attr('SizeId'))] = {
        area: num($b.attr('Area'), 0),
        perimeter: num($b.attr('Perimeter'), 0),
        pieceQuantity: num($b.attr('PieceQuantity'), 0)
      };
    });
    return map;
  }

  function parseOrder($input) {
    // Renk bazli siparis adetleri; sablon tek satirda toplami gosterir.
    var total = {};
    var colors = [];
    $input.children('Color').each(function () {
      var $c = $(this);
      var color = { name: $c.attr('Name') || 'Color', quantities: {}, total: 0 };
      $c.children('Bundle').each(function () {
        var $b = $(this);
        var id = String($b.attr('SizeId'));
        var q = num($b.attr('Quantity'), 0) || 0;
        color.quantities[id] = (color.quantities[id] || 0) + q;
        color.total += q;
        total[id] = (total[id] || 0) + q;
      });
      colors.push(color);
    });
    return { total: total, colors: colors };
  }

  function parseCostSettings($plan) {
    var $c = $plan.children('CostSettings');
    return {
      currency: $c.attr('CurrencyCode') || '',
      cutSpeed: num(text($c.children('CuttingCutSpeed')), 0),          // inch/dk
      bundleRemoveTime: num(text($c.children('CuttingTimeToRemoveBundle')), 0),
      spreadSpeed: num(text($c.children('SpreadingSpreadSpeed')), 0),  // inch/dk
      spreadSetupTime: num(text($c.children('SpreadingSpreadSetupTime')), 0),
      rollSetupTime: num(text($c.children('SpreadingRollSetupTime')), 0),
      turnTime: num(text($c.children('SpreadingTurnTime')), 0)
    };
  }

  function parseSpreadSets($ms) {
    var sets = [];
    $ms.children('SpreadSets').children('SpreadSet').each(function () {
      var $set = $(this);
      var plies = 0;
      var plySets = [];
      $set.children('plySet, PlySet').each(function () {
        var $p = $(this);
        var q = num($p.attr('PlyQuantity'), 0) || 0;
        plies += q;
        plySets.push({ color: $p.attr('Color') || '', shade: $p.attr('Shade') || '', plyQuantity: q });
      });
      sets.push({
        id: $set.attr('Id') || '',
        spreadQuantity: num($set.attr('SpreadQuantity'), 1) || 1,
        plyQuantity: plies,
        plySets: plySets
      });
    });
    return sets;
  }

  /** Pastal satiri (sablondaki 1..n. PASTAL satirlari) */
  function buildMarkerRow(ctx) {
    var marker = ctx.marker;
    var set = ctx.spreadSet;
    var measures = ctx.measures;
    var pastalPayiM = ctx.pastalPayiM;

    var pieces = 0;      // is adeti (P) - bir kattaki toplam asorti adedi
    var areaIn2 = 0;
    var perimeterIn = 0;
    $.each(marker.section, function (sizeId, qty) {
      pieces += qty;
      var m = measures[sizeId];
      if (m) {
        areaIn2 += (m.area || 0) * qty;
        perimeterIn += (m.perimeter || 0) * qty;
      }
    });

    var utilization = marker.madeUtilization || marker.utilization || 0;
    var widthIn = marker.widthIn || ctx.fabricWidthIn || 0;

    var lengthIn = marker.madeLength;
    var lengthSource = 'made';
    if (!lengthIn) {
      lengthSource = 'hesap';
      lengthIn = (areaIn2 > 0 && widthIn > 0 && utilization > 0) ? areaIn2 / (widthIn * utilization) : null;
    }

    var kat = set ? set.plyQuantity : 0;
    var serim = set ? set.spreadQuantity : 1;
    // Once mm hassasiyetine yuvarlanir; turev degerler (fire payli boy, sarf) bu
    // degerden uretilir ki Excel'de formul yeniden hesaplandiginda sonuc degismesin.
    var pastalBoyuM = lengthIn === null ? null : round(lengthIn * IN_TO_M, 4);
    var fPastalBoyuM = pastalBoyuM === null ? null : round(pastalBoyuM + (pastalPayiM || 0), 4);

    var cost = ctx.cost;
    var serimSuresi = null;
    if (cost.spreadSpeed > 0 && lengthIn !== null && kat > 0) {
      serimSuresi = serim * ((cost.spreadSetupTime || 0) + kat * (lengthIn / cost.spreadSpeed + (cost.turnTime || 0)));
    }
    var kesimSuresi = null;
    if (cost.cutSpeed > 0 && perimeterIn > 0) {
      kesimSuresi = serim * (perimeterIn / cost.cutSpeed + pieces * (cost.bundleRemoveTime || 0));
    }

    return {
      name: marker.name,
      customName: marker.customName,
      orderNumber: marker.orderNumber,
      spreadSetId: set ? set.id : '',
      colors: set ? set.plySets : [],
      layLimits: marker.layLimits,
      spreadMethod: marker.spreadMethod,
      isApproved: marker.isApproved,
      isShortMarker: marker.isShortMarker,
      isRollEnd: marker.isRollEnd,

      asorti: marker.section,              // { sizeId: adet }
      isAdeti: pieces,                     // P
      katSayisi: kat,                      // Q
      serim: serim,                        // R
      toplamAdet: pieces * kat * serim,    // S
      pastalBoyu: pastalBoyuM,             // T (m)
      pastalBoyuKaynak: lengthSource,
      fPastalBoyu: fPastalBoyuM,           // U (m)
      birimMetraj: (pastalBoyuM !== null && pieces > 0) ? pastalBoyuM / pieces : null, // V
      kumasSarf: (fPastalBoyuM === null) ? null : fPastalBoyuM * kat * serim,          // W
      verimlilik: utilization,             // X (gerceklesen varsa o)
      planVerimlilik: marker.utilization || 0,
      madeVerimlilik: marker.madeUtilization || 0,
      serimSuresi: serimSuresi,            // Y (dk)
      kesimSuresi: kesimSuresi,            // Z (dk)
      enCm: round(widthIn * IN_TO_CM, 2),
      alanIn2: areaIn2,
      cevreIn: perimeterIn
    };
  }

  function parseCutPlan($plan, index, options) {
    var $fabric = $plan.children('Fabric').first();
    var $input = $plan.children('Input').first();
    var $result = $plan.children('Result').first();
    var $order = $plan.children('OrderSettings').first();
    var $spread = $plan.children('SpreadSettings').first();
    var $markerSet = $plan.children('MarkerSettings').first();

    var codes = collectFabricCodes($plan);
    var widthIn = num($fabric.attr('Width'), 0) || 0;
    var endLossIn = num($fabric.attr('EndLoss'), 0) || 0;
    var pastalPayiM = options.pastalPayiM !== undefined && options.pastalPayiM !== null
      ? options.pastalPayiM
      : round(endLossIn * IN_TO_M, 4);

    var measures = parseBundleMeasures($input);
    var order = parseOrder($input);
    var cost = parseCostSettings($plan);

    var rows = [];
    $result.children('MarkerSpreadings').children('MarkerSpreading').each(function () {
      var $ms = $(this);
      var $m = $ms.children('Marker').first();
      var section = {};
      $m.children('Section').children('Bundle').each(function () {
        var $b = $(this);
        var id = String($b.attr('SizeId'));
        section[id] = (section[id] || 0) + (num($b.attr('Quantity'), 0) || 0);
      });

      var marker = {
        name: $m.attr('Name') || '',
        customName: $m.attr('CustomName') || '',
        orderNumber: num($m.attr('OrderNumber'), 0),
        widthIn: num($m.attr('Width'), widthIn) || widthIn,
        utilization: num($m.attr('Utilization'), 0) || 0,
        madeUtilization: num($m.attr('MadeUtilization'), 0) || 0,
        madeLength: num($m.attr('MadeLength'), 0) || 0,
        layLimits: $m.attr('LayLimits') || '',
        spreadMethod: $m.attr('SpreadMethod') || '',
        isApproved: String($ms.attr('IsApproved')) === 'true',
        isRollEnd: String($ms.attr('IsRollEnd')) === 'true',
        isShortMarker: String($ms.attr('IsShortMarker')) === 'true',
        section: section
      };

      var sets = parseSpreadSets($ms);
      if (!sets.length) sets = [null];
      $.each(sets, function (i, set) {
        rows.push(buildMarkerRow({
          marker: marker,
          spreadSet: set,
          measures: measures,
          cost: cost,
          fabricWidthIn: widthIn,
          pastalPayiM: pastalPayiM
        }));
      });
    });

    rows.sort(function (a, b) { return (a.orderNumber || 0) - (b.orderNumber || 0); });

    return {
      index: index,
      fabricCodes: codes,
      fabric: codes.join(' / ') || ('PLAN-' + (index + 1)),
      isIncluded: $plan.attr('IsIncluded') !== 'false',
      isDisplayed: $plan.attr('IsDisplayed') !== 'false',
      hasMarkers: rows.length > 0,
      width: { inch: widthIn, cm: round(widthIn * IN_TO_CM, 2) },
      endLoss: { inch: endLossIn, m: round(endLossIn * IN_TO_M, 4) },
      pastalPayi: pastalPayiM,
      maxMarkerLength: round((num(text($markerSet.children('MaxMarkerLength')), 0) || 0) * IN_TO_M, 4),
      spreadingMethod: text($spread.children('SpreadingMethod')),
      location: text($spread.children('Location')),
      orderSettings: {
        name: $order.attr('Name') || '',
        annotation: text($order.children('Annotation')),
        layLimits: text($order.children('LayLimits')),
        notch: text($order.children('Notch')),
        blockBuffer: text($order.children('BlockBuffer'))
      },
      cost: cost,
      calculationDate: text($plan.find('ProductionSteps > CalculationDate')),
      generatedDate: text($plan.find('ProductionSteps > GeneratedDate')),
      order: order.total,
      colors: order.colors,
      measures: measures,
      rows: rows
    };
  }

  /** Sablonun toplam satirlarini (TOPLAM ASORTI / TOPLAM KESIM / FARK / DAGILIM) hesaplar */
  function computeTotals(plan, sizeIds) {
    var t = {
      asorti: {}, kesim: {}, fark: {}, dagilim: {},
      isAdeti: 0, katSayisi: 0, serim: 0, toplamAdet: 0,
      pastalBoyu: 0, fPastalBoyu: 0, kumasSarf: 0,
      serimSuresi: 0, kesimSuresi: 0,
      pastalSayisi: plan.rows.length,
      siparisToplam: 0, verimlilik: 0, birimMetraj: 0
    };

    $.each(sizeIds, function (i, id) {
      t.asorti[id] = 0;
      t.kesim[id] = 0;
      t.siparisToplam += plan.order[id] || 0;
    });

    var sarfXverim = 0;
    $.each(plan.rows, function (i, r) {
      $.each(sizeIds, function (j, id) {
        var q = r.asorti[id] || 0;
        t.asorti[id] += q;
        t.kesim[id] += q * r.katSayisi * r.serim;
      });
      t.isAdeti += r.isAdeti;
      t.katSayisi += r.katSayisi * r.serim;
      t.serim += r.serim;
      t.toplamAdet += r.toplamAdet;
      t.pastalBoyu += r.pastalBoyu || 0;
      t.fPastalBoyu += r.fPastalBoyu || 0;
      t.kumasSarf += r.kumasSarf || 0;
      t.serimSuresi += r.serimSuresi || 0;
      t.kesimSuresi += r.kesimSuresi || 0;
      sarfXverim += (r.kumasSarf || 0) * (r.verimlilik || 0);
    });

    t.kesimToplam = 0;
    $.each(sizeIds, function (i, id) {
      t.fark[id] = t.kesim[id] - (plan.order[id] || 0);
      t.dagilim[id] = t.siparisToplam ? (plan.order[id] || 0) / t.siparisToplam : 0;
      t.kesimToplam += t.kesim[id];
    });
    t.farkToplam = t.kesimToplam - t.siparisToplam;
    t.verimlilik = t.kumasSarf ? sarfXverim / t.kumasSarf : 0;
    t.birimMetraj = t.isAdeti ? t.pastalBoyu / t.isAdeti : 0;
    return t;
  }

  /**
   * Ana giris noktasi.
   * @param {string} xmlText  WorkOrder.document icerigi
   * @param {object} [options] { pastalPayiM: 0.04, includeEmptyPlans: false }
   */
  function parse(xmlText, options) {
    options = options || {};
    if (!xmlText || !$.trim(xmlText)) throw new Error('Bos document icerigi.');

    var xml;
    try {
      xml = $.parseXML($.trim(xmlText));
    } catch (e) {
      throw new Error('document sutunu XML olarak okunamadi: ' + e.message);
    }
    var $xml = $(xml);
    var $wo = $xml.find('WorkOrder').first();
    if (!$wo.length) throw new Error('XML icinde <WorkOrder> bulunamadi.');

    var $info = $wo.children('Information').first();
    var $model = $wo.find('Models > Model').first();

    var sizes = parseSizes($model);
    var sizeById = {};
    $.each(sizes, function (i, s) { sizeById[s.id] = s; });

    var plans = [];
    $wo.children('CutPlans').children('CutPlan').each(function (i) {
      plans.push(parseCutPlan($(this), i, options));
    });

    // Sablon tum kesim sayfalarinda ayni beden sutunlarini kullanir:
    // siparisi olan veya herhangi bir pastalda gecen bedenler.
    var used = {};
    $.each(plans, function (i, plan) {
      $.each(plan.order, function (id, qty) { if (qty) used[id] = true; });
      $.each(plan.rows, function (j, row) {
        $.each(row.asorti, function (id, qty) { if (qty) used[id] = true; });
      });
    });
    var sizeIds = Object.keys(used).sort(function (a, b) { return (+a) - (+b); });
    if (!sizeIds.length) {
      sizeIds = $.map(sizes, function (s) { return s.active ? s.id : null; });
    }

    $.each(plans, function (i, plan) {
      plan.totals = computeTotals(plan, sizeIds);
    });

    var visible = $.grep(plans, function (p) {
      return options.includeEmptyPlans ? true : p.hasMarkers;
    });

    var genel = {
      pastalSayisi: 0, katSayisi: 0, serim: 0, toplamAdet: 0,
      kumasSarf: 0, serimSuresi: 0, kesimSuresi: 0, verimlilik: 0
    };
    var sarfXverim = 0;
    $.each(visible, function (i, p) {
      genel.pastalSayisi += p.totals.pastalSayisi;
      genel.katSayisi += p.totals.katSayisi;
      genel.serim += p.totals.serim;
      genel.toplamAdet += p.totals.kesimToplam;
      genel.kumasSarf += p.totals.kumasSarf;
      genel.serimSuresi += p.totals.serimSuresi;
      genel.kesimSuresi += p.totals.kesimSuresi;
      sarfXverim += p.totals.kumasSarf * p.totals.verimlilik;
    });
    genel.verimlilik = genel.kumasSarf ? sarfXverim / genel.kumasSarf : 0;

    var dateReceived = text($info.children('DateReceived'));
    var siparis = visible.length ? visible[0].order : (plans.length ? plans[0].order : {});
    var siparisToplam = 0;
    $.each(sizeIds, function (i, id) { siparisToplam += siparis[id] || 0; });

    return {
      parsedAt: new Date().toISOString(),
      info: {
        workOrderNumber: text($info.children('WorkOrderNumber')),
        company: text($info.children('CompanyName')),
        manager: text($info.children('CutPlanManager')),
        dateReceived: dateReceived,
        dateReceivedIso: (function (d) { return d ? d.toISOString() : null; })(parseAccuplanDate(dateReceived)),
        cutDueDate: text($info.children('CutDueDate')),
        comments: text($info.children('Comments')),
        description: text($info.children('Description')),
        location: text($info.children('WorkOrderLocation'))
      },
      model: {
        name: $model.attr('Name') || text($wo.find('Settings > SelectedModel')),
        baseSize: $model.attr('BaseSize') || '',
        device: $wo.find('Models').attr('Device') || '',
        area: $wo.find('Models').attr('Area') || '',
        fabricCodes: collectFabricCodes($model)
      },
      sizes: sizes,
      sizeById: sizeById,
      sizeIds: sizeIds,
      sizeLabels: $.map(sizeIds, function (id) { return sizeById[id] ? sizeById[id].label : id; }),
      siparis: siparis,
      siparisToplam: siparisToplam,
      plans: plans,
      visiblePlans: visible,
      genel: genel
    };
  }

  window.Accuplan = {
    parse: parse,
    round: round,
    IN_TO_M: IN_TO_M,
    IN_TO_CM: IN_TO_CM,
    parseAccuplanDate: parseAccuplanDate
  };
})(window, jQuery);
