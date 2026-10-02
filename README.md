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
| Panel: Takibim düzeni (`takibimKipi`: `'qr'` / `'sunucu'` / `'kapali'`), sınırlar, yasal metin sürümleri | `src/data/portal.ts` |
| KVKK aydınlatma metni (şu anki düzen, QR'lı Takibim dahil) | `src/components/kvkk/AydinlatmaYerel.astro` |
| KVKK aydınlatma metni (sunuculu Takibim), Takibim açık rıza ve kullanım koşulları | `src/components/kvkk/AydinlatmaTakibim.astro`, `src/pages/acik-riza-metni.astro`, `danisan-sozlesmesi.astro` |

## Sayfalar

Ana sayfa · Hakkında · Sertifikalar · Hizmetler · Vücut Kitle İndeksi Hesaplama · Online Görüşme · Blog & Reels ·
İletişim · Randevu Talebi Oluştur (3 adım: görüşme → takvimden tercih edilen tarih ve saat → bilgiler; WhatsApp mesajı olarak gönderilir, randevu onaydan sonra kesinleşir) ·
KVKK Aydınlatma Metni

Arama motorlarına kapalı sayfalar: `/yonetim/` (diyetisyen paneli), `/takibim/` (danışan). Eski `/danisan/…` adresleri
Takibim'e yönlenir. Takibim açık rıza ve kullanım koşulları sayfaları yalnızca sunuculu Takibim'de kullanılır; şu an
KVKK Aydınlatma Metni'ne yönlenir.

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

**Şu anki düzen (`src/data/portal.ts` → `takibimKipi = 'qr'`): hiçbir danışan verisi sitenin sunucusuna gönderilmez.**

- **Randevu talepleri WhatsApp ile gelir.** Sitedeki form, ziyaretçinin telefonunda hazır bir WhatsApp mesajı açar.
  Diyetisyen bu mesajı kopyalayıp panelde **Randevu Talepleri → WhatsApp Talebi Ekle** penceresine yapıştırır; ad,
  telefon, görüşme türü, konu, tarih, saat, VKİ ve not kendiliğinden dolar. "Onayla" ile danışan kaydı açılır ve adres
  ile konum içeren hazır WhatsApp onay mesajı gönderilir.
- **Danışan kayıtları yalnızca diyetisyenin bilgisayarında**, tarayıcının içinde ve panel parolasıyla şifreli
  (AES-256-GCM, PBKDF2 600.000 tur) durur. Bölümler: Özet · Randevu Talepleri · Randevular · Danışanlar (ekle, düzenle,
  sil) · danışan dosyası (Ölçümler, Takibim, Paket, Randevular, Bilgiler ve Notlar) · Duyuru · Paketler · Ayarlar. Panel 30
  dakika işlem yapılmazsa kilitlenir ve aynı anda tek sekmede açılır.
- **Vücut analizi PDF'i:** Tanita MC-780 raporu danışan dosyasına sürüklenince değerler (kilo, yağ, kas, yağsız kütle,
  su, iç yağ, bazal metabolizma, metabolik yaş, bel, BKİ, kol/bacak/gövde segmental değerleri) ve cihazın ölçüm geçmişi
  otomatik okunur (`src/scripts/portal/tanita.ts`, tarayıcıda pdf.js ile; PDF hiçbir yere yüklenmez). PDF'teki ad
  danışan adıyla uyuşmazsa onay istenir. Ölçümler insan modeli üzerinde vücut haritası ve gelişim grafikleriyle görünür.
- **Takibim (QR, sunucusuz):** Danışan Takibim'i bir kez açar: klinikte panelin gösterdiği QR'ı okutur (PDF kaydedince
  ya da Ölçümler → "QR Göster"), online danışan "Online Danışana Bağlantı Gönder" ile gelen bağlantıyı açıp görüşmede
  sözlü söylenen 6 haneli kodu girer. QR'da danışanın özeti (ad, boy, hedef kilo, ölçümler ve vücut haritası, paket,
  randevular) ve danışana özel bir güncelleme anahtarı vardır; adres `https://…/takibim/#n=<rakamlar>` biçimindedir ve
  "#" sonrası tarayıcıdan sunucuya gitmez. Bilgiler yalnızca o telefonda (tarayıcı depolaması) saklanır; danışan sitedeki
  menüden "Takibim"e girince kendi bilgilerini görür.
- **Sonraki ölçümler (QR yeniden okutulmaz):** Takibim'i olan danışanda PDF kaydedilince (ya da Ölçümler →
  "Güncellemeyi WhatsApp'tan Gönder") panel `…/takibim/#g=…` bağlantısını hazırlar; bağlantı danışana özel anahtarla
  şifrelidir (AES-256-GCM) ve yalnızca Takibim'in açıldığı telefonda/tarayıcıda açılır, kod gerekmez. Danışan WhatsApp'ta
  bağlantıya dokununca Takibim güncellenir (evde girilen ölçümler korunur). Telefon değişirse "QR Göster" ile bir kez
  yeniden okutulur. Alerji, hastalık, ilaç, notlar ve paket notu eklenmez; belge ve mesaj gönderilmez. Kod:
  `src/scripts/portal/qrtakip.ts` (paketleme: sıkıştırma + QR'ın sayısal kipi; QR'a sığmayan çok eski geçmiş çıkarılır,
  ilk güncelleme bağlantısıyla tamamlanır), `danisan.ts` (telefon).
- Menü: "Takibim" ana menüde Hizmetler'in yanında (menü 1300 px altında hamburgere geçer). Üst bantta "Yönetim Girişi"
  (`/yonetim/`) ve yalnızca simge olarak telefon.
- `/api/portal/*` adresleri kapalıdır (404).

### Kurulum (bir kez)

1. `/yonetim/` açılır → panel parolası belirlenir (en az 10 karakter; **unutulursa kayıtlar açılamaz**).
2. Ayarlar → Mesaj Şablonları: ödeme şablonundaki IBAN'ı düzenleyin.
3. **Haftada bir Ayarlar → "Yedek İndir"** — kayıtlar yalnızca o bilgisayarda durur. Yedek dosyası şifrelidir; USB
   bellek veya harici diskte saklanması önerilir. Yeni bilgisayarda `/yonetim/` → "Yedekten Yükle".

`KURULUM_KODU` ve eski `VERI_ANAHTARI` Secret'ları bu düzende kullanılmaz; eklenmesine gerek yoktur, varsa silinebilir.

### Sunuculu Takibim'i açmak (ileride, isteğe bağlı)

Kodda hazırdır ama kapalıdır: telefonun QR'sız kendiliğinden güncellenmesi, belge (beslenme planı, rapor) ve mesaj
gönderme (uçtan uca şifreli), randevu formunun talebi şifreli olarak doğrudan panele iletmesi ve telefona bildirim. Bu
özellikler şifreli veriyi sitenin sunucusunda (Cloudflare, yurt dışı) tuttuğu için açmadan önce:

1. Hukukçu görüşü alınır (KVKK md. 9 yurt dışı aktarım; Cloudflare standart sözleşmesi ve Kurum'a bildirim).
2. `src/data/portal.ts` → `takibimKipi = 'sunucu'`; Cloudflare'e **Secret** `KURULUM_KODU` (en az 12 karakter) eklenir.
   QR'lı (sunucusuz) Takibim kullanan danışanlar yeni QR okutur.
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
statik dosya olarak sunulur; yalnızca `/api/*` adresleri `worker/index.ts` dosyasında çalışır (Instagram Reels; sunuculu
Takibim'de Takibim posta kutusu). Sunucu kodu `worker/portal/`, panel ve Takibim arayüzü `src/scripts/portal/` klasöründedir.

Paneli bilgisayarda denemek için `npm run build` ardından `npx wrangler dev` kullanılır (sunuculu Takibim'de
`--var KURULUM_KODU:<kod>` eklenir).

## Yazım kuralları

- Online görüşme için yalnızca “online” ifadesi kullanılır (“WhatsApp araması ile online” gibi ekler yazılmaz); yüz yüze
  görüşmenin altına konum eklenmez. WhatsApp yalnızca randevu talebinin iletildiği kanal olarak geçer.
- Süreç ve hizmet anlatımları üçüncü kişi ağzıyla yazılır (“seçilir”, “iletilir”, “takip edilir”); düğmelerde ve formda
  ziyaretçiye doğrudan hitap edilir.
- Ana düğmelerde “Randevu Talebi Oluştur” kullanılır.
