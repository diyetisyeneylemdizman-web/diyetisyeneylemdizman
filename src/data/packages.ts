// Paketler sayfası (/paketler/)
//
// ÖNEMLİ (Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik, md. 5/1-m):
// Sitede ücret, indirim, kampanya veya "en çok tercih edilen" gibi ifadeler yer almaz. Paketlerin yalnızca adı, süresi,
// görüşme sayısı ve kapsamı yazılır. Ücret ve ödeme bilgisi danışana WhatsApp'ta veya telefonda birebir iletilir.
// Sonuç vaadi ("x kilo verirsiniz" gibi) yazılmaz.
//
//   baslik      Paketin adı (WhatsApp mesajında da bu ad geçer)
//   alan        Hizmetler sayfasındaki ilgili bölümün kimliği (src/data/services.ts → serviceAreas.id)
//   konular     Paket kapsamındaki başlıklar (kısa, madde madde)
//   liste       Cümle hâlindeki kapsam maddeleri
//   metin       Madde yerine paragraf
//   secenekler  Süre ve görüşme sayısı; verilmezse paketSecenekleri kullanılır

import type { IconName } from './services';

export type PaketSecenegi = { ay: number; gorusme: number };

export type PaketGrubu = {
  id: string;
  baslik: string;
  kisa: string;
  icon: IconName;
  alan: string;
  konular?: string[];
  liste?: string[];
  metin?: string;
  secenekler?: PaketSecenegi[];
};

export const paketSecenekleri: PaketSecenegi[] = [
  { ay: 1, gorusme: 4 },
  { ay: 2, gorusme: 8 },
  { ay: 3, gorusme: 12 },
];

export const paketlerGiris = {
  eyebrow: 'Danışmanlık Paketleri',
  baslik: 'Size uygun süreyi birlikte belirleyelim',
  paragraflar: [
    'Paketler, hizmet alanlarına göre 1, 2 ve 3 aylık olarak hazırlanmıştır. Her pakette görüşmeler yüz yüze veya online yapılabilir; görüşme günleri sizinle birlikte planlanır.',
  ],
  tumPaketlerde: [
    'Yüz yüze (Seyhan/Adana) veya online birebir görüşme',
    'Yaşam düzeninize ve sağlık ihtiyaçlarınıza uygun beslenme planı',
    'Görüşmelerde ilerlemenin değerlendirilmesi ve planın güncellenmesi',
    'Yüz yüze görüşmelerde, uygun olduğunda vücut bileşimi ölçümü',
    'Ölçüm sonuçlarınızı telefonunuzdan izleyebileceğiniz Takibim sayfası',
  ],
  nasil: [
    'Size uygun paketin altındaki “Bilgi Almak İstiyorum” düğmesine dokunun.',
    'WhatsApp, paketin adı yazılı bir mesajla açılır; mesajı göndermeniz yeterlidir.',
    'Paket içeriği, ücret ve ödeme bilgisi size birebir iletilir.',
  ],
  not: 'Beslenme danışmanlığı, hekiminizin koyduğu tanının ve önerdiği tedavinin yerine geçmez; gerektiğinde hekim takibinizle birlikte yürütülür.',
};

export const paketGruplari: PaketGrubu[] = [
  {
    id: 'kilo-yonetimi-paketi',
    baslik: 'Beslenme Danışmanlığı ve Kilo Yönetimi',
    kisa: 'Kilo Yönetimi',
    icon: 'scale',
    alan: 'kilo-yonetimi',
    konular: ['Sağlıklı Kilo Alma', 'Kilo Verme Süreci', 'Kilo Koruma ve Alışkanlıkların Sürdürülmesi', 'Obezitede Beslenme Desteği'],
  },
  {
    id: 'metabolik-ve-hormonal-saglik-paketi',
    baslik: 'Metabolik ve Hormonal Sağlıkta Beslenme',
    kisa: 'Metabolik ve Hormonal Sağlık',
    icon: 'drop',
    alan: 'metabolik-ve-hormonal-saglik',
    konular: [
      'Diyabet ve Kan Şekeri Yönetimi',
      'İnsülin Direnci ve Prediyabet',
      'Poliendokrin Metabolik Over Sendromu (PMOS)',
      'Tiroid Hastalıklarında Beslenme',
      'Metabolik Sendrom ve Karaciğer Yağlanması',
    ],
  },
  {
    id: 'sindirim-sistemi-paketi',
    baslik: 'Sindirim Sistemi ve Bağırsak Sağlığında Beslenme',
    kisa: 'Sindirim Sistemi',
    icon: 'gut',
    alan: 'sindirim-sistemi-ve-bagirsak-sagligi',
    konular: ['SIBO', 'İrritabl Bağırsak Sendromu (IBS)', 'İnflamatuvar Bağırsak Hastalıkları'],
  },
  {
    id: 'besin-alerjisi-paketi',
    baslik: 'Besin Alerjisi ve İntoleranslarda Beslenme',
    kisa: 'Besin Alerjisi ve İntoleranslar',
    icon: 'shield',
    alan: 'besin-alerjisi-ve-intoleranslar',
    liste: [
      'Tanı konmuş besin alerjisinde güvenli ve yeterli beslenme planı',
      'Laktoz veya başka besinleri tolere etme güçlüğünde kişiye uygun düzenleme',
      'Şikâyetlerle ilişkili olduğu düşünülen besinlerin planlı biçimde değerlendirilmesi',
      'Gereksiz ve uzun süreli besin kısıtlamalarının önlenmesine yönelik takip',
    ],
  },
  {
    id: 'deri-sagligi-paketi',
    baslik: 'Deri Sağlığı ve Beslenme',
    kisa: 'Deri Sağlığı',
    icon: 'sparkle',
    alan: 'deri-sagligi-ve-beslenme',
    metin:
      'Akne, egzama/atopik dermatit veya sedef hastalığı gibi durumlarda kişinin beslenme düzeni ve varsa besinlerle ilişkili yakınmaları değerlendirilir. Beslenme desteği, dermatoloji takibine eşlik edecek şekilde planlanır.',
  },
  {
    id: 'kalp-damar-ve-gut-paketi',
    baslik: 'Kalp-Damar Sağlığı ve Gut Hastalığında Beslenme',
    kisa: 'Kalp-Damar Sağlığı ve Gut',
    icon: 'heart',
    alan: 'kalp-damar-sagligi-ve-gut',
    konular: [
      'Hipertansiyonda Beslenme',
      'Kolesterol ve Kan Yağları Yüksekliğinde Beslenme',
      'Kalp-Damar Hastalıklarında Beslenme',
      'Gut Hastalığında Beslenme',
    ],
  },
  {
    id: 'yasam-donemleri-paketi',
    baslik: 'Yaşam Dönemlerinde Beslenme',
    kisa: 'Yaşam Dönemleri',
    icon: 'bloom',
    alan: 'yasam-donemlerinde-beslenme',
    konular: ['Gebelikte Beslenme', 'Emzirme Döneminde Beslenme', 'Çocuk ve Ergen Beslenmesi', 'Menopoz Döneminde Beslenme'],
  },
];

/** "1 Ay · 4 Görüşme" */
export const secenekAdi = (s: PaketSecenegi) => `${s.ay} Ay · ${s.gorusme} Görüşme`;

/** WhatsApp'ta hazır gelen mesaj */
export const paketMesaji = (g: PaketGrubu, s: PaketSecenegi) =>
  `Merhaba, web sitenizdeki “${g.baslik} – ${s.ay} Ay (${s.gorusme} Görüşme)” paketi hakkında bilgi almak istiyorum.`;
