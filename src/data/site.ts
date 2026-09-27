// Sitenin genel bilgileri. Telefon, adres, saat gibi bilgiler değişirse sadece bu dosyayı güncellemek yeterlidir.

export const site = {
  name: 'Diyetisyen Eylem Dizman',
  shortName: 'Dyt. Eylem Dizman',
  clinicName: 'Diyetisyen Eylem Dizman Kliniği',
  url: 'https://www.diyetisyeneylemdizman.com',
  defaultTitle: 'Diyetisyen Eylem Dizman | Seyhan/Adana ve Online Beslenme Danışmanlığı',
  defaultDescription:
    'Diyetisyen Eylem Dizman ile Seyhan/Adana’da yüz yüze veya WhatsApp görüntülü görüşmeyle online beslenme danışmanlığı. Kişiye özel beslenme planı, vücut analizi ve düzenli takip.',

  phoneDisplay: '0 505 825 87 45',
  phoneHref: 'tel:+905058258745',
  whatsappNumber: '905058258745',
  email: 'diyetisyeneylemdizman@gmail.com',

  address: {
    line1: 'Reşatbey Mah. Ordu Cad. 62013. Sk.',
    line2: 'Demir Apt. No: 5 Kat: 1 Daire: 2',
    postalCode: '01120',
    district: 'Seyhan',
    city: 'Adana',
    country: 'TR',
  },
  geo: { lat: 36.9868013, lng: 35.3327472 },
  mapsUrl: 'https://maps.app.goo.gl/u1TJpqdjabh4TgDE9',
  mapsEmbedQuery: 'Diyetisyen Eylem Dizman, Seyhan, Adana',

  instagram: 'https://www.instagram.com/diyetisyeneylemdizman/',
  instagramHandle: '@diyetisyeneylemdizman',
  linkedin: 'https://www.linkedin.com/in/eylem-dizman-8120a11b9/',

  onlinePlatform: 'WhatsApp görüntülü görüşme',

  // Yönetmelik gereği sitede görünen "site editörü" bilgisi
  editor: {
    name: 'Dyt. Eylem Dizman',
    email: 'diyetisyeneylemdizman@gmail.com',
  },

  hours: [
    { day: 'Pazartesi', short: 'Pzt', open: '09:00', close: '18:00' },
    { day: 'Salı', short: 'Sal', open: '09:00', close: '18:00' },
    { day: 'Çarşamba', short: 'Çar', open: '09:00', close: '18:00' },
    { day: 'Perşembe', short: 'Per', open: '09:00', close: '18:00' },
    { day: 'Cuma', short: 'Cum', open: '09:00', close: '18:00' },
    { day: 'Cumartesi', short: 'Cmt', open: '09:00', close: '15:00' },
    { day: 'Pazar', short: 'Paz', open: null, close: null },
  ] as { day: string; short: string; open: string | null; close: string | null }[],
} as const;

export const fullAddress = `${site.address.line1} ${site.address.line2}, ${site.address.postalCode} ${site.address.district}/${site.address.city}`;

export const whatsappLink = (text?: string) =>
  `https://wa.me/${site.whatsappNumber}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export const nav = [
  { label: 'Hakkında', href: '/hakkinda/' },
  { label: 'Sertifikalar', href: '/sertifikalar/' },
  { label: 'Hizmetler', href: '/hizmetler/' },
  { label: 'VKİ Hesaplama', href: '/vucut-kitle-indeksi-hesaplama/', title: 'Vücut Kitle İndeksi Hesaplama' },
  { label: 'Online Görüşme', href: '/online-gorusme/' },
  { label: 'Blog & Reels', href: '/blog/' },
  { label: 'İletişim', href: '/iletisim/' },
];
