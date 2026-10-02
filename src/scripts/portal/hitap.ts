// Panelden gönderilen mesajlarda hitap: "Merhaba Ayşe Hanım," / "Merhaba Mehmet Bey,"
//
// Cinsiyet danışan kaydından (Bilgiler → Cinsiyet) veya talebe seçilen hitaptan alınır. İkisi de yoksa addan tahmin
// edilir (aşağıdaki listeler). Her iki cinsiyette kullanılan adlar (Deniz, Umut, Özgür…) listede yoktur; bu adlarda
// formlarda "Hitap" seçimi istenir. Listeye ad eklemek için ilgili satıra yazmanız yeterli.

export type Cinsiyet = 'K' | 'E';

const KADIN = `
Ahu Akgül Alev Arzu Asiye Aslı Asuman Asya Aycan Ayfer Aygül Aylin Ayla Aynur Aysel Aysun Ayşe Ayşegül Ayşenur Ayten
Azize Azra Bahar Banu Başak Bedriye Behiye Belgin Berna Beril Berrin Betül Beyza Bihter Birgül Burcu Büşra Cahide
Canan Cansu Cemile Cennet Ceren Ceyda Damla Defne Demet Derya Didem Dilan Dilara Dilay Dilber Dilek Döndü Dudu Duru
Duygu Ebru Ece Ecem Ecrin Eda Ela Elçin Elif Elmas Elvan Emel Emine Emsal Esin Eslem Esma Esra Eylem Ezgi Fadime
Fatma Fatmanur Fazilet Fehime Feride Feyza Fikriye Filiz Firdevs Funda Füsun Gamze Gizem Gonca Gönül Gözde Gül
Gülay Gülbahar Gülcan Güldane Gülden Güler Gülfem Gülhan Gülistan Gülizar Gülnur Gülsen Gülseren Gülsüm Gülsün Gülşen
Gülten Gülümser Hacer Hale Halime Hamide Handan Hande Hanife Hatice Hatun Havva Hayriye Hediye Hicran Hilal Huriye
Hülya Hümeyra Irmak Işıl İclal İkbal İlayda İlknur İnci İpek İrem Jale Kadriye Kamile Kevser Kezban Kıymet Kübra
Kumru Lale Latife Leman Leyla Lütfiye Mediha Medine Mehtap Melahat Melda Melek Melike Melis Meltem Meral Merve
Meryem Mesude Mihriban Mine Miray Muazzez Mualla Mukaddes Müberra Münevver Münire Mürüvvet Müzeyyen Naciye Nadide
Nafiye Nagehan Naile Nalan Nazan Nazife Nazire Nazlı Nazmiye Nebahat Necibe Necla Necmiye Nefise Neriman Nermin
Nesibe Neslihan Nesrin Neşe Nevin Nevra Nezahat Nida Nigar Nihal Nihan Nilay Nilgün Nilüfer Nisa Nur Nuran Nuray
Nurcan Nurdan Nurgül Nurhan Nursel Nurşen Nurten Oya Özden Özge Özlem Öznur Pakize Pelin Pembe Perihan Pervin Pınar
Rabia Rahime Rana Raziye Refika Remziye Reyhan Rezzan Ruhsar Ruken Rukiye Rümeysa Rüya Saadet Sabahat Sabiha
Sabriye Safiye Saime Sakine Saliha Sanem Saniye Sare Seda Sedef Seher Selcan Selda Selen Selime Selin Selma Selvi
Sema Semiha Semra Sena Senem Serap Serpil Serra Seval Sevda Sevde Sevgi Sevgül Sevil Sevim Sevinç Sevtap Sezen
Sezgi Sıla Sibel Simge Sinem Songül Sude Sultan Suna Süheyla Sümeyye Şahika Şaziye Şebnem Şenay Şerife Şeyda Şeyma
Şirin Şule Şükran Tijen Tuba Tuğba Tuğçe Tülay Tülin Türkan Ulviye Ülkü Ümmühan Ümran Vildan Yağmur Yaprak Yaren
Yasemin Yeliz Yeşim Yıldız Yonca Yurdagül Zahide Zarife Zehra Zekiye Zeliha Zerrin Zeynep Zuhal Zübeyde Zümrüt
`;

const ERKEK = `
Abdullah Abdurrahman Abdülkadir Adem Ahmet Akın Ali Alparslan Alper Alperen Altan Arda Aydın Aykut Baki Bahadır
Bahattin Batuhan Bayram Bedirhan Bedri Behçet Bekir Berat Berk Berkant Berkay Bilal Bora Burak Burhan Bülent
Bünyamin Cafer Cahit Can Caner Cavit Celal Celil Cem Cemal Cemil Cengiz Cenk Cevdet Cihangir Coşkun Cumali Cüneyt
Çetin Davut Doğan Doğukan Dursun Ebubekir Efe Ekrem Emin Emir Emirhan Emrah Emre Ender Enes Engin Enver Eray
Ercan Erdal Erdem Erdinç Erdoğan Eren Ergün Erhan Erkan Erkin Erkut Erol Ersen Ersin Ersoy Ertan Ertuğrul Esat
Eymen Eyüp Fahri Fahrettin Faruk Fatih Ferdi Ferhat Ferit Fevzi Fikret Fuat Furkan Gani Gazi Gökay Gökhan Gökmen
Gürkan Gürsel Güven Habib Hacı Hakan Hakkı Halil Halis Halit Hamdi Hamit Hamza Harun Hasan Haydar Hayati Hidayet
Hikmet Hilmi Hulusi Hüsamettin Hüseyin Hüsnü İbrahim İdris İhsan İlhan İlker İlyas İrfan İsa İskender İsmail İsmet
İzzet Kaan Kadir Kadri Kahraman Kamil Kasım Kazım Kemal Kenan Kerem Kerim Koray Kubilay Kudret Kurtuluş Kuzey
Levent Lokman Lütfi Mahir Mahmut Mahsun Maksut Mazhar Mazlum Mehmet Melih Memduh Mert Mesut Metehan Metin Mevlüt
Mikail Miraç Mithat Muammer Muhammed Muharrem Muhittin Muhsin Murat Musa Mustafa Muzaffer Mücahit Mükremin Mümin
Münir Nail Naci Nadir Necati Necdet Necip Necmettin Necmi Nedim Nejat Nevzat Nihat Niyazi Nizamettin Nuh Numan
Nuri Nurettin Nurullah Nusret Oğulcan Oğuz Oğuzhan Okan Oktay Onur Orçun Orhan Orkun Osman Ozan Ömer Önder Özcan
Özkan Polat Poyraz Rafet Ragıp Rahmi Ramazan Rasim Rauf Recai Recep Refik Remzi Resul Reşat Rıdvan Rıza Ruhi
Rüstem Sabahattin Sabri Sadettin Sadık Saffet Sait Salih Salim Samet Sami Savaş Sebahattin Sedat Sefa Selahattin
Selami Selçuk Selim Selman Semih Sencer Serdar Serhat Serkan Sertaç Seyfettin Sezai Sezgin Sıtkı Sinan Soner Suat
Süleyman Şaban Şahin Şakir Şefik Şemsettin Şenol Şerif Şevket Şükrü Taha Tahir Talat Talha Tamer Taner Tarık Tayfun
Taylan Temel Tevfik Timur Tolga Tufan Tuğrul Tunahan Tuncay Tuncer Turan Turgay Turgut Turhan Ufuk Uğur Ulaş Utku
Ünal Vahap Vahit Vedat Vehbi Veli Veysel Volkan Vural Yağız Yahya Yakup Yalçın Yasin Yaşar Yavuz Yener Yiğit Yılmaz
Yunus Yusuf Zafer Zeki Zekeriya Zihni Ziya Zülfikar
`;

/** Türkçe karakterleri sadeleştirir: "AYŞE" → "ayse" (klavyede Türkçe karakter kullanmadan yazılan adlar için) */
const sadele = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const SOZLUK: Map<string, Cinsiyet | null> = (() => {
  const m = new Map<string, Cinsiyet | null>();
  const ekle = (liste: string, c: Cinsiyet) => {
    for (const ad of liste.split(/\s+/).filter(Boolean)) {
      const k = sadele(ad);
      m.set(k, m.has(k) && m.get(k) !== c ? null : c);
    }
  };
  ekle(KADIN, 'K');
  ekle(ERKEK, 'E');
  return m;
})();

const kelimeler = (adSoyad: string) => adSoyad.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** "ayşe" / "AYŞE" → "Ayşe"; karışık yazılmış ("McAdam") olduğu gibi kalır */
const duzgun = (k: string) => {
  const kucuk = k.toLocaleLowerCase('tr');
  if (k !== kucuk && k !== k.toLocaleUpperCase('tr')) return k;
  return kucuk.charAt(0).toLocaleUpperCase('tr') + kucuk.slice(1);
};

/** Soyadı dışındaki adlar: "Ayşe Nur Yılmaz" → "Ayşe Nur", "Ayşe Yılmaz" → "Ayşe", "Ayşe" → "Ayşe" */
export function hitapAdi(adSoyad: string): string {
  const k = kelimeler(adSoyad);
  return (k.length >= 3 ? k.slice(0, -1) : k.slice(0, 1)).map(duzgun).join(' ');
}

/** Addan cinsiyet tahmini (yalnızca hitap için); bilinmeyen veya iki cinsiyette kullanılan adlarda undefined */
export function cinsiyetTahmini(adSoyad: string): Cinsiyet | undefined {
  const k = kelimeler(adSoyad);
  const adlar = k.length >= 3 ? k.slice(0, -1) : k.slice(0, 1);
  for (const ad of adlar) {
    const c = SOZLUK.get(sadele(ad));
    if (c) return c;
  }
  return undefined;
}

/** "Ayşe Yılmaz", 'K' → "Ayşe Hanım"; cinsiyet bilinmiyorsa addan tahmin edilir, o da yoksa yalnızca ad */
export function hitap(adSoyad: string, cinsiyet?: Cinsiyet | null): string {
  const ad = hitapAdi(adSoyad);
  const c = cinsiyet ?? cinsiyetTahmini(adSoyad);
  return c ? `${ad} ${c === 'K' ? 'Hanım' : 'Bey'}` : ad;
}
