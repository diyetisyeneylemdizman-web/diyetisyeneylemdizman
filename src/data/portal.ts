// Diyetisyen paneli, Takibim ve randevu talebi — ortak tanımlar (site sayfaları ve worker/portal kodu kullanır)
//
// KVKK metinleri değiştiğinde ilgili "surum" ve "guncelleme" değerleri güncellenmelidir. Takibim'i kullanan danışan,
// açık rıza sürümü değiştiğinde güncel metni telefonunda yeniden onaylar.

export type TakibimKipi = 'qr' | 'sunucu' | 'kapali';

/**
 * Takibim (danışanın ölçümlerini kendi telefonunda gördüğü sayfa) nasıl çalışır?
 * - 'qr' (şu anki düzen): Hiçbir danışan verisi internet sitesinin sunucusuna gönderilmez. Danışan kayıtları yalnızca
 *   diyetisyenin bilgisayarında durur. Ölçümden sonra panel bir QR kodu gösterir; ölçümler QR'ın içindedir ve danışanın
 *   telefonuna doğrudan geçer (adresin "#" sonrası tarayıcıdan sunucuya gitmez), yalnızca o telefonda saklanır.
 *   Online danışana aynı bilgiler 6 haneli kodla şifreli bir bağlantı olarak WhatsApp'tan gönderilir.
 *   Randevu talepleri WhatsApp ile gelir; diyetisyen panele mesajı yapıştırarak ekler. /api/portal/* çalışmaz.
 * - 'sunucu': Uçtan uca şifreli sunucu kutusu (telefon kendiliğinden güncellenir, belge ve mesaj gönderilir; randevu
 *   talepleri şifreli olarak panele düşer, bildirim gelir). Şifreli veri sitenin barındırıldığı sunucuda (yurt dışı)
 *   durur: açmadan önce hukukçu görüşü alınmalıdır (README → "Sunuculu Takibim'i açmak").
 * - 'kapali': Takibim yok (menüde düğme görünmez).
 */
export const takibimKipi = 'qr' as TakibimKipi;

/** Sunucu özellikleri: /api/portal/*, şifreli randevu kutusu, sunuculu Takibim, bildirimler, belgeler, mesajlar */
export const sunucuAcik = takibimKipi === 'sunucu';

/** Takibim sayfası ve menüdeki "Takibim" düğmesi */
export const takibimGorunur = takibimKipi !== 'kapali';

export const portalBelgeleri = {
  aydinlatma: {
    baslik: 'KVKK Aydınlatma Metni',
    yol: '/kvkk-aydinlatma-metni/',
    surum: '7',
    guncelleme: '2026-10-02',
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
