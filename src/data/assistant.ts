// Site asistanının metinleri ve kuralları.
//
// - "Hazır sorular" yapay zekâ kullanmadan, anında cevaplanır (ücretsiz). Metinleri buradan değiştirebilirsiniz.
// - "Kurallar", ziyaretçinin kendi yazdığı sorulara yapay zekânın nasıl cevap vereceğini belirler.
// - Metinlerde ücret, indirim, sonuç vaadi ve danışan yorumu bulunmamalıdır (Sağlık Hizmetlerinde Tanıtım ve
//   Bilgilendirme Faaliyetleri Hakkında Yönetmelik).
//
// Not: Bu dosya yalnızca site.ts ve services.ts'ten bilgi alır; buraya "astro:..." ile başlayan içe aktarma eklemeyin.

import { site, whatsappLink, fullAddress } from './site';
import { allServices } from './services';

/** Yanıtların altındaki butonlar. "sayfa:/yol/" ve "randevu:Hizmet Adı" biçimleri de kullanılabilir. */
export type AssistantAction =
  | 'randevu'
  | 'online'
  | 'whatsapp'
  | 'telefon'
  | 'harita'
  | `sayfa:${string}`
  | `randevu:${string}`;

export type ResolvedAction = { label: string; href: string; external?: boolean; primary?: boolean };

/** Çalışma saatlerini kısa bir cümleye çevirir: "Pazartesi–Cuma 09:00–18:00, Cumartesi 09:00–15:00, Pazar kapalı" */
export function hoursSummary(): string {
  const parts: string[] = [];
  let i = 0;
  const h = site.hours;
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
  badge: 'Yapay zekâ',
  /** Köşede birkaç saniye sonra beliren karşılama balonu */
  teaser: 'Merhaba! Size nasıl yardımcı olabilirim?',
  teaserDelayMs: 6000,
  welcome: `Merhaba! Ben ${site.clinicName}’nin yapay zekâ destekli asistanıyım. Randevu, online görüşme, hizmetler ve çalışma saatleriyle ilgili sorularınızı yanıtlayabilirim.`,
  /** Yapay zekâ bağlantısı kurulmamışken gösterilen karşılama metni */
  welcomeNoAi: 'Merhaba! Randevu, online görüşme, hizmetler ve çalışma saatleriyle ilgili sık sorulan soruları buradan hızlıca yanıtlayabilirim.',
  welcomeHintAi: 'Aşağıdan bir konu seçebilir ya da sorunuzu yazabilirsiniz.',
  welcomeHintNoAi: 'Aşağıdan bir konu seçebilirsiniz. Sorunuz listede yoksa WhatsApp’tan yazabilirsiniz.',
  inputPlaceholder: 'Sorunuzu yazın…',
  privacyNote: 'Asistan genel bilgi verir, sağlık değerlendirmesi yapmaz. Lütfen ad, telefon veya sağlık bilgisi yazmayın.',
  errorText: 'Şu anda yanıt veremiyorum. Sorunuzu WhatsApp’tan iletebilir ya da bizi arayabilirsiniz.',
  busyText: 'Kısa sürede çok sayıda mesaj gönderildi. Lütfen biraz bekleyip tekrar deneyin.',
};

/** Hazır sorular: yapay zekâ kullanılmadan anında cevaplanır. */
export const quickReplies: { q: string; a: string; actions?: AssistantAction[] }[] = [
  {
    q: 'Randevu nasıl alırım?',
    a: 'Randevu Oluştur sayfasındaki kısa formu doldurmanız yeterli. Bilgileriniz hazır bir mesaj olarak WhatsApp’a aktarılır; size uygun gün ve saati birlikte belirleriz. İsterseniz doğrudan WhatsApp’tan yazabilir ya da arayabilirsiniz.',
    actions: ['randevu', 'whatsapp'],
  },
  {
    q: 'Online görüşme nasıl oluyor?',
    a: 'Online görüşmeler WhatsApp görüntülü arama ile yapılır. Randevu formunda görüşme türü olarak “Online”ı seçmeniz yeterli; gün ve saat birlikte netleştirilir. Değerlendirme ve planlama süreci yüz yüze görüşmeyle aynıdır, yalnızca cihazla yapılan vücut analizi online yapılamaz.',
    actions: ['online', 'sayfa:/online-gorusme/'],
  },
  {
    q: 'İlk görüşmede neler yapılıyor?',
    a: 'İlk görüşmede beslenme alışkanlıklarınız, sağlık geçmişiniz ve hedefleriniz konuşulur; yüz yüze görüşmelerde vücut analiziyle başlangıç noktanız belirlenir. Ardından günlük rutininize uygun, kişiye özel bir beslenme planı hazırlanır ve kontrol görüşmeleriyle süreç takip edilir.',
    actions: ['randevu'],
  },
  {
    q: 'Hangi konularda destek alabilirim?',
    a: 'Kilo yönetimi (zayıflama, kilo alma, obezite), hastalıklarda beslenme (diyabet, insülin direnci, polikistik over, hipertansiyon, kolesterol, gut, bağırsak sorunları gibi), gebelik ve çocuk beslenmesi ile vücut analizi, kişiye özel beslenme planı ve takip konularında danışmanlık verilmektedir.',
    actions: ['sayfa:/hizmetler/', 'randevu'],
  },
  {
    q: 'Çalışma saatleri ve adres',
    a: `Çalışma saatleri: ${hoursSummary()}.\nAdres: ${fullAddress}.`,
    actions: ['harita', 'telefon'],
  },
  {
    q: 'Ücret bilgisi',
    a: 'Görüşme ücreti ve ödeme bilgileri, randevunuz netleştiğinde size ayrıca iletilir. Bilgi almak için WhatsApp’tan yazabilir ya da arayabilirsiniz.',
    actions: ['whatsapp', 'telefon'],
  },
  {
    q: 'Vücut kitle indeksi hesaplama',
    a: 'Vücut Kitle İndeksi hesaplama sayfamızda boy ve kilonuzu girerek VKİ değerinizi öğrenebilirsiniz. Bilgileriniz hiçbir yere gönderilmez; hesaplama cihazınızda yapılır.',
    actions: ['sayfa:/vucut-kitle-indeksi-hesaplama/'],
  },
];

/** Asistanın yönlendirebileceği sayfalar (blog yazıları ayrıca otomatik eklenir). */
export const assistantPages: Record<string, string> = {
  '/': 'Ana Sayfa',
  '/hakkinda/': 'Hakkında',
  '/hizmetler/': 'Hizmetler',
  '/vucut-kitle-indeksi-hesaplama/': 'VKİ Hesaplama',
  '/sertifikalar/': 'Sertifikalar',
  '/blog/': 'Blog',
  '/iletisim/': 'İletişim',
  '/online-gorusme/': 'Online Görüşme',
  '/randevu-olustur/': 'Randevu Oluştur',
  '/kvkk-aydinlatma-metni/': 'KVKK Aydınlatma Metni',
};

export const actionDefs: Record<'randevu' | 'online' | 'whatsapp' | 'telefon' | 'harita', ResolvedAction> = {
  randevu: { label: 'Randevu Oluştur', href: '/randevu-olustur/#randevu-formu', primary: true },
  online: { label: 'Online Randevu Oluştur', href: '/randevu-olustur/?tur=online#randevu-formu', primary: true },
  whatsapp: {
    label: 'WhatsApp’tan Yaz',
    href: whatsappLink('Merhaba, web sitenizdeki asistandan yönlendirildim. Bilgi almak istiyorum.'),
    external: true,
  },
  telefon: { label: `Ara: ${site.phoneDisplay}`, href: site.phoneHref },
  harita: { label: 'Yol Tarifi Al', href: site.mapsUrl, external: true },
};

/** Hazır cevaplardaki buton kısaltmalarını gerçek bağlantılara çevirir (site derlenirken). */
export function resolveAction(
  tag: string,
  pages: Record<string, string> = assistantPages,
  services: string[] = allServices.map((s) => s.name),
): ResolvedAction | null {
  const t = tag.trim();
  if (t in actionDefs) return actionDefs[t as keyof typeof actionDefs];
  if (t.startsWith('randevu:')) {
    const name = t.slice('randevu:'.length).trim();
    if (!services.includes(name)) return null;
    return {
      label: `Randevu: ${name}`,
      href: `/randevu-olustur/?hizmet=${encodeURIComponent(name)}#randevu-formu`,
      primary: true,
    };
  }
  if (t.startsWith('sayfa:')) {
    const path = t.slice('sayfa:'.length).trim();
    return pages[path] ? { label: pages[path], href: path } : null;
  }
  return null;
}

/** Yapay zekânın uyacağı kurallar (ziyaretçinin kendi yazdığı sorular için). */
export const assistantRules = `Sen, ${site.clinicName}’nin internet sitesindeki (www.diyetisyeneylemdizman.com) yapay zekâ destekli asistansın. Diyetisyen değilsin ve Diyetisyen Eylem Dizman adına tavsiye vermezsin. Sorulursa bir yapay zekâ asistanı olduğunu açıkça söyle.

GÖREVİN
Ziyaretçilerin klinik, hizmetler, randevu, online görüşme, çalışma saatleri ve iletişim hakkındaki sorularını YALNIZCA aşağıdaki SİTE BİLGİLERİ'ne dayanarak kısa ve nazik biçimde yanıtlamak; uygun olduğunda ziyaretçiyi doğru hizmete, sayfaya veya randevu formuna yönlendirmek.

KURALLAR
1. Yalnızca SİTE BİLGİLERİ'ndeki bilgileri kullan. Orada olmayan bir şey sorulursa (ör. otopark, taksit, belirli bir gün için boş saat) bilgi uydurma; sitede bu bilginin olmadığını söyle ve WhatsApp ya da telefonu öner.
2. Tanı koyma; tedavi, diyet listesi, kalori veya porsiyon miktarı, ilaç ya da takviye önerme; tahlil veya ölçüm sonucu yorumlama; vücut kitle indeksi hesaplama. Kişisel sağlık sorularında bunun kişisel değerlendirme gerektirdiğini ve görüşmede ele alınacağını söyle, uygun hizmet için randevu öner.
3. Genel beslenme sorularında kendi başına bilgi veya öneri üretme. Sitede ilgili bir blog yazısı varsa konusunu tek cümleyle söyleyip o yazıya yönlendir; yoksa konunun kişiye göre değiştiğini ve görüşmede ele alınabileceğini söyle.
4. Ücret, fiyat, indirim veya kampanya bilgisi verme. Ücret sorulursa: görüşme ücreti ve ödeme bilgileri randevu netleştiğinde kişiye ayrıca iletilir; bilgi için WhatsApp'tan yazılabilir ya da aranabilir.
5. Sonuç veya süre vaadi verme (ör. "ayda 5 kilo"). Başka diyetisyen ya da kurumlarla karşılaştırma yapma. Danışan yorumu, başarı hikâyesi veya "en iyi" gibi abartılı ifadeler kullanma. Israrcı, talep yaratmaya yönelik pazarlama dili kullanma; randevuyu yalnızca ziyaretçi ilgi gösterdiğinde veya kişisel değerlendirme gerektiğinde öner.
6. Ziyaretçiden ad, telefon, T.C. kimlik numarası, adres veya sağlık bilgisi isteme. Ziyaretçi bu tür bilgiler yazarsa bunları tekrar etme; nazikçe sohbet alanına kişisel bilgi yazmamasını, randevu formunu veya WhatsApp'ı kullanmasını hatırlat.
7. Göğüs ağrısı, nefes darlığı, bayılma, ciddi alerjik reaksiyon, bilinç bulanıklığı gibi acil durum belirtilerinden söz edilirse hemen 112'yi aramasını söyle.
8. Yeme bozukluğu, kendine zarar verme veya ciddi ruhsal sıkıntıdan söz edilirse şefkatli ve yargısız ol; bir hekimden veya ruh sağlığı uzmanından destek almasını öner, acil bir risk varsa 112'yi aramasını söyle. Bu durumlarda diyet veya kilo önerisi verme.
9. Klinik ve beslenme danışmanlığı dışındaki isteklere (ödev, kod, genel sohbet, siyaset vb.) kibarca yalnızca bu konularda yardımcı olabildiğini söyle.
10. Türkçe yaz; ziyaretçi başka bir dilde yazarsa o dilde kısa yanıt ver. "Siz" diye hitap et; sıcak ama profesyonel ol. Yanıtlar kısa olsun: en fazla 4 cümle ya da en fazla 4 kısa madde ("- " ile başlayan). Başlık, tablo, emoji, kalın yazı veya bağlantı (URL) kullanma.
11. Yönlendirme için yanıtın EN SONUNA, her biri ayrı satırda olmak üzere en fazla 2 eylem etiketi ekleyebilirsin:
[[randevu]] randevu formu
[[randevu:HİZMET ADI]] hizmeti seçili randevu formu (HİZMET ADI, HİZMETLER listesindeki adla birebir aynı olmalı)
[[online]] online görüşme için randevu formu
[[whatsapp]] WhatsApp'tan yazma
[[telefon]] telefonla arama
[[harita]] yol tarifi
[[sayfa:/yol/]] sitedeki bir sayfa (yalnızca SAYFALAR listesindeki yollar)
Etiketleri cümle içinde kullanma ve açıklama ekleme.`;

/** Kuralların sonuna eklenen örnek konuşmalar (biçimi göstermek için). */
export const assistantExamples = `ÖRNEKLER

Ziyaretçi: Hamileyim, beslenme desteği alabilir miyim?
Asistan: Evet, gebelik dönemine yönelik beslenme danışmanlığı veriliyor; plan, gebelik boyunca değişen ihtiyaçlarınıza göre hazırlanıyor. Görüşmeyi klinikte yüz yüze ya da WhatsApp görüntülü görüşmeyle online yapabilirsiniz.
[[randevu:Gebelikte Beslenme]]

Ziyaretçi: Şekerim 180 çıktı, ne yemeliyim?
Asistan: Kan şekeri değerinizi ve size uygun beslenmeyi değerlendirmek kişisel bir inceleme gerektirir; bunu sohbet üzerinden yapamıyorum. Hekiminizle görüşmenizi, beslenme planınız için de diyabet beslenmesi randevusu oluşturmanızı öneririm. Lütfen buraya kişisel sağlık bilgisi yazmayın.
[[randevu:Diyabet (Şeker) Beslenmesi]]

Ziyaretçi: Otopark var mı?
Asistan: Bu konuda sitede bir bilgi bulunmuyor. En doğru bilgiyi WhatsApp'tan ya da telefonla alabilirsiniz.
[[whatsapp]]
[[telefon]]`;
