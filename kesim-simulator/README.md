# Kesim Simülatörü

Gerber / RS-274X (ISO) kesim dosyalarını (`.CUT`) tarayıcıda açıp pastalı gösteren ve bıçak
hareketini simüle eden tek dosyalık HTML uygulaması. Kurulum gerekmez: `index.html` dosyasını
tarayıcıda açmanız yeterlidir (internet bağlantısı da gerekmez).

## Kullanım

1. **📂 Dosya Seç** ile `.CUT` dosyasını seçin. Pastalın tamamı üstteki 200 px'lik alanda görünür.
2. **Hız (mm/sn)** kutusuna tam sayı bir hız girin (bıçak kalkıkken boş hareket bunun 2 katı hızla yapılır).
3. **▶ Simüle Et** ile simülasyonu başlatın; **Duraklat** / **Durdur** ile kontrol edin (Boşluk tuşu da başlatır/duraklatır).
4. Simülasyon alanında fare tekerleği ile yakınlaştırın, sürükleyerek kaydırın, çift tıkla sığdırın.
   Önizlemeye tıklamak simülasyon görünümünü o noktaya götürür.
5. Alttaki **İşlemler** alanı bilgi, uyarı ve hataları gösterir.

Renkler: mavi = kesilen kontur, turuncu = çentik, yeşil kesikli = bıçak kalkık boş hareket,
kırmızı imleç = bıçak aşağıda, yeşil imleç = bıçak yukarıda.

## Desteklenen komutlar

| Komut | Anlam |
|---|---|
| `H1` | Başlık |
| `N<n>` | Parça numarası |
| `X<x>Y<y>` | Konuma git (birim 0,01 inç = 0,254 mm) |
| `M14` / `M15` | Bıçak aşağı / yukarı |
| `M19` | Sonraki hareket çentik (notch) kesimi |
| `M20` | Sonraki alan mesaj (`/L=..CM/W=..CM` boy/en kontrolünde kullanılır) |
| `M26 M70 M80–M85`, `D2` | Tanınır, çizime etkisi yoktur |
| `Q X<x>Y<y>` | Pastal ilerleme/son konumu |
| `M0` | Program sonu |

`M0*` sonrasındaki virgüllü satırlar da okunur: `B` (pastal sınırı), `M` (pastal bilgileri),
`V` / `L` / `D` (parça adı, beden, sağ/sol vb. etiketleri).

Örnek dosyalar: [`sample/`](sample).
