// Hizmetler: "Beslenme Danışmanlığı ve Hizmet Alanları"
//
// Her hizmet alanı (area) Hizmetler sayfasında ayrı bir bölüm olarak gösterilir. Ana sayfadaki hizmet kartları
// "home: true" olan alanlardan oluşur.
//   title    Hizmetler sayfasındaki bölüm başlığı
//   short    Kısa ad: ana sayfa kartı, kategori düğmeleri ve randevu formundaki grup adı
//   summary  Ana sayfa kartındaki kısa açıklama
//   intro    Bölümün giriş paragrafları
//   items    Alt başlıklar (her biri bir kart). "name" randevu formunda, site asistanında ve bağlantılarda kullanılan
//            addır; "title" verilmezse kartta da bu ad görünür.
//   list     Madde listesi (alt başlığı olmayan alanlarda)
//   outro    Listeden sonra gelen paragraf
//   note     Hekim takibi gibi bilgilendirme notu (açık renkli kutuda gösterilir)
//
// Metinler bilgilendirme amaçlıdır; sonuç vaadi veya garanti içermemelidir.
// Hizmet adı değişirse şu yerler de kontrol edilmeli: blog yazılarındaki "relatedService", src/data/assistant.ts
// (serviceKeywords, serviceNotes), src/components/Footer.astro (featured), src/components/BmiCalculator.astro.

export type IconName = 'consult' | 'scale' | 'drop' | 'gut' | 'shield' | 'sparkle' | 'heart' | 'dumbbell' | 'bloom';

export type AreaItem = {
  name: string;
  slug: string;
  title?: string;
  text?: string;
  list?: string[];
  note?: string;
};

export type ServiceArea = {
  id: string;
  title: string;
  short: string;
  icon: IconName;
  summary: string;
  home: boolean;
  intro?: string[];
  items?: AreaItem[];
  list?: string[];
  outro?: string;
  note?: string;
  /** Alt başlığı olmayan alanlarda randevu formunda görünecek ad */
  name?: string;
};

export type Service = { name: string; slug: string; description: string; area: string };

export const servicesIntro = {
  eyebrow: 'Beslenme Danışmanlığı ve Hizmet Alanları',
  title: 'Size ve yaşamınıza uygun beslenme desteği',
  paragraphs: [
    'Beslenme ihtiyaçları; sağlık durumu, günlük yaşam, beslenme alışkanlıkları ve kişisel hedeflere göre değişir. Görüşmelerde bu başlıklar birlikte değerlendirilir, uygulanabilir bir beslenme planı oluşturulur ve süreç düzenli kontrollerle takip edilir.',
    'Danışmanlık yüz yüze veya online olarak sunulur. Fonksiyonel beslenme yaklaşımında beslenme düzeni; sindirim yakınmaları, uyku, hareket, stres, kullanılan ilaç ve takviyeler gibi yaşamın farklı yönleriyle birlikte ele alınır. Değerlendirme, kişinin sağlık ekibinden aldığı tanı ve tedavi önerilerini gözeterek yapılır.',
  ],
};

export const serviceAreas: ServiceArea[] = [
  {
    id: 'beslenme-danismanligi-ve-takip',
    title: 'Beslenme Danışmanlığı ve Takip',
    short: 'Beslenme Danışmanlığı ve Takip',
    icon: 'consult',
    home: true,
    summary: 'Yüz yüze veya online görüşme, kişiye özel beslenme planı, düzenli takip ve vücut bileşimi takibi.',
    intro: ['Beslenme alışkanlıkları, günlük düzen ve hedefler değerlendirilerek kişiye uygun bir yol haritası oluşturulur.'],
    items: [
      {
        name: 'Yüz Yüze ve Online Danışmanlık',
        slug: 'yuz-yuze-ve-online-danismanlik',
        text: 'Yüz yüze veya online birebir görüşme.',
      },
      {
        name: 'Beslenme Planı Oluşturma',
        slug: 'beslenme-plani-olusturma',
        text: 'Yaşam düzenine, besin tercihlerine ve sağlık ihtiyaçlarına uygun planlama.',
      },
      {
        name: 'Sağlıklı Beslenme Alışkanlıkları',
        slug: 'saglikli-beslenme-aliskanliklari',
        text: 'Günlük yaşamda sürdürülebilecek öğün ve besin seçimleri üzerinde çalışma.',
      },
      {
        name: 'Beslenme Takibi',
        slug: 'beslenme-takibi',
        text: 'Kontrollerde ilerlemenin değerlendirilmesi ve planın ihtiyaçlara göre güncellenmesi.',
      },
      {
        name: 'Vücut Bileşimi Takibi',
        slug: 'vucut-bilesimi-takibi',
        text: 'Uygun olduğunda ölçüm sonuçlarının süreç takibinde değerlendirilmesi.',
      },
    ],
  },
  {
    id: 'kilo-yonetimi',
    title: 'Kilo Yönetimi',
    short: 'Kilo Yönetimi',
    icon: 'scale',
    home: true,
    summary: 'Kilo verme süreci, sağlıklı kilo alma, obezitede beslenme desteği ve kilo koruma.',
    intro: [
      'Kilo yönetimi sürecinde hedef, kişinin yaşamına uyarlanabilen ve sürdürülebilen bir beslenme düzeni oluşturmaktır.',
    ],
    items: [
      { name: 'Kilo Verme Diyeti', title: 'Kilo Verme Süreci', slug: 'kilo-verme' },
      { name: 'Sağlıklı Kilo Alma', slug: 'saglikli-kilo-alma' },
      { name: 'Obezitede Beslenme Desteği', slug: 'obezitede-beslenme' },
      { name: 'Kilo Koruma ve Alışkanlıkların Sürdürülmesi', slug: 'kilo-koruma' },
    ],
    outro:
      'Beslenme planı; kişinin sağlık durumu, günlük hareket düzeyi, beslenme alışkanlıkları ve hedefleri değerlendirilerek hazırlanır.',
  },
  {
    id: 'metabolik-ve-hormonal-saglik',
    title: 'Metabolik ve Hormonal Sağlıkta Beslenme',
    short: 'Metabolik ve Hormonal Sağlık',
    icon: 'drop',
    home: true,
    summary:
      'Diyabet, insülin direnci ve prediyabet, PMOS, tiroid hastalıkları, metabolik sendrom ve karaciğer yağlanmasında beslenme.',
    items: [
      {
        name: 'Diyabette Beslenme',
        title: 'Diyabet ve Kan Şekeri Yönetimi',
        slug: 'diyabet',
        text: 'Diyabet tanısı bulunan kişilerde öğün düzeni, besin seçimleri ve karbonhidrat dağılımı kişisel ihtiyaçlar doğrultusunda değerlendirilir. Planlama, hekim takibi ve kullanılan tedavilerle uyumlu yürütülür.',
      },
      {
        name: 'İnsülin Direnci ve Prediyabet',
        slug: 'insulin-direnci-ve-prediyabet',
        text: 'Beslenme düzeni ve günlük yaşam alışkanlıkları gözden geçirilerek kan şekeri yönetimini desteklemeye yönelik uygulanabilir öneriler geliştirilir.',
      },
      {
        name: 'PMOS (Polikistik Over Sendromu)',
        title: 'Poliendokrin Metabolik Over Sendromu (PMOS)',
        slug: 'pmos',
        text: 'Poliendokrin Metabolik Over Sendromunda (PMOS; eski adıyla Polikistik Over Sendromu/PKOS-PCOS) beslenme desteği hormonal ve metabolik sağlık, beslenme alışkanlıkları ve kişinin hedefleri dikkate alınarak planlanır.',
      },
      {
        name: 'Tiroid Hastalıklarında Beslenme',
        slug: 'tiroid-hastaliklarinda-beslenme',
        text: 'Tiroid hastalığı olan kişiler için beslenme düzeni, hekim tanısı ve tedavi takibi dikkate alınarak değerlendirilir. Danışmanlık kapsamında şu durumlar ele alınabilir:',
        list: [
          'Hashimoto tiroiditi',
          'Hipotiroidi',
          'Hipertiroidi',
          'Tiroid hastalığıyla birlikte görülen kilo veya beslenme güçlükleri',
        ],
        note: 'Tiroid hastalığının tanısı, ilaç tedavisi ve tahlillerin tıbbi değerlendirmesi ilgili hekimin sorumluluğundadır. Beslenme planı bu takiple uyumlu biçimde hazırlanır.',
      },
      {
        name: 'Metabolik Sendrom ve Karaciğer Yağlanması',
        slug: 'metabolik-sendrom-ve-karaciger-yaglanmasi',
        text: 'Metabolik sendrom veya hekim tarafından tanı konmuş karaciğer yağlanması durumunda beslenme düzeni, kilo yönetimi ve günlük alışkanlıklar birlikte değerlendirilir.',
      },
    ],
  },
  {
    id: 'sindirim-sistemi-ve-bagirsak-sagligi',
    title: 'Sindirim Sistemi ve Bağırsak Sağlığında Beslenme',
    short: 'Sindirim Sistemi ve Bağırsak Sağlığı',
    icon: 'gut',
    home: true,
    summary: 'SIBO, IBS, inflamatuvar bağırsak hastalıkları, çölyak ve diğer sindirim sistemi yakınmalarında beslenme.',
    intro: [
      'Sindirim yakınmalarında değerlendirme; kişinin tanısı, belirtileri, beslenme öyküsü ve günlük yaşam düzeni dikkate alınarak yapılır.',
    ],
    items: [
      {
        name: 'SIBO',
        slug: 'sibo',
        text: 'SIBO tanısı bulunan kişilerde beslenme desteği, hekim tarafından yürütülen tanı ve tedavi süreciyle birlikte planlanır. Semptomların ve besin toleransının takibi, beslenme çeşitliliğinin korunması ve uygun olduğunda kısıtlanan besinlerin yeniden değerlendirilmesi üzerinde çalışılır.',
      },
      {
        name: 'İrritabl Bağırsak Sendromu (IBS)',
        slug: 'irritabl-bagirsak-sendromu',
        text: 'IBS tanısı bulunan kişilerde şişkinlik, gaz, karın ağrısı, kabızlık veya ishal gibi yakınmalar ve bunların beslenme düzeniyle ilişkisi değerlendirilir. Beslenme planı kişiye göre oluşturulur.',
      },
      {
        name: 'İnflamatuvar Bağırsak Hastalıkları',
        slug: 'inflamatuvar-bagirsak-hastaliklari',
        text: 'Crohn hastalığı ve ülseratif kolit tanısı bulunan kişilerde beslenme desteği, gastroenteroloji takibiyle uyumlu biçimde yürütülür. Beslenme ihtiyaçları hastalığın dönemine, belirtilere, besin toleransına ve kişinin genel durumuna göre değerlendirilir.',
      },
      {
        name: 'Diğer Sindirim Sistemi Yakınmaları',
        slug: 'diger-sindirim-sistemi-yakinmalari',
        list: [
          'Şişkinlik ve gaz',
          'Kabızlık',
          'İshal ve dışkılama düzeninde değişiklikler',
          'Reflü ve hazımsızlık',
          'Karın ağrısıyla birlikte görülen beslenme yakınmaları',
        ],
        note: 'Uzun süren, yeni başlayan veya şiddetli belirtilerde önce hekim değerlendirmesi gerekir; beslenme danışmanlığı bu değerlendirmeyle birlikte yürütülür.',
      },
      {
        name: 'Çölyak Hastalığı',
        slug: 'colyak-hastaligi',
        text: 'Çölyak tanısı bulunan kişilerde glutensiz beslenme düzeninin günlük yaşama uyarlanması, besin çeşitliliğinin korunması ve yeterli beslenmenin sürdürülmesi üzerine çalışılır.',
      },
    ],
  },
  {
    id: 'besin-alerjisi-ve-intoleranslar',
    title: 'Besin Alerjisi ve İntoleranslarda Beslenme',
    short: 'Besin Alerjisi ve İntoleranslarda Beslenme',
    name: 'Besin Alerjisi ve İntoleranslar',
    icon: 'shield',
    home: true,
    summary: 'Tanı konmuş besin alerjisi ve besin intoleranslarında güvenli ve yeterli bir beslenme düzeni.',
    intro: [
      'Besin alerjisi ile besin intoleransı farklı durumlardır. Bu nedenle beslenme düzenlemesi, kişinin hekim değerlendirmesi ve mevcut tanısı dikkate alınarak yapılır.',
    ],
    list: [
      'Tanı konmuş besin alerjisinde güvenli ve yeterli beslenme planı',
      'Laktoz veya başka besinleri tolere etme güçlüğünde kişiye uygun düzenleme',
      'Şikâyetlerle ilişkili olduğu düşünülen besinlerin planlı biçimde değerlendirilmesi',
      'Gereksiz ve uzun süreli besin kısıtlamalarının önlenmesine yönelik takip',
    ],
    note: 'Alerji tanısı koyma ve alerji testlerini değerlendirme hekimlerin sorumluluğundadır. Beslenme danışmanlığı tanı sonrasında güvenli ve yeterli bir beslenme düzeni kurmaya destek olur.',
  },
  {
    id: 'deri-sagligi-ve-beslenme',
    title: 'Deri Sağlığı ve Beslenme',
    short: 'Deri Sağlığı ve Beslenme',
    name: 'Deri Sağlığı ve Beslenme',
    icon: 'sparkle',
    home: true,
    summary: 'Akne, egzama/atopik dermatit ve sedef hastalığında dermatoloji takibine eşlik eden beslenme desteği.',
    intro: [
      'Akne, egzama/atopik dermatit veya sedef hastalığı gibi durumlarda kişinin beslenme düzeni ve varsa besinlerle ilişkili yakınmaları değerlendirilir. Beslenme desteği, dermatoloji takibine eşlik edecek şekilde planlanır.',
    ],
  },
  {
    id: 'kalp-damar-sagligi-ve-gut',
    title: 'Kalp-Damar Sağlığı ve Gut Hastalığında Beslenme',
    short: 'Kalp-Damar Sağlığı ve Gut',
    icon: 'heart',
    home: false,
    summary: 'Hipertansiyon, kolesterol ve kan yağları yüksekliği, kalp-damar hastalıkları ve gut hastalığında beslenme.',
    items: [
      {
        name: 'Hipertansiyonda Beslenme',
        slug: 'hipertansiyonda-beslenme',
        text: 'Beslenme düzeni ve özellikle tuz tüketimi, kişinin ihtiyaçları ve hekim önerileri doğrultusunda değerlendirilir.',
      },
      {
        name: 'Kolesterol ve Kan Yağları Yüksekliğinde Beslenme',
        slug: 'kolesterol-ve-kan-yaglari',
        text: 'Beslenme planı; kan yağlarıyla ilgili hekim değerlendirmesi, kişinin beslenme düzeni ve sağlık öyküsü dikkate alınarak oluşturulur.',
      },
      {
        name: 'Kalp-Damar Hastalıklarında Beslenme',
        slug: 'kalp-damar-hastaliklarinda-beslenme',
        text: 'Kalp-damar hastalığı bulunan kişilerde beslenme düzeni, sağlık ekibinin önerileri ve kişinin ihtiyaçları doğrultusunda planlanır.',
      },
      {
        name: 'Gut Hastalığında Beslenme',
        slug: 'gut-hastaliginda-beslenme',
        text: 'Gut tanısı bulunan kişilerde beslenme alışkanlıkları ve kişisel ihtiyaçlar, hekim takibiyle uyumlu biçimde değerlendirilir.',
      },
    ],
  },
  {
    id: 'sporcu-beslenmesi',
    title: 'Sporcu ve Aktif Yaşam Beslenmesi',
    short: 'Sporcu Beslenmesi',
    name: 'Sporcu Beslenmesi',
    icon: 'dumbbell',
    home: true,
    summary: 'Spor dalına, antrenman sıklığına ve hedeflere göre planlanan; performans ve toparlanma sürecini destekleyen beslenme.',
    intro: [
      'Spor yapan kişilerin beslenme gereksinimleri; yapılan spor dalı, antrenman sıklığı, hedefler ve günlük yaşam düzenine göre değişir.',
    ],
    list: [
      'Antrenman günlerinde öğün düzeni',
      'Antrenman öncesi ve sonrası beslenme',
      'Sıvı ve besin alımının değerlendirilmesi',
      'Performans ve toparlanma sürecini destekleyen beslenme planı',
      'Kas kütlesi artırma veya vücut kompozisyonu hedefleri',
      'Yarışma veya yoğun antrenman dönemlerine yönelik planlama',
    ],
    outro:
      'Sporcu beslenmesi kapsamında takviye kullanımı da kişinin sağlık durumu, kullandığı ilaçlar ve ihtiyaçları gözetilerek değerlendirilir.',
  },
  {
    id: 'yasam-donemlerinde-beslenme',
    title: 'Yaşam Dönemlerinde Beslenme',
    short: 'Yaşam Dönemlerinde Beslenme',
    icon: 'bloom',
    home: true,
    summary: 'Gebelik, emzirme ve menopoz dönemlerinde; çocukluk ve ergenlikte beslenme.',
    items: [
      {
        name: 'Gebelikte Beslenme',
        slug: 'gebelikte-beslenme',
        text: 'Gebelikte değişen beslenme ihtiyaçları, anne adayının sağlık durumu ve hekim takibi dikkate alınarak değerlendirilir.',
      },
      {
        name: 'Emzirme Döneminde Beslenme',
        slug: 'emzirme-doneminde-beslenme',
        text: 'Emzirme dönemindeki beslenme düzeni, annenin ihtiyaçları ve günlük yaşamı göz önünde bulundurularak planlanır.',
      },
      {
        name: 'Çocuk ve Ergen Beslenmesi',
        slug: 'cocuk-ve-ergen-beslenmesi',
        text: 'Çocuğun yaşı, büyüme ve gelişme dönemi, beslenme alışkanlıkları ve aile düzeni dikkate alınarak aileyle birlikte çalışılır.',
      },
      {
        name: 'Menopoz Döneminde Beslenme',
        slug: 'menopoz-doneminde-beslenme',
        text: 'Menopoz döneminde değişen yaşam ve beslenme ihtiyaçları, kişinin sağlık durumu ve hedefleri doğrultusunda ele alınır.',
      },
    ],
  },
];

/** Sayfa sonundaki çağrı metni */
export const servicesCta = {
  title: 'Hangi hizmetin size uygun olduğundan emin değil misiniz?',
  text: 'Randevu talebinizde “Emin değilim” seçeneğini işaretleyin. İlk görüşmede ihtiyaçlarınızı birlikte değerlendirip size uygun beslenme danışmanlığı alanını belirleyelim.',
};

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

/** Madde listesini cümle içinde kullanılacak hâle getirir: ["Kabızlık", "Reflü"] → "kabızlık, reflü." */
const listText = (list: string[]) =>
  `${list.map((x) => (/^(Hashimoto|SIBO|IBS)/.test(x) ? x : x.charAt(0).toLocaleLowerCase('tr') + x.slice(1))).join(', ')}.`;

/** Randevu formunda seçilebilen hizmetler (alan → seçenekler) */
export const serviceOptions = serviceAreas.map((a) => ({
  group: a.short,
  names: a.items ? a.items.map((i) => i.name) : [a.name ?? a.short],
}));

/** Tüm hizmetler düz liste hâlinde: site asistanı, alt bilgi ve bağlantılar için */
export const allServices: Service[] = serviceAreas.flatMap((a) =>
  a.items
    ? a.items.map((i) => ({
        name: i.name,
        slug: i.slug,
        area: a.id,
        description: join(
          i.text ?? join(...(a.intro ?? []), a.outro),
          i.list ? (i.text?.endsWith(':') ? listText(i.list) : `Kapsam: ${listText(i.list)}`) : undefined,
          i.note,
        ),
      }))
    : [
        {
          name: a.name ?? a.short,
          slug: a.id,
          area: a.id,
          description: join(...(a.intro ?? []), a.list ? `Kapsam: ${listText(a.list)}` : undefined, a.outro, a.note),
        },
      ],
);
