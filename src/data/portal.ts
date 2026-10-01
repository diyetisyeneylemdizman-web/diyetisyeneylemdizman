// Diyetisyen paneli, Takibim ve randevu talebi — ortak tanımlar (site sayfaları ve worker/portal kodu kullanır)
//
// KVKK metinleri değiştiğinde ilgili "surum" ve "guncelleme" değerleri güncellenmelidir. Takibim'i kullanan danışan,
// açık rıza sürümü değiştiğinde güncel metni telefonunda yeniden onaylar.

/**
 * Takibim ve panele düşen şifreli randevu talepleri (sunucu özellikleri).
 * - false (şu anki düzen): Hiçbir danışan verisi internet sitesinin sunucusuna gönderilmez. Randevu talepleri WhatsApp
 *   ile gelir ve diyetisyen panele elle (mesajı yapıştırarak) ekler; danışan kayıtları yalnızca diyetisyenin
 *   bilgisayarında durur. Takibim kapalıdır, /api/portal/* adresleri çalışmaz.
 * - true: Takibim ve panele düşen randevu talepleri açılır (uçtan uca şifreli, sitenin sunucusu üzerinden). Açmadan önce
 *   hukukçu görüşü alınmalı ve KVKK metinleri bu özelliklere göre güncellenmelidir (README → "Takibim'i açmak").
 */
export const takibimAcik = false;

export const portalBelgeleri = {
  aydinlatma: {
    baslik: 'KVKK Aydınlatma Metni',
    yol: '/kvkk-aydinlatma-metni/',
    surum: '3',
    guncelleme: '2026-10-01',
  },
  acikRiza: {
    baslik: 'Takibim İçin Açık Rıza Metni',
    yol: '/acik-riza-metni/',
    surum: '2',
    guncelleme: '2026-10-01',
  },
  kosullar: {
    baslik: 'Takibim Kullanım Koşulları',
    yol: '/danisan-sozlesmesi/',
    surum: '2',
    guncelleme: '2026-10-01',
  },
} as const;

/** Takibim açık rızasının güncel sürümü (danışanın telefonunda ve eşleşme kaydında tutulur) */
export const takibimRizaSurumu = `${portalBelgeleri.aydinlatma.surum}.${portalBelgeleri.acikRiza.surum}.${portalBelgeleri.kosullar.surum}`;

/** Sınırlar (sunucu ve tarayıcı aynı değerleri kullanır) */
export const sinirlar = {
  /** Danışana gönderilebilecek belge (PDF/görsel) */
  belgeBayt: 10 * 1024 * 1024,
  belgeTurleri: { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' } as Record<string, string>,
  /** Bir danışanın Takibim verisi (şifreli) */
  takipVerisiBayt: 1_500_000,
  /** Eşleşmeyen (okutulmayan) QR'ın geçerlilik süresi */
  qrGecerlilikGun: 14,
  /** Okunmayan randevu talebinin sunucuda en fazla kalma süresi */
  talepSaklamaGun: 30,
  /** Panel kendini kilitlemeden önce boşta kalma süresi */
  panelKilitDakika: 30,
};

export const hedefSecenekleri = [
  'Kilo vermek',
  'Kilo almak',
  'Kilomu korumak',
  'Sağlıklı beslenme alışkanlıkları',
  'Hastalıkta beslenme desteği',
  'Sporcu beslenmesi',
  'Gebelik veya emzirme döneminde beslenme',
  'Diğer',
];

export const randevuDurumlari = {
  talep: 'Talep',
  onaylandi: 'Onaylandı',
  tamamlandi: 'Tamamlandı',
  gelmedi: 'Gelmedi',
  iptal: 'İptal',
} as const;
export type RandevuDurumu = keyof typeof randevuDurumlari;
