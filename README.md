# diyetisyeneylemdizman.com

Diyetisyen Eylem Dizman’ın internet sitesi. [Astro](https://astro.build) ile hazırlanmış statik bir sitedir ve
Cloudflare üzerinde yayınlanır. GitHub’daki `main` dalına yapılan her değişiklik, Cloudflare tarafından otomatik olarak
derlenip yayına alınır.

## Sık güncellenen yerler

| Ne değişecek? | Dosya / klasör |
| --- | --- |
| Telefon, adres, e-posta, çalışma saatleri, sosyal medya | `src/data/site.ts` |
| Hizmet listesi ve açıklamaları | `src/data/services.ts` |
| Blog yazıları | `src/content/blog/*.md` (her dosya bir yazı) |
| Sertifika görselleri | `src/assets/sertifikalar/` klasörüne jpg/png eklenir (kimlik no gibi kişisel veriler önceden gizlenmeli) |
| Sertifika başlıkları, grupları ve sırası | `src/data/certificates.ts` (listede olmayan görseller “Diğer Belgeler” altında çıkar) |
| Fotoğraf | `src/assets/eylem-dizman.jpg` |
| Logo dosyaları | `public/logo/` |
| Renkler ve yazı tipleri | `src/styles/global.css` |
| Site asistanı: karşılama, hazır sorular ve kurallar | `src/data/assistant.ts` |
| Online görüşme adımları ve sık sorulanlar | `src/data/online-gorusme.ts` |
| Ana sayfadaki süreç adımları | `src/data/process.ts` |

## Sayfalar

Ana sayfa · Hakkında · Hizmetler · Vücut Kitle İndeksi Hesaplama · Sertifikalar · Blog · İletişim · Online Görüşme ·
Randevu Oluştur (form → WhatsApp) · KVKK Aydınlatma Metni

## Site asistanı

Sağ alt köşedeki asistan yapay zekâ kullanmaz ve ücretsizdir:

- **Hazır sorular** (randevu, online görüşme, saatler, ücret vb.) butonla anında cevaplanır.
- **Ziyaretçinin yazdığı sorular** ziyaretçinin tarayıcısında anahtar kelimelerle hazır cevaplara ve hizmetlere
  eşleştirilir (ör. “hamileyim” → Gebelikte Beslenme ve randevu butonu). Eşleşme yoksa WhatsApp'a yönlendirir.
  Yazılanlar hiçbir yere gönderilmez.
- Metinler, hazır sorular ve anahtar kelimeler `src/data/assistant.ts` dosyasındadır. Hizmetler ve blog yazıları
  asistana otomatik eklenir; bilgiler site derlenirken `/asistan-bilgi.json` dosyasına yazılır.
- Kişiye özel sağlık tavsiyesi, fiyat ve sonuç vaadi verilmez; acil durum ifadelerinde 112'ye yönlendirir.

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

Cloudflare ayarları: `wrangler.jsonc` (derleme komutu `npm run build`, yayın komutu `npx wrangler deploy`).
