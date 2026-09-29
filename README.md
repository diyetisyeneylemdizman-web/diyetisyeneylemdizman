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

## Sayfalar

Ana sayfa · Hakkında · Sertifikalar · Hizmetler · Vücut Kitle İndeksi Hesaplama · Online Görüşme · Blog & Reels ·
İletişim · Randevu Talebi Oluştur (3 adım: görüşme → takvimden tercih edilen tarih ve saat → bilgiler; WhatsApp mesajı olarak gönderilir, randevu onaydan sonra kesinleşir) ·
KVKK Aydınlatma Metni

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

## Mevzuat notları

- Sitede danışan yorumu, teşekkür/memnuniyet ifadesi, ücret/indirim/kampanya bilgisi ve öncesi-sonrası görseli
  bulunmamalıdır (Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik).
- Alt bilgide “Son güncelleme” tarihi (her yayında otomatik) ve site editörü iletişim bilgisi yer alır.

## Geliştirme

```sh
npm install      # bağımlılıkları kurar
npm run dev      # http://localhost:4321 adresinde önizleme
npm run build    # yayın dosyalarını dist/ klasörüne üretir
```

Cloudflare ayarları: `wrangler.jsonc` (derleme komutu `npm run build`, yayın komutu `npx wrangler deploy`). Sayfalar
statik dosya olarak sunulur; yalnızca `/api/*` adresleri `worker/index.ts` dosyasında çalışır (Instagram Reels).

## Yazım kuralları

- Online görüşme için yalnızca “online” ifadesi kullanılır (“WhatsApp araması ile online” gibi ekler yazılmaz); yüz yüze
  görüşmenin altına konum eklenmez. WhatsApp yalnızca randevu talebinin iletildiği kanal olarak geçer.
- Süreç ve hizmet anlatımları üçüncü kişi ağzıyla yazılır (“seçilir”, “iletilir”, “takip edilir”); düğmelerde ve formda
  ziyaretçiye doğrudan hitap edilir.
- Ana düğmelerde “Randevu Talebi Oluştur” kullanılır.
