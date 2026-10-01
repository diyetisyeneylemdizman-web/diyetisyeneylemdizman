# diyetisyeneylemdizman.com

Diyetisyen Eylem Dizman’ın internet sitesi. [Astro](https://astro.build) ile hazırlanmış statik bir sitedir ve
Cloudflare üzerinde yayınlanır. GitHub’daki `main` dalına yapılan her değişiklik, Cloudflare tarafından otomatik olarak
derlenip yayına alınır.

## Sık güncellenen yerler

| Ne değişecek? | Dosya / klasör |
| --- | --- |
| Telefon, adres, e-posta, çalışma saatleri, sosyal medya | `src/data/site.ts` |
| Hizmet alanları, alt başlıklar ve açıklamaları (Hizmetler sayfası, ana sayfa kartları, randevu formundaki konu listesi) | `src/data/services.ts` |
| Blog yazıları | `src/content/blog/*.md` (her dosya bir yazı) |
| Sertifika görselleri | `src/assets/sertifikalar/` klasörüne jpg/png eklenir (kimlik no gibi kişisel veriler önceden gizlenmeli) |
| Sertifika başlıkları, grupları ve sırası | `src/data/certificates.ts` (listede olmayan görseller “Diğer Belgeler” altında çıkar; sitede gösterilmeyecek bir belge, `src/pages/index.astro` ve `src/pages/sertifikalar.astro` içindeki listeye `!` ile eklenir) |
| Fotoğraf | `src/assets/eylem-dizman.jpg` |
| Logo dosyaları | `public/logo/` |
| Renkler ve yazı tipleri | `src/styles/global.css` |
| Site asistanı: karşılama, hazır sorular ve kurallar | `src/data/assistant.ts` |
| Online görüşme adımları ve sık sorulanlar | `src/data/online-gorusme.ts` |
| Ana sayfadaki süreç adımları | `src/data/process.ts` |
| Sayfa geçişi ve açılış animasyonları | `src/styles/global.css` (“Hafif animasyonlar” bölümü) |
| Menü sırası ve adları | `src/data/site.ts` (`nav`) |
| Randevu takvimi: çalışma saatleri, kapalı günler (tatiller), kaç gün sonrası seçilebilir | `src/data/site.ts` (`hours`, `closedDates`, `bookingDaysAhead`) |
| Panel: Takibim açık/kapalı (`takibimAcik`), sınırlar, yasal metin sürümleri | `src/data/portal.ts` |
| KVKK aydınlatma metni (şu anki düzen) | `src/components/kvkk/AydinlatmaYerel.astro` |
| KVKK aydınlatma metni (Takibim açıkken), Takibim açık rıza ve kullanım koşulları | `src/components/kvkk/AydinlatmaTakibim.astro`, `src/pages/acik-riza-metni.astro`, `danisan-sozlesmesi.astro` |

## Sayfalar

Ana sayfa · Hakkında · Sertifikalar · Hizmetler · Vücut Kitle İndeksi Hesaplama · Online Görüşme · Blog & Reels ·
İletişim · Randevu Talebi Oluştur (3 adım: görüşme → takvimden tercih edilen tarih ve saat → bilgiler; WhatsApp mesajı olarak gönderilir, randevu onaydan sonra kesinleşir) ·
KVKK Aydınlatma Metni

Arama motorlarına kapalı sayfa: `/yonetim/` (diyetisyen paneli). Takibim kapalıyken `/takibim/`, eski `/danisan/…`
adresleri ana sayfaya; Takibim açık rıza ve kullanım koşulları sayfaları KVKK Aydınlatma Metni'ne yönlenir.

## Site asistanı

Sağ alt köşedeki asistan yapay zekâ kullanmaz ve ücretsizdir:

- **Hazır sorular** (randevu, online görüşme, saatler, ücret vb.) butonla anında cevaplanır.
- **Ziyaretçinin yazdığı sorular** ziyaretçinin tarayıcısında anahtar kelimelerle hazır cevaplara ve hizmetlere
  eşleştirilir (ör. “hamileyim” → Gebelikte Beslenme ve randevu butonu). Eşleşme yoksa WhatsApp'a yönlendirir.
  Yazılanlar hiçbir yere gönderilmez.
- Metinler, hazır sorular ve anahtar kelimeler `src/data/assistant.ts` dosyasındadır. Hizmetler ve blog yazıları
  asistana otomatik eklenir; bilgiler site derlenirken `/asistan-bilgi.json` dosyasına yazılır.
- Kişiye özel sağlık tavsiyesi, fiyat ve sonuç vaadi verilmez; acil durum ifadelerinde 112'ye yönlendirir.

## Instagram Reels (Blog & Reels)

Ana sayfadaki ve Blog & Reels sayfasındaki videolar Instagram hesabından otomatik gelir; yan yana dizilip sağdan sola
kendiliğinden kayar, fare üzerine gelince durur (`src/components/ReelsGrid.astro`):

- `worker/index.ts` her 3 saatte bir Instagram API'den son videoları (Reels) alır, önizleme görsellerini saklar ve
  sitede `/api/reels` adresinden sunar. Ziyaretçiler görselleri sitemizden görür; videoya tıklayınca Instagram açılır.
- Gerekli tek ayar: Cloudflare panelinde Worker → Settings → Variables and Secrets → **Secret** türünde
  `INSTAGRAM_TOKEN` (Instagram erişim anahtarı). Anahtar koda veya GitHub'a yazılmaz.
- Anahtar 60 gün geçerlidir; Worker haftada bir kendiliğinden yeniler. Panelde yeni bir anahtar girilirse otomatik
  olarak ona geçilir.
- Anahtar yoksa ya da çalışmazsa sitede “Reels Videolarını Instagram’da İzleyin” kartı görünür; site etkilenmez.
- Hata ayıklama: Cloudflare panelinde Worker → Logs (“Reels eşitleme: …” satırları).

## Google yorumları

Eklenmedi: Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik (12.11.2025) md. 5(1)(e)
ve 7(1)(ğ), hasta/danışan teşekkür ve memnuniyet ifadelerinin internet sitesinde paylaşılmasını, başka mecralarda
yapılmış olsa bile, yasaklıyor.

## VKİ hesaplayıcı

- **18 yaş ve üzeri:** Dünya Sağlık Örgütü (DSÖ) VKİ sınıfları kullanılır; bu sınıflar kadın ve erkekte aynıdır.
  Cinsiyet, isteğe bağlı bel çevresi değerlendirmesinde dikkate alınır (kadın 80/88 cm, erkek 94/102 cm üzeri
  artmış/yüksek risk).
- **2–17 yaş:** VKİ, DSÖ’nün yaşa ve cinsiyete özel tablolarıyla persentil olarak değerlendirilir (2–5 yaş: DSÖ 2006
  büyüme standartları, 5–19 yaş: DSÖ 2007 referansları). Tablo değerleri `public/veri/vki-referans.json` dosyasındadır;
  yalnızca çocuk hesabında indirilir.
- **2 yaş altı ve gebelik:** VKİ sınıflaması yapılmaz; Çocuk ve Ergen Beslenmesi / Gebelikte Beslenme hizmetine yönlendirilir.
- **Gebelikte kilo takibi:** VKİ sayfasında, gebelik öncesi VKİ’ye göre tekil gebelikte önerilen toplam kilo artışı
  tablosu (CDC / IOM 2009) ve “Gebeyseniz” uyarısı yer alır.
- Hesaplama tarayıcıda yapılır; girilen bilgiler hiçbir yere gönderilmez.

## Diyetisyen paneli

Ücretsizdir; kart tanımı, abonelik veya ek ayar gerekmez.

**Şu anki düzen (`src/data/portal.ts` → `takibimAcik = false`): hiçbir danışan verisi internete gönderilmez.**

- **Randevu talepleri WhatsApp ile gelir.** Sitedeki form, ziyaretçinin telefonunda hazır bir WhatsApp mesajı açar.
  Diyetisyen bu mesajı kopyalayıp panelde **Randevu Talepleri → WhatsApp Talebi Ekle** penceresine yapıştırır; ad,
  telefon, görüşme türü, konu, tarih, saat, VKİ ve not kendiliğinden dolar. "Onayla" ile danışan kaydı açılır ve adres
  ile konum içeren hazır WhatsApp onay mesajı gönderilir.
- **Danışan kayıtları yalnızca diyetisyenin bilgisayarında**, tarayıcının içinde ve panel parolasıyla şifreli
  (AES-256-GCM, PBKDF2 600.000 tur) durur. Bölümler: Özet · Randevu Talepleri · Randevular · Danışanlar (ekle, düzenle,
  sil) · danışan dosyası (Ölçümler, Paket, Randevular, Bilgiler ve Notlar) · Duyuru · Paketler · Ayarlar. Panel 30
  dakika işlem yapılmazsa kilitlenir ve aynı anda tek sekmede açılır.
- **Vücut analizi PDF'i:** Tanita MC-780 raporu danışan dosyasına sürüklenince değerler (kilo, yağ, kas, yağsız kütle,
  su, iç yağ, bazal metabolizma, metabolik yaş, bel, BKİ, kol/bacak/gövde segmental değerleri) ve cihazın ölçüm geçmişi
  otomatik okunur (`src/scripts/portal/tanita.ts`, tarayıcıda pdf.js ile; PDF hiçbir yere yüklenmez). PDF'teki ad
  danışan adıyla uyuşmazsa onay istenir. Ölçümler insan modeli üzerinde vücut haritası ve gelişim grafikleriyle görünür.
- `/api/portal/*` adresleri kapalıdır (404); `/takibim/` ana sayfaya yönlenir; menüde Takibim düğmesi yoktur.

### Kurulum (bir kez)

1. `/yonetim/` açılır → panel parolası belirlenir (en az 10 karakter; **unutulursa kayıtlar açılamaz**).
2. Ayarlar → Mesaj Şablonları: ödeme şablonundaki IBAN'ı düzenleyin.
3. **Haftada bir Ayarlar → "Yedek İndir"** — kayıtlar yalnızca o bilgisayarda durur. Yedek dosyası şifrelidir; USB
   bellek veya harici diskte saklanması önerilir. Yeni bilgisayarda `/yonetim/` → "Yedekten Yükle".

`KURULUM_KODU` ve eski `VERI_ANAHTARI` Secret'ları bu düzende kullanılmaz; eklenmesine gerek yoktur, varsa silinebilir.

### Takibim'i açmak (ileride, isteğe bağlı)

Kodda hazırdır ama kapalıdır: danışanın QR ile telefonundan ölçümlerini görmesi (uçtan uca şifreli), randevu formunun
talebi şifreli olarak doğrudan panele iletmesi ve telefona bildirim. Bu özellikler şifreli veriyi sitenin sunucusunda
(Cloudflare, yurt dışı) tuttuğu için açmadan önce:

1. Hukukçu görüşü alınır (KVKK md. 9 yurt dışı aktarım; Cloudflare standart sözleşmesi ve Kurum'a bildirim).
2. `src/data/portal.ts` → `takibimAcik = true`; Cloudflare'e **Secret** `KURULUM_KODU` (en az 12 karakter) eklenir.
3. Panelde Özet → "Şimdi Bağlan" ile kurulum kodu girilir; Ayarlar → Bildirimler açılır.
4. KVKK aydınlatma metni kendiliğinden Takibim sürümüne (`AydinlatmaTakibim.astro`) geçer; Takibim açık rıza ve
   kullanım koşulları sayfaları açılır. Metinlerin sürümü `src/data/portal.ts` içinde artırılır.

### Yasal kontrol listesi

- [ ] KVKK aydınlatma metni bir hukukçu tarafından gözden geçirildi.
- [ ] Paket fiyatlarının sitede gösterimi Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında
      Yönetmelik açısından değerlendirildi.

### Kural: her yenilikte KVKK teyidi

Sitede, randevu formunda veya panelde kişisel veri işleyen her değişiklikte (yeni alan, yeni hizmet sağlayıcı, yeni
bildirim kanalı, ödeme vb.) KVKK aydınlatma metni kontrol edilir; metin değişirse `src/data/portal.ts` içindeki
`surum` ve `guncelleme` değerleri güncellenir.

## Mevzuat notları

- Sitede danışan yorumu, teşekkür/memnuniyet ifadesi, ücret/indirim/kampanya bilgisi ve öncesi-sonrası görseli
  bulunmamalıdır (Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik).
- Alt bilgide “Son güncelleme” tarihi (her yayında otomatik) ve site editörü iletişim bilgisi yer alır.
- “Uzman” unvanı kullanılmaz.

## Geliştirme

```sh
npm install      # bağımlılıkları kurar
npm run dev      # http://localhost:4321 adresinde önizleme
npm run build    # yayın dosyalarını dist/ klasörüne üretir
```

Cloudflare ayarları: `wrangler.jsonc` (derleme komutu `npm run build`, yayın komutu `npx wrangler deploy`). Sayfalar
statik dosya olarak sunulur; yalnızca `/api/*` adresleri `worker/index.ts` dosyasında çalışır (Instagram Reels; Takibim
açıkken Takibim posta kutusu). Sunucu kodu `worker/portal/`, panel ve Takibim arayüzü `src/scripts/portal/` klasöründedir.

Paneli bilgisayarda denemek için `npm run build` ardından `npx wrangler dev` kullanılır (Takibim açıkken
`--var KURULUM_KODU:<kod>` eklenir).

## Yazım kuralları

- Online görüşme için yalnızca “online” ifadesi kullanılır (“WhatsApp araması ile online” gibi ekler yazılmaz); yüz yüze
  görüşmenin altına konum eklenmez. WhatsApp yalnızca randevu talebinin iletildiği kanal olarak geçer.
- Süreç ve hizmet anlatımları üçüncü kişi ağzıyla yazılır (“seçilir”, “iletilir”, “takip edilir”); düğmelerde ve formda
  ziyaretçiye doğrudan hitap edilir.
- Ana düğmelerde “Randevu Talebi Oluştur” kullanılır.
