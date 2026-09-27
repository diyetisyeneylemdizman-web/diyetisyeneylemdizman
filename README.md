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

Sağ alt köşedeki asistan iki şekilde çalışır:

- **Hazır sorular** (randevu, online görüşme, saatler, ücret vb.) yapay zekâ kullanmadan, anında cevaplanır.
  Metinler `src/data/assistant.ts` dosyasındadır.
- **Ziyaretçinin kendi yazdığı sorular** Cloudflare Worker (`worker/index.ts`) üzerinden yapay zekâya (Anthropic Claude
  Haiku) gönderilir. Yapay zekâ yalnızca sitedeki bilgilerle cevap verir; bu bilgiler site her derlendiğinde
  `/asistan-bilgi.json` dosyasına otomatik yazılır (hizmetler, saatler, online görüşme, blog yazıları vb.).

Yapay zekâyı açmak için Cloudflare panelinde **Workers & Pages → diyetisyeneylemdizman → Settings → Variables and
Secrets** bölümüne `ANTHROPIC_API_KEY` adıyla **Secret** türünde anahtar eklenir. Anahtar yoksa asistan yalnızca hazır
cevaplarla çalışır. Harcamayı sınırlamak için Anthropic Console'da aylık harcama limiti tanımlanmalıdır. Farklı bir model
kullanmak için isteğe bağlı `ASISTAN_MODEL` değişkeni eklenebilir.

Asistan mesajları kaydetmez; ziyaretçilerden kişisel veya sağlık bilgisi yazmamaları istenir (bkz. KVKK Aydınlatma Metni).

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
`dist/` klasöründen sunulur; yalnızca `/api/*` adresleri `worker/index.ts` dosyasında çalışır.
