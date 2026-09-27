// Hizmet listesi. Metinler bilgilendirme amaçlıdır; sonuç vaadi veya garanti içermemelidir.

export type Service = { name: string; slug: string; description: string };
export type ServiceCategory = {
  id: string;
  title: string;
  intro: string;
  icon: 'consult' | 'scale' | 'heart' | 'bloom';
  services: Service[];
};

export const serviceCategories: ServiceCategory[] = [
  {
    id: 'danismanlik',
    title: 'Danışmanlık ve Takip',
    intro: 'Size uygun görüşme yöntemiyle başlayan, ölçüm ve düzenli kontrollerle ilerleyen bir süreç.',
    icon: 'consult',
    services: [
      {
        name: 'Online & Yüz Yüze Beslenme Danışmanlığı',
        slug: 'online-yuz-yuze-beslenme-danismanligi',
        description:
          'Seyhan/Adana’daki klinikte yüz yüze ya da WhatsApp görüntülü görüşmeyle online; size uygun yöntemle birebir beslenme danışmanlığı.',
      },
      {
        name: 'Sağlıklı Beslenme Önerileri',
        slug: 'saglikli-beslenme-onerileri',
        description: 'Günlük yaşamınıza kolayca uyarlayabileceğiniz, dengeli ve sürdürülebilir beslenme önerileri.',
      },
      {
        name: 'Beslenme Planı Oluşturma',
        slug: 'beslenme-plani-olusturma',
        description:
          'Yaşam tarzınız, damak tadınız ve sağlık durumunuz dikkate alınarak hazırlanan kişiye özel beslenme planı.',
      },
      {
        name: 'Beslenme Takibi',
        slug: 'beslenme-takibi',
        description: 'Düzenli kontrollerle sürecinizin izlenmesi ve planınızın ihtiyaçlarınıza göre güncellenmesi.',
      },
      {
        name: 'Vücut Analizi',
        slug: 'vucut-analizi',
        description:
          'Kilo, yağ, kas ve sıvı oranlarının ölçülmesiyle beslenme planınıza yol gösteren değerlendirme.',
      },
    ],
  },
  {
    id: 'kilo-yonetimi',
    title: 'Kilo Yönetimi',
    intro: 'Kilo vermek ya da almak isteyenler için yasaklara değil dengeye dayanan bir yaklaşım.',
    icon: 'scale',
    services: [
      {
        name: 'Zayıflama Diyeti',
        slug: 'zayiflama-diyeti',
        description:
          'Sağlıklı ve sürdürülebilir kilo kaybını hedefleyen, yaşam tarzınıza uygun beslenme programı.',
      },
      {
        name: 'Kilo Alma Diyeti',
        slug: 'kilo-alma-diyeti',
        description:
          'Sağlıklı kilo alımını hedefleyen; enerji ve besin öğesi ihtiyacınıza göre planlanan beslenme programı.',
      },
      {
        name: 'Obezitede Beslenme',
        slug: 'obezitede-beslenme',
        description:
          'Obezitenin yönetiminde, eşlik eden sağlık risklerini de gözeten kişiye özel beslenme tedavisi.',
      },
    ],
  },
  {
    id: 'hastaliklarda-beslenme',
    title: 'Hastalıklarda Beslenme',
    intro: 'Hekiminizin önerdiği tedaviyi destekleyen, hastalığınıza özgü ihtiyaçlara göre düzenlenen beslenme.',
    icon: 'heart',
    services: [
      {
        name: 'Polikistik Over Diyeti',
        slug: 'polikistik-over-diyeti',
        description:
          'Polikistik over sendromunda (PKOS) insülin direnci ve hormonal dengeyi gözeten beslenme düzeni.',
      },
      {
        name: 'Diyabet (Şeker) Beslenmesi',
        slug: 'diyabet-beslenmesi',
        description:
          'Kan şekeri dengesini desteklemeye yönelik, karbonhidrat dağılımı planlanmış beslenme programı.',
      },
      {
        name: 'İnsülin Direncinde Beslenme',
        slug: 'insulin-direncinde-beslenme',
        description:
          'Öğün düzeni, besin seçimi ve yaşam tarzı değişiklikleriyle insülin duyarlılığını desteklemeye yönelik beslenme.',
      },
      {
        name: 'Hipertansiyonda Beslenme',
        slug: 'hipertansiyonda-beslenme',
        description: 'Tuz ve sodyum dengesine dikkat eden, kalp dostu beslenme örüntülerine dayalı plan.',
      },
      {
        name: 'Kolesterol Yüksekliğinde Beslenme',
        slug: 'kolesterol-yuksekliginde-beslenme',
        description: 'Yağ kalitesi ve lif alımı gözetilerek kan yağlarını desteklemeye yönelik beslenme.',
      },
      {
        name: 'Kalp-Damar Hastalıklarında Beslenme',
        slug: 'kalp-damar-hastaliklarinda-beslenme',
        description: 'Kalp ve damar sağlığını korumaya yönelik, bilimsel önerilere dayanan beslenme düzeni.',
      },
      {
        name: 'Gut Hastalığında Beslenme',
        slug: 'gut-hastaliginda-beslenme',
        description: 'Ürik asit düzeyini göz önünde bulunduran, pürin içeriği dengelenmiş beslenme planı.',
      },
      {
        name: 'İç Hastalıklarında Beslenme',
        slug: 'ic-hastaliklarinda-beslenme',
        description: 'Hekiminizin tedavisiyle uyumlu, hastalığınıza özgü ihtiyaçlara göre düzenlenen beslenme.',
      },
      {
        name: 'Bağırsak Problemlerinde Beslenme',
        slug: 'bagirsak-problemlerinde-beslenme',
        description:
          'Şişkinlik, hazımsızlık ve düzensiz bağırsak alışkanlıkları gibi sorunlarda bağırsak dostu beslenme.',
      },
    ],
  },
  {
    id: 'ozel-donemler',
    title: 'Özel Dönemler',
    intro: 'Hayatın farklı dönemlerinde değişen ihtiyaçlara uygun beslenme desteği.',
    icon: 'bloom',
    services: [
      {
        name: 'Gebelikte Beslenme',
        slug: 'gebelikte-beslenme',
        description: 'Gebelik boyunca anne ve bebeğin değişen ihtiyaçlarına uygun, dengeli beslenme planı.',
      },
      {
        name: 'Çocuk Beslenmesi',
        slug: 'cocuk-beslenmesi',
        description:
          'Büyüme ve gelişim dönemine uygun, çocuğunuzla birlikte kazanılacak sağlıklı beslenme alışkanlıkları.',
      },
    ],
  },
];

export const allServices = serviceCategories.flatMap((c) => c.services);
