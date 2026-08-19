# AccuplanReporter

Accuplan iş emirlerinin (`[Accuplan].[dbo].[WorkOrder]`) `document` alanındaki XML'i okuyup
**kesimhane asorti raporunu** HTML + jQuery ile üreten, tek tuşla Excel'e aktaran küçük bir uygulama.

Rapor düzeni `EminAsortiKesimhaneBosSablon.xlsx` şablonunu izler: her kumaş (cut plan) için bir
**KESİM** sayfası ve tüm planları toplayan bir **ÖZET** sayfası.

---

## Hızlı başlangıç

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# .env içindeki DB_SERVER / DB_USER / DB_PASSWORD alanlarını doldurun
npm start
# tarayıcı: http://localhost:3000
```

Veritabanı bağlantısı olmadan denemek için:

```bash
DEMO_MODE=1 npm start     # Windows PowerShell: $env:DEMO_MODE=1; npm start
```

Demo modunda `sample/IFS9599-DK.xml` (gerçek 182 numaralı iş emrinin dokümanı) kullanılır;
arayüz ve hesaplar birebir aynı çalışır.

Hesaplama motorunun doğrulaması:

```bash
npm test
```

---

## Kullanım

1. **İŞEMRİ NO** listesinden iş emrini seçin (liste `WorkOrder.name` alanından gelir; üstteki
   *Ara* kutusu iş emri no / model üzerinden süzer).
2. Seçim yapıldığı anda `document` alanı okunur, XML jQuery ile ayrıştırılır ve rapor basılır.
3. **Raporu Kaydet** — rapor iş emri numarasıyla `data/reports/<İŞEMRİNO>.json` dosyasına yazılır
   (ham XML ile birlikte). **Kayıtlıyı Aç** ile geri yüklenir.
4. **Excel'e Aktar** — `<İŞEMRİNO>-kesim-raporu.xlsx` indirilir. Hesaplanan hücreler **formül**
   olarak yazılır, dosya Excel'de canlı kalır.
5. **XML İndir / Yazdır** — ham dokümanı almak veya raporu yazıcıya/PDF'e vermek için.

Veritabanına erişilemeyen bir makinede çalışıyorsanız, dokümanı elle çekip
(`SELECT CAST(document AS VARCHAR(MAX)) FROM dbo.WorkOrder WHERE name='IFS9599-DK'`) bir `.xml`
dosyasına kaydedebilir ve panelin sağındaki **veya XML dosyasından** alanıyla yükleyebilirsiniz.

---

## Veritabanı okuma

`document` alanı `varbinary(max)` olduğu için SQL tarafında `CAST(... AS VARCHAR(MAX))` yapıldığında
Türkçe karakterler bozulur (`İş Emri` → `Ä°ÅŸ Emri`). Uygulama bu yüzden ham byte dizisini alır ve
Node tarafında UTF-8 (gerekirse UTF-16LE) olarak çözer — `server/db.js` içindeki `decodeDocument`.

Kullanılan sorgular:

```sql
-- liste
SELECT TOP (@limit) id, name, number, created_on, status, models, fabric_codes, ...
  FROM dbo.WorkOrder ORDER BY created_on DESC;

-- tek iş emri
SELECT TOP (1) id, name, number, document, ... FROM dbo.WorkOrder WHERE name = @name;
```

Uygulama yalnızca **okuma** yapar; hiçbir tabloya yazmaz.

---

## XML → şablon eşleştirmesi

| Şablon alanı | XML kaynağı |
|---|---|
| İŞEMRİ NO | `Information/WorkOrderNumber` |
| MÜŞTERİ | `Information/CompanyName` |
| MODEL | `Models/Model/@Name` |
| TARİH | `Information/DateReceived` |
| KUMAŞ (KESİM sayfası) | `CutPlans/CutPlan/FabricCodes/Code` |
| BEDENLER | `Model/SizeLine/Size` (yalnızca siparişi olan veya pastalda geçen bedenler) |
| İŞEMRİ ADETİ | `CutPlan/Input/Color/Bundle/@Quantity` |
| EN (cm) | `CutPlan/Fabric/@Width` × 2,54 |
| PASTAL PAYI (m) | `CutPlan/Fabric/@EndLoss` × 0,0254 (panelden elle geçilebilir) |
| Pastal asortisi | `MarkerSpreading/Marker/Section/Bundle/@Quantity` |
| KAT SAYISI | `SpreadSets/SpreadSet/plySet/@PlyQuantity` toplamı |
| SERİM | `SpreadSet/@SpreadQuantity` |
| VERİMLİLİK | `Marker/@MadeUtilization` (yoksa `@Utilization`) |
| PASTAL BOYU | `Marker/@MadeLength`, yoksa hesaplanır (aşağıya bakın) |

### Hesaplanan sütunlar

```
PASTAL BOYU (m)      = MadeLength × 0,0254
                       ya da  Σ(parça alanı × asorti) / (kumaş eni × verimlilik) × 0,0254
F. PASTAL BOYU (m)   = PASTAL BOYU + pastal payı
TOPL. AD.            = İŞ ADETİ × KAT SAYISI × SERİM
BİRİM METRAJ (m)     = PASTAL BOYU / İŞ ADETİ
KUMAŞ SARF (m)       = F. PASTAL BOYU × KAT SAYISI × SERİM
TOPLAM KESİM (beden) = Σ (asorti × kat × serim)
KESİM FARKI          = TOPLAM KESİM − İŞEMRİ ADETİ
Ağırlıklı verimlilik = Σ(sarf × verimlilik) / Σ(sarf)
SERİM SÜRESİ (dk)    = serim × (kurulum + kat × (boy / serme hızı + dönüş süresi))
KESİM SÜRESİ (dk)    = serim × (Σ parça çevresi / kesim hızı + parça × paket alma süresi)
```

Pastal boyu formülü örnek iş emrinde doğrulanmıştır: CP-01 pastalında
`Σalan / (en × MadeUtilization)` sonucu Accuplan'ın yazdığı `MadeLength = 62,70325"` değerini
birebir verir. Süreler `CutPlan/CostSettings` hızlarından türetilen **tahminlerdir**; Accuplan bu
alanları dokümanda tutmaz.

> Not: `MadeUtilization` gerçekleşen pastal verimliliğidir ve planlanandan yüksek olabilir
> (örnekte CP-01: planlanan %86,5 → gerçekleşen %95,36). Verimlilik hücresinin üzerine gelince
> her ikisi de görünür.

---

## Dosya düzeni

```
server/          Express API (mssql okuma, rapor kaydetme)
  config.js      .env okuma
  db.js          MSSQL sorguları + varbinary→metin çözümü
  index.js       API uçları ve statik sunum
public/
  index.html     Arayüz
  js/accuplan-parser.js   XML → rapor modeli (jQuery)
  js/report-render.js     Model → şablon tabloları
  js/excel-export.js      Model → xlsx (ExcelJS, formüllü)
  js/app.js               Arayüz akışı
  vendor/        jQuery, ExcelJS, FileSaver (npm install ile kopyalanır)
sample/          Örnek iş emri dokümanı (demo modu)
test/            Hesaplama doğrulama testleri
data/reports/    Kaydedilen raporlar (iş emri numarasıyla)
```

## API uçları

| Uç | Açıklama |
|---|---|
| `GET /api/health` | Mod (MSSQL / demo) bilgisi |
| `GET /api/workorders?q=` | İş emri listesi |
| `GET /api/workorders/:name/document` | Seçilen iş emrinin XML dokümanı |
| `GET /api/reports` | Kaydedilmiş raporlar |
| `GET /api/reports/:name` | Kayıtlı raporu getir |
| `PUT /api/reports/:name` | Raporu kaydet |
| `DELETE /api/reports/:name` | Kaydı sil |
