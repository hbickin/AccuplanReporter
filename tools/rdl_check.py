# -*- coding: utf-8 -*-
"""
RDL yapisal kontrolu — Report Builder acmadan once yakalanabilecek hatalar:
  * Tablix govde satir/sutun sayisi, hiyerarsideki yaprak uye sayisiyla uyusuyor mu
  * Her satirdaki hucre sayisi sutun sayisina esit mi
  * Ifadelerdeki Fields!X.Value alanlari ilgili veri kumesinde tanimli mi
  * Parameters!X.Value parametreleri raporda tanimli mi
  * Textbox adlari benzersiz mi
Calistirmak icin:  python3 tools/rdl_check.py [rdl/AccuplanKesimRaporu.rdl]
"""
import re
import sys
import os
import xml.etree.ElementTree as ET

# Report Builder dosyayi kaydettiginde sema surumunu yukseltebilir
# (2010/01 -> 2016/01); ad alanini kok ogeden okuyoruz.
def _ad_alani(dosya):
    for _, el in ET.iterparse(dosya, events=('start',)):
        return el.tag.split('}')[0].lstrip('{') if el.tag.startswith('{') else ''
    return ''

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'rdl', 'AccuplanKesimRaporu.rdl')

NS = {'r': _ad_alani(path)}
Q = lambda t: '{%s}%s' % (NS['r'], t)

tree = ET.parse(path)
root = tree.getroot()
hatalar = []
kontrol = []


def ok(msg):
    kontrol.append('  ok   ' + msg)


def hata(msg):
    hatalar.append(msg)
    kontrol.append('  HATA ' + msg)


uyarilar = []


def uyari(msg):
    uyarilar.append(msg)
    kontrol.append('  uyarı ' + msg)


# --- veri kumeleri ve alanlari ------------------------------------------------
datasets = {}
for ds in root.iter(Q('DataSet')):
    name = ds.get('Name')
    datasets[name] = set(f.get('Name') for f in ds.iter(Q('Field')))
ok('%d veri kümesi: %s' % (len(datasets), ', '.join(sorted(datasets))))

params = set(p.get('Name') for p in root.iter(Q('ReportParameter')))
ok('%d parametre: %s' % (len(params), ', '.join(sorted(params))))


# --- tablix yapisi ------------------------------------------------------------
def yaprak_sayisi(members_el):
    """TablixMembers altindaki yaprak (alt uyesi olmayan) uye sayisi."""
    n = 0
    for m in members_el.findall(Q('TablixMember')):
        alt = m.find(Q('TablixMembers'))
        n += yaprak_sayisi(alt) if alt is not None else 1
    return n


for tablix in root.iter(Q('Tablix')):
    ad = tablix.get('Name')
    body = tablix.find(Q('TablixBody'))
    sutun = len(body.find(Q('TablixColumns')).findall(Q('TablixColumn')))
    satirlar = body.find(Q('TablixRows')).findall(Q('TablixRow'))

    ch = tablix.find(Q('TablixColumnHierarchy')).find(Q('TablixMembers'))
    rh = tablix.find(Q('TablixRowHierarchy')).find(Q('TablixMembers'))
    ch_leaf, rh_leaf = yaprak_sayisi(ch), yaprak_sayisi(rh)

    if sutun != ch_leaf:
        hata('%s: gövde sütun sayısı %d, sütun hiyerarşisi yaprak sayısı %d' % (ad, sutun, ch_leaf))
    elif len(satirlar) != rh_leaf:
        hata('%s: gövde satır sayısı %d, satır hiyerarşisi yaprak sayısı %d' % (ad, len(satirlar), rh_leaf))
    else:
        ok('%s: %d sütun x %d satır, hiyerarşiyle uyumlu' % (ad, sutun, len(satirlar)))

    # --- kose bolgesi ---------------------------------------------------------
    # Hem satir hem sutun basligi varsa TablixCorner zorunludur; satir sayisi
    # sutun hiyerarsisinin, hucre sayisi satir hiyerarsisinin baslikli derinligi
    # kadar olmalidir. Aksi halde Report Builder "invalid TablixCornerCell" der.
    def baslik_derinligi(members_el, seviye=1):
        derin = 0
        for m in members_el.findall(Q('TablixMember')):
            if m.find(Q('TablixHeader')) is not None:
                derin = max(derin, seviye)
            alt = m.find(Q('TablixMembers'))
            if alt is not None:
                derin = max(derin, baslik_derinligi(alt, seviye + 1))
        return derin

    satir_derin, sutun_derin = baslik_derinligi(rh), baslik_derinligi(ch)
    kose = tablix.find(Q('TablixCorner'))
    if satir_derin and sutun_derin:
        onceki_hata = len(hatalar)
        if kose is None:
            hata('%s: satır ve sütun başlığı var, TablixCorner eksik (%dx%d olmalı)'
                 % (ad, sutun_derin, satir_derin))
        else:
            kose_satir = kose.find(Q('TablixCornerRows')).findall(Q('TablixCornerRow'))
            if len(kose_satir) != sutun_derin:
                hata('%s: köşe satır sayısı %d, %d olmalı' % (ad, len(kose_satir), sutun_derin))
            for i, ks in enumerate(kose_satir):
                hucreler = ks.findall(Q('TablixCornerCell'))
                if len(hucreler) != satir_derin:
                    hata('%s: %d. köşe satırında %d hücre var, %d olmalı'
                         % (ad, i + 1, len(hucreler), satir_derin))
                for h in hucreler:
                    if h.find(Q('CellContents')) is None:
                        hata('%s: köşe hücresinde CellContents yok' % ad)
            if len(hatalar) == onceki_hata:
                ok('%s: köşe bölgesi %dx%d' % (ad, sutun_derin, satir_derin))
    elif kose is not None:
        hata('%s: başlık yokken TablixCorner tanımlanmış' % ad)

    for i, satir in enumerate(satirlar):
        hucre = len(satir.find(Q('TablixCells')).findall(Q('TablixCell')))
        if hucre != sutun:
            hata('%s: %d. satırda %d hücre var, %d olmalı' % (ad, i + 1, hucre, sutun))

    # veri bolgesi icindeki alan referanslari kendi veri kumesinde olmali
    dsn = tablix.findtext(Q('DataSetName'))
    if dsn not in datasets:
        hata('%s: tanımsız veri kümesi "%s"' % (ad, dsn))
        continue
    for deger in tablix.iter(Q('Value')):
        for alan in re.findall(r'Fields!(\w+)\.Value', deger.text or ''):
            if alan not in datasets[dsn]:
                hata('%s: "%s" alanı %s veri kümesinde yok' % (ad, alan, dsn))
    for pname in tablix.iter():
        if pname.tag == Q('PageName'):
            for alan in re.findall(r'Fields!(\w+)\.Value', pname.text or ''):
                if alan not in datasets[dsn]:
                    hata('%s: PageName içindeki "%s" alanı %s içinde yok' % (ad, alan, dsn))

# --- olcu birimleri -----------------------------------------------------------
# RDL yalnizca in / mm / cm / pt / pc kabul eder. "3.45cmcm" gibi bir deger
# Report Builder'da "gecerli bir birim gostergesi degil" hatasi verir.
OLCU_ETIKET = {
    'Top', 'Left', 'Height', 'Width', 'Size', 'PageHeight', 'PageWidth',
    'LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin', 'ColumnSpacing',
    'InteractiveHeight', 'InteractiveWidth', 'FontSize',
    'PaddingLeft', 'PaddingRight', 'PaddingTop', 'PaddingBottom',
}
OLCU_DESEN = re.compile(r'^-?\d+(\.\d+)?(in|mm|cm|pt|pc)$')
olcu_sayisi = 0
for el in root.iter():
    etiket = el.tag.split('}')[-1]
    if etiket not in OLCU_ETIKET:
        continue
    metin = (el.text or '').strip()
    if not metin or metin.startswith('='):   # ifade olabilir
        continue
    # <Border><Width> gibi ic ogeler de olcu; <Size> yalnizca TablixHeader icinde
    olcu_sayisi += 1
    if not OLCU_DESEN.match(metin):
        hata('geçersiz ölçü değeri <%s>%s</%s>' % (etiket, metin, etiket))
ok('%d ölçü değeri geçerli birimde (in/mm/cm/pt/pc)' % olcu_sayisi)

# --- gövdedeki serbest textbox'lar: kapsam belirtilmis alan referanslari -------
govde_ifade = 0
for tb in root.iter(Q('Textbox')):
    for deger in tb.iter(Q('Value')):
        metin = deger.text or ''
        for alan, ds in re.findall(r'Fields!(\w+)\.Value\s*,\s*"(\w+)"', metin):
            govde_ifade += 1
            if ds not in datasets:
                hata('%s: tanımsız veri kümesi "%s"' % (tb.get('Name'), ds))
            elif alan not in datasets[ds]:
                hata('%s: "%s" alanı %s içinde yok' % (tb.get('Name'), alan, ds))
        for p in re.findall(r'Parameters!(\w+)\.Value', metin):
            if p not in params:
                hata('%s: tanımsız parametre "%s"' % (tb.get('Name'), p))
ok('%d kapsam belirtilmiş alan referansı doğrulandı' % govde_ifade)

# --- sorgu parametreleri ------------------------------------------------------
for qp in root.iter(Q('QueryParameter')):
    for p in re.findall(r'Parameters!(\w+)\.Value', qp.findtext(Q('Value')) or ''):
        if p not in params:
            hata('Sorgu parametresi tanımsız: %s' % p)
ok('sorgu parametreleri doğrulandı')

# --- parametre paneli izgarasi ------------------------------------------------
# SSRS, GIZLI parametreler dahil TUM parametreler icin hucre ister; yetmezse
# "The parameter panel layout ... contains more parameters than total cells available".
yerlesim = root.find(Q('ReportParametersLayout'))
if yerlesim is None:
    ok('parametre paneli düzeni tanımsız (SSRS varsayılan yerleşimi kullanılır)')
else:
    izgara = yerlesim.find(Q('GridLayoutDefinition'))
    sutun = int(izgara.findtext(Q('NumberOfColumns')) or 0)
    satir = int(izgara.findtext(Q('NumberOfRows')) or 0)
    hucreler = list(izgara.iter(Q('CellDefinition')))
    yerlesenler = [h.findtext(Q('ParameterName')) for h in hucreler]
    onceki = len(hatalar)
    if sutun * satir < len(params):
        hata('parametre paneli %dx%d = %d hücre, %d parametre için yetersiz'
             % (sutun, satir, sutun * satir, len(params)))
    eksik = [p for p in params if p not in yerlesenler]
    if eksik:
        hata('parametre paneline yerleştirilmemiş: %s' % ', '.join(sorted(eksik)))
    fazla = [p for p in yerlesenler if p not in params]
    if fazla:
        hata('panelde tanımsız parametre: %s' % ', '.join(sorted(set(fazla))))
    konumlar = [(h.findtext(Q('ColumnIndex')), h.findtext(Q('RowIndex'))) for h in hucreler]
    if len(set(konumlar)) != len(konumlar):
        hata('aynı hücreye birden fazla parametre konulmuş')
    if len(hatalar) == onceki:
        ok('parametre paneli %dx%d, %d parametrenin tamamı yerleşik' % (sutun, satir, len(params)))

# --- sayfa ustbilgisi/altbilgisi ----------------------------------------------
# SSRS kurali: header/footer icinde veri kumesi alanlari (Fields!) kullanilamaz.
for bolge_adi in ('PageHeader', 'PageFooter'):
    for bolge in root.iter(Q(bolge_adi)):
        for deger in bolge.iter(Q('Value')):
            alanlar = re.findall(r'Fields!(\w+)\.Value', deger.text or '')
            if alanlar:
                hata('%s içinde veri kümesi alanı kullanılamaz: %s'
                     % (bolge_adi, ', '.join(sorted(set(alanlar)))))
ok('sayfa üstbilgi/altbilgisinde veri kümesi alanı yok')

# --- govde duzeyindeki serbest ogeler -----------------------------------------
# Genisleyen bir tablix sayfanin yatay izgarasini genisletir; ayni hizada Left>0
# ile duran serbest ogeler saga itilir. Cozum: Rectangle icine almak.
govde = root.find(Q('ReportSections')).find(Q('ReportSection')).find(Q('Body'))
serbest = 0
for it in govde.find(Q('ReportItems')):
    sol = (it.findtext(Q('Left')) or '0cm').strip()
    try:
        deger = float(re.sub(r'[a-z]+$', '', sol))
    except ValueError:
        deger = 0.0
    if deger > 0 and it.tag != Q('Rectangle'):
        serbest += 1
        uyari('%s gövde düzeyinde Left=%s ile duruyor; genişleyen tablix onu sağa itebilir'
              % (it.get('Name'), sol))
if not serbest:
    ok('gövde düzeyinde Left=0 dışında serbest öğe yok')

# --- benzersiz adlar ----------------------------------------------------------
adlar = [tb.get('Name') for tb in root.iter(Q('Textbox'))]
tekrar = set(a for a in adlar if adlar.count(a) > 1)
if tekrar:
    hata('tekrarlayan Textbox adı: %s' % ', '.join(sorted(tekrar)))
else:
    ok('%d Textbox adı benzersiz' % len(adlar))

print('\n'.join(kontrol))
print('')
if hatalar:
    print('%d hata' % len(hatalar))
elif uyarilar:
    print('RDL yapısal kontrolleri başarılı (%d uyarı).' % len(uyarilar))
else:
    print('RDL yapısal kontrolleri başarılı.')
sys.exit(1 if hatalar else 0)
