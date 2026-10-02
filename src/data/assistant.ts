// Site asistanı: metinler, hazır sorular ve anahtar kelimeler.
//
// Asistan yapay zekâ kullanmaz ve ücretsizdir. Ziyaretçinin yazdığı soruyu aşağıdaki anahtar kelimelerle eşleştirip
// hazır cevabı gösterir. Her şey ziyaretçinin tarayıcısında çalışır; yazılanlar hiçbir yere gönderilmez.
//
// Yeni bir soru-cevap eklemek için "topics" listesine bir öğe ekleyin:
//   id      benzersiz kısa ad
//   q       butonda görünen soru
//   a       cevap (satır başında "- " ile madde yazılabilir)
//   actions cevabın altındaki butonlar (aşağıdaki "Butonlar" listesine bakın)
//   k       anahtar kelimeler: küçük harfle, Türkçe karakterli ya da karaktersiz yazılabilir. Kelimenin başı yeterlidir;
//           ör. "hamile" yazılırsa "hamileyim", "hamilelikte" de eşleşir. Uzun ve belirgin kelimeler daha çok puan alır.
//   chip    true ise asistan açılınca hazır soru olarak gösterilir
//
// Butonlar: 'randevu', 'online', 'whatsapp', 'telefon', 'harita', 'acil', 'sayfa:/yol/', 'randevu:Hizmet Adı'
//
// Metinlerde ücret, indirim, sonuç vaadi ve danışan yorumu bulunmamalıdır (Sağlık Hizmetlerinde Tanıtım ve
// Bilgilendirme Faaliyetleri Hakkında Yönetmelik). Asistan kişiye özel sağlık tavsiyesi vermez.

import { site, whatsappLink, fullAddress } from './site';
import { allServices } from './services';
import { onlinePrepare } from './online-gorusme';

export type AssistantAction =
  | 'randevu'
  | 'online'
  | 'whatsapp'
  | 'telefon'
  | 'harita'
  | 'acil'
  | `sayfa:${string}`
  | `randevu:${string}`;

export type ResolvedAction = { label: string; href: string; external?: boolean; primary?: boolean };

export type Topic = {
  id: string;
  q?: string;
  a: string;
  actions?: AssistantAction[];
  k: string[];
  chip?: boolean;
};

/** Metni eşleştirme için sadeleştirir: "Hamileyim, ÜCRET?" → "hamileyim ucret" */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Çalışma saatlerini kısa bir cümleye çevirir: "Pazartesi–Cuma 09:00–18:00, Cumartesi 09:00–15:00, Pazar kapalı" */
export function hoursSummary(): string {
  const parts: string[] = [];
  const h = site.hours;
  let i = 0;
  while (i < h.length) {
    let j = i;
    while (j + 1 < h.length && h[j + 1].open === h[i].open && h[j + 1].close === h[i].close) j++;
    const days = i === j ? h[i].day : `${h[i].day}–${h[j].day}`;
    parts.push(h[i].open ? `${days} ${h[i].open}–${h[i].close}` : `${days} kapalı`);
    i = j + 1;
  }
  return parts.join(', ');
}

export const assistant = {
  title: 'Asistan',
  subtitle: site.clinicName,
  /** Köşede birkaç saniye sonra beliren karşılama balonu */
  teaser: 'Merhaba! Size nasıl yardımcı olabilirim?',
  teaserDelayMs: 6000,
  welcome: `Merhaba! Ben ${site.clinicName}nin site asistanıyım. Randevu, online görüşme, hizmetler ve çalışma saatleriyle ilgili sorularınızı yanıtlayabilirim.`,
  hint: 'Aşağıdan bir konu seçebilir ya da sorunuzu yazabilirsiniz.',
  inputPlaceholder: 'Sorunuzu yazın…',
  privacyNote: 'Asistan hazır bilgilerle yanıt verir, kişisel sağlık değerlendirmesi yapmaz. Yazdıklarınız hiçbir yere gönderilmez.',
  loadError: 'Asistan şu anda yüklenemedi. Sorunuzu WhatsApp’tan iletebilir veya telefonla arayabilirsiniz.',
};

/** Hazır sorular ve cevaplar */
export const topics: Topic[] = [
  {
    id: 'randevu',
    chip: true,
    q: 'Randevu nasıl alırım?',
    a: 'Randevu Talebi Oluştur sayfasında görüşme türünü seçip takvimden size uygun gün ve saati işaretlemeniz yeterli. Bilgileriniz hazır bir mesaj olarak WhatsApp’a aktarılır; seçtiğiniz gün ve saat bir taleptir, randevu WhatsApp üzerinden onaylandıktan sonra kesinleşir. İsterseniz doğrudan WhatsApp’tan yazabilir veya telefonla arayabilirsiniz.',
    actions: ['randevu', 'whatsapp'],
    k: ['randevu', 'randevu al', 'görüşme ayarla', 'görüşme almak', 'görüşmek istiyorum', 'kayıt ol', 'başvuru', 'müsait', 'boş saat', 'boş gün', 'ne zaman gelebilir'],
  },
  {
    id: 'online',
    chip: true,
    q: 'Online görüşme nasıl oluyor?',
    a: 'Randevu formunda görüşme türü olarak “Online” seçilir ve takvimden uygun gün ve saat işaretlenir. Randevu talebi WhatsApp üzerinden iletilir ve onaylanır; randevu saatinde danışan aranır. Değerlendirme ve planlama süreci yüz yüze görüşmeyle aynıdır; yalnızca cihazla yapılan vücut analizi klinikte yapılabilir. Online görüşme başka bir şehirden veya yurt dışından da yapılabilir.',
    actions: ['online', 'sayfa:/online-gorusme/'],
    k: ['online', 'online randevu', 'online görüşme', 'onlain', 'uzaktan', 'internetten', 'internet üzerinden', 'görüntülü', 'video', 'şehir dışı', 'başka şehir', 'başka ilde', 'yurt dışı', 'yurtdışı', 'gelemiyorum', 'gelemem', 'evden'],
  },
  {
    id: 'ilk-gorusme',
    chip: true,
    q: 'İlk görüşmede neler yapılıyor?',
    a: 'İlk görüşmede beslenme alışkanlıkları, sağlık geçmişi ve hedefler konuşulur; uygun olduğunda vücut bileşimi ölçümüyle başlangıç noktası belirlenir. Ardından günlük rutine uygun, kişiye özel bir beslenme planı hazırlanır ve kontrol görüşmeleriyle süreç takip edilir.',
    actions: ['randevu'],
    k: ['ilk görüşme', 'ilk seans', 'ilk randevu', 'ilk geliş', 'süreç', 'nasıl ilerli', 'nasıl çalış', 'neler yapıl', 'ne yapılıyor', 'takip', 'kontrol görüşme', 'kontrole'],
  },
  {
    id: 'hizmetler',
    chip: true,
    q: 'Hangi konularda destek alabilirim?',
    a: 'Beslenme danışmanlığı ve takip, kilo yönetimi, metabolik ve hormonal sağlık (diyabet, insülin direnci, PMOS, tiroid hastalıkları gibi), sindirim sistemi ve bağırsak sağlığı, besin alerjisi ve intoleranslar, deri sağlığı, kalp-damar sağlığı ve gut ile gebelik, emzirme, çocukluk ve menopoz gibi yaşam dönemlerinde beslenme konularında danışmanlık verilmektedir.',
    actions: ['sayfa:/hizmetler/', 'randevu'],
    k: ['hizmet', 'konular', 'hangi konu', 'neler yapıyor', 'diyet yap', 'diyet program', 'diyetler', 'diyetleri', 'hangi diyet', 'beslenme danışman', 'danışmanlık', 'program', 'hangi hastalık'],
  },
  {
    id: 'saat-adres',
    chip: true,
    q: 'Çalışma saatleri ve adres',
    a: `Çalışma saatleri: ${hoursSummary()}.\nAdres: ${fullAddress}.`,
    actions: ['harita', 'telefon'],
    k: ['saat', 'kaçta', 'açık mı', 'açık mısınız', 'açık oluyor', 'kapalı', 'cumartesi', 'pazar', 'hafta sonu', 'haftasonu', 'hafta içi', 'mesai', 'adres', 'nerede', 'nerde', 'neresi', 'konum', 'lokasyon', 'yol tarifi', 'harita', 'nasıl gelir', 'seyhan', 'adana', 'reşatbey', 'ordu cad'],
  },
  {
    id: 'iletisim',
    chip: true,
    q: 'İletişim bilgileri',
    a: `Telefon ve WhatsApp: ${site.phoneDisplay}\nE-posta: ${site.email}\nInstagram: ${site.instagramHandle}`,
    actions: ['whatsapp', 'telefon'],
    k: ['telefon', 'numara', 'iletişim', 'ulaşabilir', 'ulaşmak', 'arayabilir', 'aramak', 'whatsapp', 'watsap', 'vatsap', 'mail', 'e posta', 'eposta', 'instagram', 'insta', 'mesaj at', 'yazabilir'],
  },
  {
    id: 'paketler',
    chip: true,
    q: 'Paketler',
    a: 'Her hizmet alanı için 1 ay (4 görüşme), 2 ay (8 görüşme) ve 3 ay (12 görüşme) olmak üzere danışmanlık paketleri vardır; görüşmeler yüz yüze veya online yapılabilir. Paketlerin kapsamını Paketler sayfasında görebilir, ilgilendiğiniz paketin altındaki “Bilgi Almak İstiyorum” düğmesiyle WhatsApp’tan bilgi alabilirsiniz.',
    actions: ['sayfa:/paketler/', 'whatsapp'],
    k: ['paket', 'aylık', 'bir aylık', 'iki aylık', 'üç aylık', '1 aylık', '2 aylık', '3 aylık', 'kaç görüşme', 'görüşme sayısı', 'kaç seans', 'seans sayısı', 'kaç kez görüş'],
  },
  {
    id: 'ucret',
    chip: true,
    q: 'Ücret bilgisi',
    a: 'Ücret ve ödeme bilgisi size WhatsApp’tan veya telefonla birebir iletilir. Paketlerin süresini, görüşme sayısını ve kapsamını Paketler sayfasında görebilirsiniz.',
    actions: ['whatsapp', 'telefon', 'sayfa:/paketler/'],
    k: ['ücret', 'fiyat', 'kaç para', 'kaç tl', 'kaç lira', 'para', 'ödeme', 'tutar', 'tutuyor', 'pahalı', 'indirim', 'kampanya', 'taksit', 'kredi kart', 'havale', 'eft', 'ücretli', 'ücretsiz', 'bedava'],
  },
  {
    id: 'vki',
    chip: true,
    q: 'Vücut kitle indeksi hesaplama',
    a: 'Vücut Kitle İndeksi Hesaplama sayfasında cinsiyetinizi, boyunuzu, kilonuzu ve yaşınızı girerek VKİ değerinizi öğrenebilirsiniz. Gebelikte gebelik öncesi boy ve kilo kullanılır. Bilgileriniz hiçbir yere gönderilmez; hesaplama cihazınızda yapılır.',
    actions: ['sayfa:/vucut-kitle-indeksi-hesaplama/'],
    k: ['vki', 'vücut kitle', 'beden kitle', 'bmi', 'ideal kilo', 'kilom', 'boyum', 'boy kilo', 'hesapla', 'normal kilo'],
  },
  {
    id: 'hazirlik',
    q: 'Online görüşmeye nasıl hazırlanmalıyım?',
    a: `Online görüşmeden önce şunları hazırlamanız önerilir:\n${onlinePrepare.map((p) => `- ${p}`).join('\n')}`,
    actions: ['sayfa:/online-gorusme/'],
    k: ['hazırlan', 'hazırlık', 'ne gerek', 'gerekenler', 'gerekli', 'yanımda', 'getir', 'ne getir', 'tahlil getir', 'önceden'],
  },
  {
    id: 'sure',
    q: 'Görüşme ne kadar sürüyor?',
    a: 'Görüşme süresiyle ilgili en doğru bilgiyi WhatsApp’tan ya da telefonla alabilirsiniz.',
    actions: ['whatsapp', 'telefon'],
    k: ['ne kadar sürüyor', 'ne kadar sürer', 'ne kadar sürecek', 'kaç dakika', 'kaç saat sürüyor', 'süresi', 'görüşme süre', 'seans süre', 'uzun sürer'],
  },
  {
    id: 'iptal',
    q: 'Randevumu nasıl değiştirebilir veya iptal edebilirim?',
    a: 'Randevu değişikliği veya iptali için WhatsApp’tan yazabilir ya da telefonla arayabilirsiniz.',
    actions: ['whatsapp', 'telefon'],
    k: ['iptal', 'ertele', 'değiştir', 'randevumu', 'randevuma', 'gelemeyeceğim', 'gelemiyecem'],
  },
  {
    id: 'vaat',
    q: 'Ne kadar sürede sonuç alırım?',
    a: 'Sonuçlar kişiden kişiye değişir; bu nedenle belirli bir süre veya kilo kaybı vaat edilemez. Size uygun, gerçekçi hedefler ilk görüşmede birlikte belirlenir.',
    actions: ['randevu'],
    k: ['ne kadar sürede', 'kaç haftada', 'kaç ayda', 'kaç günde', 'garanti', 'kesin sonuç', 'hızlı kilo', 'kaç kilo ver', 'ayda kaç', 'haftada kaç'],
  },
  {
    id: 'hakkinda',
    q: 'Diyetisyen Eylem Dizman hakkında',
    a: `${site.name}, İzmir Kâtip Çelebi Üniversitesi Sağlık Bilimleri Fakültesi Beslenme ve Diyetetik Bölümünden mezun olarak diyetisyen unvanını almıştır. Mesleki çalışmalarını ${site.clinicName}nde sürdürmekte; danışanlarıyla yüz yüze veya online olarak görüşmektedir. Katıldığı eğitim ve kongrelere ait belgeler Sertifikalar sayfasında yer alır.`,
    actions: ['sayfa:/hakkinda/', 'sayfa:/sertifikalar/'],
    k: ['kimdir', 'kimsiniz', 'hakkında', 'eğitim', 'mezun', 'üniversite', 'diploma', 'sertifika', 'deneyim', 'tecrübe', 'özgeçmiş', 'uzman', 'uzman diyetisyen'],
  },
  {
    id: 'blog',
    q: 'Blog & Reels',
    a: 'Blog & Reels sayfasında beslenme üzerine yazılar ve Instagram’da paylaşılan Reels videoları yer alıyor.',
    actions: ['sayfa:/blog/'],
    k: ['blog', 'yazı', 'makale', 'okumak', 'okuyabilir', 'reels', 'reel', 'video', 'videolar', 'izlemek', 'içerik'],
  },
  {
    id: 'kvkk',
    q: 'Kişisel verilerim',
    a: 'Kişisel verilerinizin nasıl işlendiğini KVKK Aydınlatma Metni’nde bulabilirsiniz. Bu asistana yazdıklarınız hiçbir yere gönderilmez.',
    actions: ['sayfa:/kvkk-aydinlatma-metni/'],
    k: ['kvkk', 'gizlilik', 'kişisel veri', 'verilerim', 'verileri'],
  },
];

/** Acil durum belirtileri: diğer her şeyden önce kontrol edilir */
export const emergency: Topic = {
  id: 'acil',
  a: 'Anlattığınız belirtiler acil bir duruma işaret edebilir. Lütfen vakit kaybetmeden 112’yi arayın.',
  actions: ['acil'],
  k: ['göğüs ağrı', 'göğsüm ağrı', 'göğsümde ağrı', 'nefes alamıyorum', 'nefes darlığ', 'bayıld', 'bayılıyor', 'bayılacak', 'bilincini kaybet', 'felç', 'zehirlen', 'alerjik reaksiyon', 'anafilaksi', 'kalp krizi geçiriyor', 'kriz geçiriyor', 'nöbet geçiriyor', 'acil durum'],
};

/** Ruhsal sıkıntı, yeme bozukluğu, kendine zarar verme */
export const sensitive: Topic = {
  id: 'destek',
  a: 'Bunu paylaştığınız için teşekkür ederim; yalnız değilsiniz. Yaşadıklarınız için bir hekimden ya da ruh sağlığı uzmanından destek almanız çok önemli. Kendinize zarar verme düşünceniz ya da acil bir durum varsa lütfen hemen 112’yi arayın.',
  actions: ['acil'],
  k: ['intihar', 'kendime zarar', 'kendimi öldür', 'kendimi kes', 'yaşamak istemiyorum', 'ölmek istiyorum', 'kendimi kustur', 'kusturuyorum', 'yemek yiyemiyorum', 'yemek yemiyorum', 'anoreksi', 'bulimi', 'tıkınırcasına', 'yeme bozukluğ', 'kendimden nefret'],
};

/** Kişiye özel sağlık/beslenme soruları: kişisel tavsiye verilmez, görüşmeye yönlendirilir */
export const personal: Topic = {
  id: 'kisisel',
  a: 'Size özel beslenme önerisi, tahlil ya da ilaç değerlendirmesi kişisel bir inceleme gerektirir; bu nedenle burada tavsiye veremiyorum. Bu konular görüşmede ele alınır.',
  actions: ['randevu', 'whatsapp'],
  k: ['ne yemeli', 'ne yiyebil', 'yiyebilir miyim', 'yesem', 'yersem', 'içebilir miyim', 'içsem', 'kaç kalori', 'kalori', 'diyet listesi', 'liste ver', 'liste atar', 'liste gönder', 'program yaz', 'menü yaz', 'tahlilim', 'tahlil sonuç', 'sonuçlarım', 'değerim', 'değerlerim', 'ilaç', 'takviye', 'vitamin', 'hapı', 'zararlı mı', 'faydalı mı', 'yararlı mı', 'sağlıklı mı', 'işe yarar mı', 'yapmalı mıyım', 'kilo aldırır mı', 'kilo yaptırır mı', 'zayıflatır mı'],
};

export const greeting: Topic = {
  id: 'selam',
  a: 'Merhaba! Size nasıl yardımcı olabilirim? Aşağıdan bir konu seçebilir ya da sorunuzu yazabilirsiniz.',
  k: ['merhaba', 'merhabalar', 'selam', 'slm', 'iyi günler', 'günaydın', 'iyi akşamlar', 'iyi geceler'],
};

export const thanks: Topic = {
  id: 'tesekkur',
  a: 'Rica ederim! Başka bir sorunuz olursa buradayım.',
  k: ['teşekkür', 'sağol', 'sağ ol', 'eyvallah', 'tşk', 'tsk', 'çok iyi', 'harika', 'süper'],
};

/** Eşleşme bulunamazsa */
export const fallback: Topic = {
  id: 'bulunamadi',
  a: 'Bu sorunun cevabını burada bulamadım. Aşağıdaki konulardan birini seçebilir, sorunuzu WhatsApp’tan iletebilir veya telefonla arayabilirsiniz.',
  actions: ['whatsapp', 'telefon'],
  k: [],
};

/** Hizmetler için ek anahtar kelimeler (hizmet adı ayrıca otomatik eklenir). Anahtar, services.ts'teki adla aynı olmalı. */
export const serviceKeywords: Record<string, string[]> = {
  'Yüz Yüze ve Online Danışmanlık': ['yüz yüze', 'kliniğe gel', 'birebir'],
  'Beslenme Planı Oluşturma': ['beslenme planı', 'diyet planı', 'kişiye özel plan', 'kişiye özel diyet'],
  'Sağlıklı Beslenme Alışkanlıkları': ['sağlıklı beslen', 'dengeli beslen', 'beslenme öneri', 'sağlıklı yaşam', 'alışkanlık'],
  'Beslenme Takibi': ['beslenme takibi', 'düzenli takip'],
  'Vücut Bileşimi Takibi': ['vücut analiz', 'vücut bileşim', 'yağ oranı', 'kas oranı', 'sıvı oranı', 'ölçüm', 'analiz cihaz', 'tanita'],
  'Kilo Verme Diyeti': ['zayıfla', 'kilo ver', 'kilomu ver', 'kilolarımı ver', 'kilolarımdan kurtul', 'incel', 'kilo kayb', 'yağ yak', 'göbek', 'fazla kilo', 'kilolu'],
  'Sağlıklı Kilo Alma': ['kilo al', 'zayıfım', 'çok zayıf', 'kilo alamıyorum'],
  'Obezitede Beslenme Desteği': ['obez', 'obezite', 'morbid'],
  'Kilo Koruma ve Alışkanlıkların Sürdürülmesi': ['kilo koru', 'kilomu koru', 'kiloyu koru', 'geri alma', 'geri aldım', 'geri alıyorum'],
  'Diyabette Beslenme': ['diyabet', 'şeker hasta', 'şeker hastalığı', 'kan şekeri', 'şekerim', 'tip 1', 'tip 2'],
  'İnsülin Direnci ve Prediyabet': ['insülin', 'insülin direnc', 'prediyabet', 'gizli şeker'],
  'PMOS (Polikistik Over Sendromu)': ['polikistik', 'pkos', 'pcos', 'pmos', 'poliendokrin'],
  'Tiroid Hastalıklarında Beslenme': ['tiroid', 'tiroit', 'hashimoto', 'hipotiroid', 'hipertiroid', 'guatr'],
  'Metabolik Sendrom ve Karaciğer Yağlanması': ['metabolik sendrom', 'karaciğer', 'yağlanma', 'yağlı karaciğer'],
  SIBO: ['sibo', 'bakteri çoğalma'],
  'İrritabl Bağırsak Sendromu (IBS)': ['ibs', 'irritabl', 'huzursuz bağırsak', 'spastik kolon'],
  'İnflamatuvar Bağırsak Hastalıkları': ['crohn', 'ülseratif', 'kolit', 'inflamatuvar'],
  'Diğer Sindirim Sistemi Yakınmaları': ['bağırsak', 'şişkinlik', 'şişlik', 'gaz', 'kabız', 'ishal', 'hazımsızlık', 'reflü', 'gastrit', 'sindirim', 'karın ağrı'],
  'Çölyak Hastalığı': ['çölyak', 'gluten', 'glutensiz'],
  'Besin Alerjisi ve İntoleranslar': ['alerji', 'alerjim', 'intolerans', 'laktoz', 'besin hassasiyet', 'tolere'],
  'Deri Sağlığı ve Beslenme': ['cilt', 'cildim', 'deri sağlığ', 'deri hastalığ', 'akne', 'sivilce', 'egzama', 'atopik', 'sedef', 'psoriazis'],
  'Hipertansiyonda Beslenme': ['hipertansiyon', 'tansiyon', 'yüksek tansiyon', 'kan basınc'],
  'Kolesterol ve Kan Yağları Yüksekliğinde Beslenme': ['kolesterol', 'trigliserit', 'kan yağ', 'ldl'],
  'Kalp-Damar Hastalıklarında Beslenme': ['kalp', 'damar', 'koroner', 'stent', 'bypass'],
  'Gut Hastalığında Beslenme': ['gut', 'ürik asit', 'pürin'],
  'Gebelikte Beslenme': ['gebe', 'hamile', 'gebelik', 'bebek bekli'],
  'Emzirme Döneminde Beslenme': ['emzir', 'lohusa', 'anne sütü', 'doğum sonrası'],
  'Çocuk ve Ergen Beslenmesi': ['çocuk', 'çocuğum', 'oğlum', 'kızım', 'bebek', 'ek gıda', 'okul çağı', 'ergen'],
  'Menopoz Döneminde Beslenme': ['menopoz', 'menapoz', 'klimakteri'],
};

/** Bazı hizmetlerin cevabına eklenecek not */
export const serviceNotes: Record<string, { extra?: string; noOnline?: boolean }> = {
  'Vücut Bileşimi Takibi': {
    extra: 'Cihazla yapılan vücut analizi yalnızca klinikte yapılabilir; online görüşmelerde bazı ölçümler evde alınır.',
    noOnline: true,
  },
};

/** Asistanın yönlendirebileceği sayfalar (blog yazıları ayrıca otomatik eklenir). */
export const assistantPages: Record<string, string> = {
  '/': 'Ana Sayfa',
  '/hakkinda/': 'Hakkında',
  '/hizmetler/': 'Hizmetler',
  '/paketler/': 'Paketler',
  '/vucut-kitle-indeksi-hesaplama/': 'VKİ Hesapla',
  '/sertifikalar/': 'Sertifikalar',
  '/blog/': 'Blog & Reels',
  '/iletisim/': 'İletişim',
  '/online-gorusme/': 'Online Görüşme',
  '/randevu-olustur/': 'Randevu Talebi Oluştur',
  '/kvkk-aydinlatma-metni/': 'KVKK Aydınlatma Metni',
};

export const actionDefs: Record<'randevu' | 'online' | 'whatsapp' | 'telefon' | 'harita' | 'acil', ResolvedAction> = {
  randevu: { label: 'Randevu Talebi Oluştur', href: '/randevu-olustur/#randevu-formu', primary: true },
  online: { label: 'Online Randevu Talebi Oluştur', href: '/randevu-olustur/?tur=online#randevu-formu', primary: true },
  whatsapp: {
    label: 'WhatsApp’tan Yaz',
    href: whatsappLink('Merhaba, web sitenizden ulaşıyorum. Bilgi almak istiyorum.'),
    external: true,
  },
  telefon: { label: `Ara: ${site.phoneDisplay}`, href: site.phoneHref },
  harita: { label: 'Yol Tarifi Al', href: site.mapsUrl, external: true },
  acil: { label: '112’yi Ara', href: 'tel:112', primary: true },
};

/** Buton kısaltmalarını gerçek bağlantılara çevirir. */
export function resolveAction(
  tag: string,
  pages: Record<string, string> = assistantPages,
  services: string[] = allServices.filter((s) => s.secilebilir).map((s) => s.name),
): ResolvedAction | null {
  const t = tag.trim();
  if (Object.prototype.hasOwnProperty.call(actionDefs, t)) return actionDefs[t as keyof typeof actionDefs];
  if (t.startsWith('randevu:')) {
    const name = t.slice('randevu:'.length).trim();
    if (!services.includes(name)) return null;
    return {
      label: `Randevu Talebi: ${name}`,
      href: `/randevu-olustur/?hizmet=${encodeURIComponent(name)}#randevu-formu`,
      primary: true,
    };
  }
  if (t.startsWith('sayfa:')) {
    const path = t.slice('sayfa:'.length).trim();
    return Object.prototype.hasOwnProperty.call(pages, path) ? { label: pages[path], href: path } : null;
  }
  return null;
}
