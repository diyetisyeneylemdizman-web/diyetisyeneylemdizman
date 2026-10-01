// Danışan sistemi — ortak tanımlar (hem site sayfaları hem de worker/portal kodu kullanır)
//
// KVKK metinleri değiştiğinde ilgili "surum" değeri güncellenmelidir. Sürüm değişince danışanlar bir sonraki
// girişlerinde güncel metni görür; açık rıza ve sözleşme yeniden onaylanır (onay kayıtları sürümüyle saklanır).

export const portalBelgeleri = {
  aydinlatma: {
    baslik: 'KVKK Aydınlatma Metni',
    yol: '/kvkk-aydinlatma-metni/',
    surum: '2026-10-01',
  },
  acikRiza: {
    baslik: 'Sağlık Verileri İçin Açık Rıza Metni',
    yol: '/acik-riza-metni/',
    surum: '2026-10-01',
  },
  sozlesme: {
    baslik: 'Danışan Paneli Kullanım Sözleşmesi',
    yol: '/danisan-sozlesmesi/',
    surum: '2026-10-01',
  },
} as const;

export type BelgeTuru = keyof typeof portalBelgeleri;

/** Sağlık verisi sayılan ölçüm alanları (hepsi şifreli saklanır) */
export const olcumAlanlari = [
  { key: 'kilo', label: 'Kilo', unit: 'kg', min: 20, max: 350, step: 0.1 },
  { key: 'yagOrani', label: 'Yağ Oranı', unit: '%', min: 2, max: 75, step: 0.1 },
  { key: 'yagKg', label: 'Yağ Kütlesi', unit: 'kg', min: 0.5, max: 250, step: 0.1 },
  { key: 'kasKg', label: 'Kas Kütlesi', unit: 'kg', min: 5, max: 150, step: 0.1 },
  { key: 'suOrani', label: 'Vücut Suyu', unit: '%', min: 20, max: 80, step: 0.1 },
  { key: 'icYag', label: 'İç Yağlanma', unit: '', min: 1, max: 60, step: 0.5 },
  { key: 'bmh', label: 'Bazal Metabolizma', unit: 'kcal', min: 500, max: 5000, step: 1 },
  { key: 'bel', label: 'Bel Çevresi', unit: 'cm', min: 40, max: 250, step: 0.5 },
  { key: 'kalca', label: 'Kalça Çevresi', unit: 'cm', min: 40, max: 250, step: 0.5 },
] as const;

export type OlcumAnahtari = (typeof olcumAlanlari)[number]['key'];

/** Danışanın kendisinin girebileceği ölçümler (evde tartılma vb.) */
export const danisanOlcumAlanlari: OlcumAnahtari[] = ['kilo', 'bel', 'kalca'];

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

export const aktiviteSecenekleri = [
  'Hareketsiz (masa başı, düzenli egzersiz yok)',
  'Hafif aktif (haftada 1–2 gün egzersiz)',
  'Orta aktif (haftada 3–5 gün egzersiz)',
  'Çok aktif (neredeyse her gün yoğun egzersiz)',
];

export const hastalikSecenekleri = [
  'Diyabet',
  'İnsülin direnci veya prediyabet',
  'PMOS (Polikistik Over Sendromu)',
  'Tiroid hastalığı',
  'Hipertansiyon',
  'Kolesterol veya kan yağları yüksekliği',
  'Kalp-damar hastalığı',
  'Karaciğer yağlanması',
  'Böbrek hastalığı',
  'Gut',
  'İrritabl bağırsak sendromu (IBS)',
  'Reflü veya gastrit',
  'Çölyak',
  'Kansızlık (anemi)',
];

export const gebelikSecenekleri = ['Yok', 'Gebeyim', 'Emziriyorum'];

export const kaynakSecenekleri = [
  'Instagram',
  'Google',
  'Arkadaş / tanıdık tavsiyesi',
  'Hekim yönlendirmesi',
  'Diğer',
];

export const sehirler = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin',
  'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
  'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum',
  'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkâri', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir',
  'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir',
  'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir',
  'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak', 'Yurt dışı',
];

export const paketDurumlari = {
  talep: 'Talep Alındı',
  odeme: 'Ödeme Bekleniyor',
  aktif: 'Aktif',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal Edildi',
} as const;

export const randevuDurumlari = {
  talep: 'Talep Alındı',
  onaylandi: 'Onaylandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal Edildi',
} as const;

export const hesapDurumlari = {
  aktif: 'Aktif',
  pasif: 'Pasif',
  riza_geri_cekildi: 'Açık Rıza Geri Çekildi',
  silme_talebi: 'Silme Talebi',
} as const;

/** Belge yükleme sınırları */
export const belgeSiniri = {
  enFazlaBayt: 10 * 1024 * 1024,
  turler: {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WEBP',
  } as Record<string, string>,
};

/** Oturum süreleri */
export const oturumSuresi = {
  danisanGun: 14,
  yoneticiSaat: 8,
};
