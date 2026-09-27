// Online Görüşme sayfasındaki içerikler. Site asistanı da bu bilgileri kullanır.

export const onlineSteps = [
  {
    icon: 'calendar',
    title: 'Randevu talebi',
    text: 'Randevu formunda görüşme türü olarak “Online”ı seçin. Talebiniz WhatsApp üzerinden bize ulaşır.',
  },
  {
    icon: 'clock',
    title: 'Gün ve saat',
    text: 'Size uygun gün ve saat birlikte netleştirilir; görüşme bilgileri size iletilir.',
  },
  {
    icon: 'video',
    title: 'Görüntülü görüşme',
    text: 'Randevu saatinde WhatsApp görüntülü görüşmeyle bağlanır, beslenme değerlendirmenizi birlikte yaparız.',
  },
  {
    icon: 'clipboard',
    title: 'Plan ve takip',
    text: 'Size özel beslenme planınız hazırlanır; kontrol görüşmeleriyle süreciniz takip edilir.',
  },
] as const;

export const onlinePrepare = [
  'Güncel kilonuz (mümkünse sabah, aç karnına tartılmış)',
  'Boy bilginiz ve mezura ile ölçülmüş bel çevreniz',
  'Varsa son 3–6 ay içindeki kan tahlili sonuçlarınız',
  'Kullandığınız ilaç ve takviyelerin listesi',
  'Birkaç günlük yeme içme alışkanlıklarınıza dair kısa notlar',
];

export const onlineTech = [
  { icon: 'whatsapp', text: 'WhatsApp yüklü bir telefon veya bilgisayar' },
  { icon: 'wifi', text: 'Görüntülü görüşme için yeterli internet bağlantısı' },
  { icon: 'user', text: 'Rahat konuşabileceğiniz sessiz bir ortam' },
] as const;

export const onlineFaqs = [
  {
    q: 'Online görüşme, yüz yüze görüşmeden farklı mı?',
    a: 'Değerlendirme ve planlama süreci aynıdır. Tek fark, cihazla yapılan vücut analizinin online görüşmede yapılamamasıdır; bunun yerine bazı ölçümleri evde kendiniz alırsınız.',
  },
  {
    q: 'Vücut analizi online yapılabilir mi?',
    a: 'Cihazla yapılan vücut analizi için kliniğe gelmeniz gerekir. Online görüşmelerde kilo, bel ve kalça çevresi gibi ölçümleri evde almanız istenir.',
  },
  {
    q: 'Görüşme ücretini ve ödeme bilgilerini nasıl öğrenebilirim?',
    a: 'Görüşme ücreti ve ödeme bilgileri, randevunuz netleştiğinde size ayrıca iletilir.',
  },
  {
    q: 'Yurt dışından veya başka bir şehirden görüşme yapabilir miyim?',
    a: 'Evet. İnternet bağlantınız ve WhatsApp’ınız olduğu sürece bulunduğunuz yerden online görüşme yapabilirsiniz.',
  },
];
