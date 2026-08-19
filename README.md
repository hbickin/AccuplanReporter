# AccuplanReporter

Accuplan iş emirlerinin (`[Accuplan].[dbo].[WorkOrder]`) `document` alanındaki XML'i okuyup
**kesimhane asorti raporunu** üretir. Rapor düzeni `EminAsortiKesimhaneBosSablon.xlsx`
şablonunu izler: her kumaş (cut plan) için bir **KESİM** sayfası ve tüm planları toplayan
bir **ÖZET** sayfası.

Aynı işi yapan iki bağımsız sürüm vardır:

| Klasör | Sürüm | Gereksinim | Ne zaman tercih edilir |
|---|---|---|---|
| **[`html/`](html)** | Tarayıcıda çalışan jQuery uygulaması + Express sunucusu | Node.js | Tek makinede hızlı kurulum, ExcelJS ile biçimli xlsx çıktısı, sunucusuz çevrimdışı kullanım |
| **[`rdl/`](rdl)** | SSRS raporu — XML ayrıştırma ve hesaplar T-SQL tarafında | SQL Server Reporting Services | Sunucuda bir kez kurulup herkesin tarayıcıdan açması, SSRS'in kendi Excel/PDF çıktısı ve yetkilendirmesi |

Her klasörün kendi README'si vardır; kurulum adımları oradadır. İki sürümün hesap formülleri
aynıdır ve aynı örnek iş emrinde birebir aynı sonucu verir.

Aynı ayrım dal olarak da durur: **[`html`](../../tree/html)** ve **[`rdl`](../../tree/rdl)** dalları
yalnızca ilgili sürümü içerir; tek bir sürümü teslim etmek gerektiğinde o dal indirilebilir.

## Doğrulama

```bash
cd html && npm test          # ayrıştırma ve hesap testleri
python3 rdl/tools/rdl_check.py   # RDL yapısal kontrolü
```

Örnek iş emri IFS9599-DK üzerinde her iki sürüm de aynı sonucu verir: CP planı 199,66 m kumaş /
%90,74 verimlilik, DK planı 1.515,24 m / %83,79; kesim adetleri iş emri asortisini tüm bedenlerde
birebir karşılar (KESİM FARKI = 0).
