// Sertifikalar sayfasında gösterilen belgeler.
//
// Görseller src/assets/sertifikalar/ klasöründedir. Yeni bir belge eklemek için:
//   1) Görseli (jpg, png veya webp) o klasöre koyun,
//   2) Aşağıda uygun grubun içine dosya adıyla bir satır ekleyin.
// Listeye eklenmemiş görseller de sayfanın sonunda "Diğer belgeler" başlığı altında gösterilir.
//
// Not: Belgelerdeki T.C. kimlik numarası gibi kişisel veriler görsellere yüklenmeden önce gizlenmelidir.

export type CertificateItem = {
  /** src/assets/sertifikalar/ içindeki dosya adı */
  file: string;
  /** Belgenin konusu */
  title: string;
  /** Belgeye özel tarih (bağlı olduğu etkinliğin tarihinden farklıysa) */
  date?: string;
};

export type CertificateSet = {
  /** Etkinlik / program adı */
  title: string;
  /** Düzenleyen kurum */
  issuer: string;
  /** Görünen tarih */
  date: string;
  /** İsteğe bağlı kısa not (ör. eğitim süresi) */
  note?: string;
  items: CertificateItem[];
};

export type CertificateGroup = {
  /** Sayfa içi bağlantı adı (#id) */
  id: string;
  title: string;
  description?: string;
  sets: CertificateSet[];
};

export const certificateGroups: CertificateGroup[] = [
  {
    id: 'diploma',
    title: 'Diploma',
    sets: [
      {
        title: 'Beslenme ve Diyetetik Bölümü · Lisans',
        issuer: 'İzmir Katip Çelebi Üniversitesi, Sağlık Bilimleri Fakültesi',
        date: '6 Temmuz 2022',
        items: [{ file: 'diploma.jpg', title: 'Lisans Diploması' }],
      },
    ],
  },
  {
    id: 'mesleki-egitimler',
    title: 'Mesleki Eğitimler',
    description: 'Danışmanlık becerileri ve klinik beslenme alanında katıldığı eğitim programları.',
    sets: [
      {
        title: 'Eğitim Sertifikası',
        issuer: 'Başkent Psikoloji Atölyesi · Ruh Sağlığı Akademisi',
        date: '22–24 Ağustos 2022',
        note: '9 saatlik uygulayıcı eğitimi',
        items: [{ file: 'motivasyonel-gorusme.jpg', title: 'Motivasyonel Görüşme Teknikleri' }],
      },
      {
        title: 'Beslenme ve Diyetetik Akademisi',
        issuer: 'Etkin Kampüs',
        date: 'Mart – Nisan 2022',
        items: [
          { file: 'akademi-2022-diyete-uyum.jpg', title: 'Danışanın Diyete Uyumunu Sağlayacak Psikolojik Yöntemler', date: '23 Mart 2022' },
          { file: 'akademi-2022-bariatrik.jpg', title: 'Bariatrik Cerrahi Sonrası Beslenme', date: '24 Mart 2022' },
          { file: 'akademi-2022-tiroid.jpg', title: 'Vakalarla Tiroid Hastalarında Beslenme', date: '27 Mart 2022' },
          { file: 'akademi-2022-diyabet.jpg', title: 'Vakalarla Diyabette Beslenme', date: '27 Mart 2022' },
          { file: 'akademi-2022-gastrointestinal.jpg', title: 'Vakalarla Gastrointestinal Beslenme', date: '30 Mart 2022' },
          { file: 'akademi-2022-elit-cocuk-sporcu.jpg', title: 'Elit Çocuk Sporcularda Beslenme', date: '4 Nisan 2022' },
          { file: 'akademi-2022-klinikte-beslenme.jpg', title: 'Klinikte Beslenme', date: '28 Nisan 2022' },
        ],
      },
    ],
  },
  {
    id: 'kongre-ve-zirveler',
    title: 'Kongre, Zirve ve Seminerler',
    description: 'Hastalıklarda, sporda, anne-çocuk döneminde beslenme ve güncel diyet yaklaşımları üzerine katıldığı oturumlar.',
    sets: [
      {
        title: 'Sporcu Beslenmesi Zirvesi',
        issuer: 'ALFA Etkinlik Organizasyon',
        date: '26–27 Mart 2022',
        items: [
          { file: 'alfa-2022-sporcularda-makro-besinler.jpg', title: 'Sporcular İçin Makro Besin Öğeleri ve Makro Besin Öğelerinin Önemi' },
          { file: 'alfa-2022-guc-kuvvet-dayaniklilik.jpg', title: 'Güç-Kuvvet ve Dayanıklılık Sporlarında Beslenme' },
          { file: 'alfa-2022-sporcularda-mikrobiyota.jpg', title: 'Sporcularda Mikrobiyota, Sağlık ve Performans İlişkisi' },
          { file: 'alfa-2022-futbolda-menu-planlama.jpg', title: 'Futbolda Menü Planlama ve Menü Örnekleri' },
        ],
      },
      {
        title: 'Hastalıklarda Beslenme Zirvesi',
        issuer: 'ALFA Etkinlik Organizasyon',
        date: '12–13 Mart 2022',
        items: [
          { file: 'alfa-2022-enteral-parenteral.jpg', title: 'Yetişkin Klinik Hastalıklarında Enteral ve Parenteral Nutrisyon' },
          { file: 'alfa-2022-nefroloji.jpg', title: 'Nefroloji Hastalıklarında Beslenme' },
          { file: 'alfa-2022-gastrointestinal.jpg', title: 'Gastrointestinal Sistem Hastalıklarında Beslenme' },
          { file: 'alfa-2022-tiroit-diyabet.jpg', title: 'Tiroit Bezi ve Diyabette Beslenme' },
          { file: 'alfa-2022-norolojik-hastaliklar.jpg', title: 'Nörolojik Hastalıklarda Beslenme' },
          { file: 'alfa-2022-kronik-yara.jpg', title: 'Kronik Yaralarda Tıbbi Beslenme Tedavisi' },
        ],
      },
      {
        title: 'Anne ve Çocuk Beslenmesi Zirvesi',
        issuer: 'ALFA Etkinlik Organizasyon',
        date: '5–6 Mart 2022',
        items: [
          { file: 'alfa-2022-gebelik-emzirme.jpg', title: 'Gebelik ve Emziklik Döneminde Beslenme' },
          { file: 'alfa-2022-ek-gida.jpg', title: 'Ek Gıda Döneminde Beslenme' },
          { file: 'alfa-2022-okul-cagi-menu.jpg', title: 'Okul Çağındaki Çocukların Menü Planlaması' },
          { file: 'alfa-2022-cocukluk-obezitesi.jpg', title: 'Çocukluk Çağı Obezitesinde Güncel Yaklaşımlar ile Beslenme Tedavisi' },
        ],
      },
      {
        title: 'İzmir Beslenme ve Diyetetik Zirvesi',
        issuer: 'Gençlik Durağı',
        date: '29 Şubat 2020',
        items: [
          { file: 'izmir-zirve-2020-ketojenik.jpg', title: 'Ketojenik Diyet' },
          { file: 'izmir-zirve-2020-gaps-fodmap.jpg', title: 'İrritabl Bağırsak Hastalıklarında Yenilikler: GAPS – FODMAP Diyetleri' },
          { file: 'izmir-zirve-2020-mikrobiyota.jpg', title: 'Sağlıklı Sindirim Yönetiminde Mikrobiyota Destekleri (Prebiyotikler ve Probiyotikler)' },
          { file: 'izmir-zirve-2020-fermantasyon.jpg', title: 'Sağlıklı Mikrobiyom İçin Fermantasyon ve Uygulamalı Tarifler' },
        ],
      },
      {
        title: 'İzmir Beslenme ve Diyetetik Zirvesi',
        issuer: 'Etkin Kampüs',
        date: '19 Ekim 2019',
        items: [
          { file: 'izmir-zirve-2019-onkoloji.jpg', title: 'Onkolojide Beslenme' },
          { file: 'izmir-zirve-2019-fitoterapi.jpg', title: 'Fitoterapi – Besin İlaç Etkileşimi' },
          { file: 'izmir-zirve-2019-anne-cocuk.jpg', title: 'Anne Çocuk Beslenmesi' },
          { file: 'izmir-zirve-2019-psikoloji-diyet.jpg', title: 'Psikoloji ve Diyet' },
          { file: 'izmir-zirve-2019-vegan-vejetaryen.jpg', title: 'Vegan ve Vejetaryen Beslenme' },
        ],
      },
    ],
  },
  {
    id: 'gida-guvenligi',
    title: 'Gıda Güvenliği ve Gıda Eğitimleri',
    description: 'Gıda güvenliği yönetim sistemleri, hijyen uygulamaları ve gıda üretimi üzerine eğitimler.',
    sets: [
      {
        title: 'Gıda Güvenliği Eğitim Programı',
        issuer: 'FQC First Quality Certification · Kariyer Sokağı',
        date: '22–23 Şubat 2020 · İzmir',
        items: [
          { file: 'fqc-iso22000-temel.jpg', title: 'ISO 22000:2005 Gıda Güvenliği Yönetim Sistemi Temel Eğitimi' },
          { file: 'fqc-iso22000-ic-denetci.jpg', title: 'ISO 22000:2005 Gıda Güvenliği Yönetim Sistemi İç Denetçi Eğitimi' },
          { file: 'fqc-brc.jpg', title: 'BRC – İngiliz Küresel Gıda Güvenliği Standardı' },
          { file: 'fqc-ghp.jpg', title: 'GHP – İyi Hijyen Uygulamaları Eğitimi' },
          { file: 'fqc-glp.jpg', title: 'GLP – İyi Laboratuvar Uygulamaları Eğitimi' },
        ],
      },
      {
        title: 'Eğitim Sertifikası',
        issuer: 'Duru Bulgur Gıda San. ve Tic. A.Ş.',
        date: '28 Kasım 2019',
        items: [{ file: 'duru-bulgur.jpg', title: 'Bulgurun Tarihi, Üretim Süreci ve Mutfaklarda Kullanımı' }],
      },
    ],
  },
];

/** Ana sayfadaki sertifika bandında gösterilecek üç belge */
export const featuredCertificates = ['diploma.jpg', 'fqc-iso22000-ic-denetci.jpg', 'alfa-2022-nefroloji.jpg'];
