// Online Görüşme sayfasındaki içerikler. Site asistanı da bu bilgileri kullanır.

export const onlineSteps = [
  {
    icon: 'calendar',
    title: 'Randevu talebi',
    text: 'Randevu formunda görüşme türü olarak “Online” seçilir. Randevu talebi WhatsApp üzerinden iletilir.',
  },
  {
    icon: 'clock',
    title: 'Tarih ve saat',
    text: 'Takvimden uygun gün ve saat seçilir. Randevu bilgileri WhatsApp üzerinden iletilerek onaylanır.',
  },
  {
    icon: 'phone',
    title: 'WhatsApp araması',
    text: 'Randevu saatinde danışan aranır. Beslenme değerlendirmesi görüşme sırasında gerçekleştirilir.',
  },
  {
    icon: 'clipboard',
    title: 'Plan ve takip',
    text: 'Değerlendirme sonrasında kişiye özel beslenme planı hazırlanır. Süreç, kontrol görüşmeleriyle takip edilir.',
  },
] as const;

export const onlinePrepare = [
  'Güncel kilonuz (mümkünse sabah, aç karnına tartılmış)',
  'Boy bilginiz ve varsa mezura ile ölçülmüş bel çevreniz',
  'Kullandığınız ilaç ve takviyelerin listesi',
  'Birkaç günlük yeme içme alışkanlıklarınıza dair kısa notlar',
  'Rahat konuşabileceğiniz sessiz bir ortam',
];

/** "Görüşmeden önce hazırlayın" listesinin altındaki not */
export const onlineHealthNote =
  'Danışanın mevcut sağlık raporları ve yakın tarihli tahlil sonuçları, paylaşmayı tercih etmesi hâlinde beslenme değerlendirmesinde dikkate alınır. Tıbbi değerlendirme gerektiren durumlarda danışan hekime yönlendirilir.';

/** Ödeme bilgisi notu */
export const paymentNote = 'Ödeme bilgileri randevunuz netleşmeden size ayrıca iletilir.';

export const onlineFaqs = [
  {
    q: 'Online görüşme, yüz yüze görüşmeden farklı mı?',
    a: 'Değerlendirme ve planlama süreci aynıdır. Tek fark, cihazla yapılan vücut analizinin online görüşmede yapılamamasıdır; bunun yerine bazı ölçümler evde alınır.',
  },
  {
    q: 'Vücut analizi online yapılabilir mi?',
    a: 'Cihazla yapılan vücut analizi yalnızca klinikte yapılabilir. Online görüşmelerde kilo, bel ve kalça çevresi gibi ölçümler evde alınır.',
  },
  {
    q: 'Ödeme bilgilerini nasıl öğrenebilirim?',
    a: 'Ödeme bilgileri randevunuz netleşmeden size ayrıca iletilir.',
  },
  {
    q: 'Yurt dışından veya başka bir şehirden görüşme yapabilir miyim?',
    a: 'Evet. Online görüşme bulunduğunuz yerden yapılabilir.',
  },
];
