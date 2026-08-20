# Kesimhane Asorti Raporu — SSRS / RDL sürümü

Accuplan iş emirlerinin `[Accuplan].[dbo].[WorkOrder].[document]` alanındaki XML'i **doğrudan
SQL Server üzerinde** ayrıştırıp kesimhane asorti raporunu üretir.

Bu dal (`rdl`) kendi başına çalışır: Node.js, npm veya herhangi bir paket kurulumu gerektirmez.
İhtiyaç duyulan tek şey **SQL Server + Reporting Services**'tir.

> Tarayıcıda çalışan jQuery sürümü için **[`html`](../../tree/html)** dalına bakın. Hesap
> formülleri iki dalda aynıdır ve aynı iş emrinde birebir aynı sonucu verir.

> **Express sürümü kullanıyorsanız:** Reporting Services'in Express sürümü ücretsizdir ve raporu
> çalıştırmak, tarayıcıda açmak, Excel/PDF'e aktarmak için yeterlidir. Ancak **zamanlanmış
> abonelikler (e-posta/klasöre otomatik gönderim), önbellek ve rapor geçmişi Express'te yoktur**;
> bunlar Standard ve üzeri sürümlerde bulunur. Ayrıca Express sürümünde rapor yalnızca **aynı
> makinedeki** SQL Server örneğinden veri çekebilir — Accuplan veritabanı da o örnekte olduğu
> sürece sorun çıkmaz.

```
sql/    01_accuplan_report_functions.sql   XML ayrıştırma fonksiyonları
        02_accuplan_report_procs.sql       hesaplar + rapor prosedürleri
        03_dogrulama.sql                   kurulum sonrası kontrol betiği
rdl/    AccuplanKesimRaporu.rdl            SSRS raporu
tools/  rdl_check.py                       RDL yapısal doğrulayıcı (geliştirme aracı)
ornek-document.xml                         örnek iş emri dokümanı (IFS9599-DK)
```

---

## Kurulum

### 1. Veritabanı nesneleri

`Accuplan` veritabanında sırasıyla çalıştırın (SSMS veya `sqlcmd`):

```
sql\01_accuplan_report_functions.sql
sql\02_accuplan_report_procs.sql
```

Kontrol için (isteğe bağlı, örnek iş emri adını betiğin başında değiştirin):

```
sql\03_dogrulama.sql
```

Beklenen sonuç: `KESİM FARKI kontrolu` bölümü **boş** döner — yani kesim adetleri iş emri
asortisini tüm bedenlerde karşılıyor demektir.

Raporu çalıştıracak kullanıcı/hesaba yalnızca şu yetkiler yeterlidir:

```sql
GRANT SELECT ON dbo.WorkOrder TO [rapor_kullanicisi];
GRANT EXECUTE ON SCHEMA::dbo TO [rapor_kullanicisi];   -- ya da tek tek usp_Accuplan* prosedürleri
```

### 2. Rapor

1. `rdl\AccuplanKesimRaporu.rdl` dosyasını **Report Builder** (veya Visual Studio / SSDT) ile açın.
2. `Accuplan` veri kaynağının bağlantı dizesinde `SUNUCU-ADI` yerine kendi sunucunuzu yazın:
   `Data Source=SUNUCU-ADI;Initial Catalog=Accuplan`
   Named instance ise örnek adı da yazılır: `Data Source=SUNUCU\SQLEXPRESS;Initial Catalog=Accuplan`
3. Önizlemede **İŞEMRİ NO** listesinden iş emrini seçin.
4. Rapor sunucusuna dağıtın: Report Builder → Kaydet → Rapor Sunucusu.

---

## Rapor içeriği

**Parametreler**

| Parametre | Açıklama |
|---|---|
| Ara | İş emri no veya model parçası yazın; **İŞEMRİ NO listesi buna göre süzülür**. Boş bırakılırsa en yeni 500 iş emri listelenir |
| İŞEMRİ NO | `WorkOrder.name` alanından dolan liste (Ara kutusuna göre süzülür) |
| Pastal payı (m) | Boş bırakılırsa kumaşın `EndLoss` değeri kullanılır |
| Pastalsız planları da göster | Onaylı pastalı olmayan kumaş planlarını da listeler |

> **Neden arama kutusu var?** SSRS parametre panelinde yazdıkça tamamlayan (autocomplete)
> bir kutu yoktur; `ValidValues` tanımlı her parametre açılır liste olarak çizilir. Uzun
> listelerde standart çözüm budur: **Ara** kutusuna yazıp sekme/tıklama ile çıkın, İŞEMRİ NO
> listesi yalnızca eşleşenleri gösterecek şekilde yenilenir. Açılır liste açıkken harflere
> basmak da eşleşen kayda atlar.

**Bölümler**

- **ÖZET** — plan bazında pastal, toplam kat, serim, kesim adedi, kumaş sarfı, ağırlıklı verimlilik,
  serim/kesim süreleri ve genel toplam.
- **BEDEN DAĞILIMI** — bedenler sütun grubudur; beden sayısı iş emrine göre kendiliğinden değişir.
- **KESİM PLANLARI** — her kumaş için İŞEMRİ ADETİ satırı, pastal satırları ve
  TOPLAM ASORTİ / TOPLAM KESİM / KESİM FARKI / BEDEN DAĞILIMI % satırları.

Her kumaş planı yeni sayfada başlar ve sayfa adı `KESİM-1`, `KESİM-2`… olarak verilir; bu yüzden
**Excel'e aktarımda her kumaş planı ayrı sayfa (sheet) olarak** gelir — şablonun birebir karşılığı.
PDF ve Word dışa aktarımı da SSRS'in kendi işlevidir, ek geliştirme gerekmez.

---

## Hesaplar

```
PASTAL BOYU (m)    = Marker/@MadeLength × 0,0254                     (gerçekleşen)
                     yoksa Σ(parça alanı × asorti) / (kumaş eni × verimlilik) × 0,0254
F. PASTAL BOYU (m) = PASTAL BOYU + pastal payı
TOPL. AD.          = İŞ ADETİ × KAT SAYISI × SERİM
BİRİM METRAJ (m)   = PASTAL BOYU / İŞ ADETİ
KUMAŞ SARF (m)     = F. PASTAL BOYU × KAT SAYISI × SERİM
TOPLAM KESİM       = Σ (asorti × kat × serim)
KESİM FARKI        = TOPLAM KESİM − İŞEMRİ ADETİ
Ağırlıklı verim.   = Σ(sarf × verimlilik) / Σ(sarf)
SERİM SÜRESİ (dk)  = serim × (kurulum + kat × (boy / serme hızı + dönüş süresi))
KESİM SÜRESİ (dk)  = serim × (Σ parça çevresi / kesim hızı + parça × paket alma süresi)
```

Accuplan ölçüleri inch cinsindendir; fonksiyonlar metre/cm'e çevirir. Pastal boyu formülü örnek iş
emrinde doğrulanmıştır: CP-01 pastalında `Σalan / (en × MadeUtilization)` sonucu Accuplan'ın yazdığı
`MadeLength = 62,70325"` değerini birebir verir.

Süreler `CutPlan/CostSettings` hızlarından türetilen **tahminlerdir**; Accuplan bu alanları dokümanda
tutmaz. Fabrikanın gerçek süreleriyle uyuşmuyorsa `fn_AccuplanMarkerRows` içindeki iki satır değiştirilir.

> **Türkçe karakter:** `CAST(document AS VARCHAR(MAX))` kullanılırsa `SİNOP` → `SÄ°NOP` olur.
> Fonksiyonlar her yerde `CAST(document AS XML)` kullanır; XML ayrıştırıcısı UTF-8'i doğru
> yorumladığı için bu dönüşümde bozulma olmaz.

---

## Veri katmanı

| Nesne | İşlevi |
|---|---|
| `fn_AccuplanDoc` | `document` alanını XML'e çevirir |
| `fn_AccuplanHeader` | iş emri no, müşteri, model, tarih, hazırlayan |
| `fn_AccuplanSizes` | modelin beden listesi |
| `fn_AccuplanPlans` | kumaş planları: en, EndLoss, serim yöntemi, maliyet ayarları |
| `fn_AccuplanOrderQty` | beden bazında iş emri adetleri |
| `fn_AccuplanMeasures` | beden bazında parça alanı ve çevresi |
| `fn_AccuplanAsorti` | pastal × beden asorti adetleri |
| `fn_AccuplanMarkerBase` | pastal + serim kümesi (kat ve serim ayrı tutulur) |
| `fn_AccuplanUsedSizes` | raporda gösterilecek bedenler |
| `fn_AccuplanMarkerRows` | pastal boyu / sarf / verimlilik / süre hesapları |
| `usp_AccuplanWorkOrderList` | İŞEMRİ NO parametresini besler |
| `usp_AccuplanReportHeader` | rapor başlığı |
| `usp_AccuplanSummary` | ÖZET tablosu |
| `usp_AccuplanSizeDistribution` | beden dağılımı |
| `usp_AccuplanCutMatrix` | KESİM matrisi — her hücre bir satırdır, beden sütunları iş emrine göre oluşur |

---

## Geliştirme

RDL dosyasında elle değişiklik yapıldıysa yapısal kontrol:

```bash
python3 tools/rdl_check.py
```

Kontrol edilenler: tablix gövde satır/sütun sayısının hiyerarşiyle uyumu, her satırdaki hücre
sayısı, ifadelerdeki `Fields!` ve `Parameters!` referanslarının tanımlı olması, ölçü değerlerinin
geçerli birimde (`in/mm/cm/pt/pc`) olması ve Textbox adlarının benzersizliği.

---

## Örnek doküman

`ornek-document.xml`, `WorkOrder.document` alanının çözülmüş hâlidir (iş emri IFS9599-DK, id 182).
Fonksiyonları geliştirirken veya XML yapısını incelerken referans olarak kullanılabilir; raporun
çalışması için gerekli değildir.
