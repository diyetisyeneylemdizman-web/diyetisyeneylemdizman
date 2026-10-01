// Diyetisyen paneli ile Takibim sayfasının ortak veri yapıları.

export type SegmentAdi = 'sagKol' | 'solKol' | 'govde' | 'sagBacak' | 'solBacak';

export interface SegmentDeger {
  yagOrani?: number;
  yagKg?: number;
  yagsizKg?: number;
  kasKg?: number;
}

/** Tek bir ölçüm. Klinikte vücut analizi cihazından (PDF), elle veya PDF'teki geçmiş tablosundan gelir. */
export interface Olcum {
  id: string;
  tarih: string; // YYYY-AA-GG
  saat?: string; // SS:DD
  kaynak: 'pdf' | 'gecmis' | 'elle' | 'ev';
  kilo?: number;
  bmi?: number;
  yagOrani?: number;
  yagKg?: number;
  yagsizKg?: number;
  kasKg?: number;
  kasOrani?: number;
  suKg?: number;
  suOrani?: number;
  icYag?: number;
  bmh?: number;
  metabolikYas?: number;
  proteinKg?: number;
  mineralKg?: number;
  idealKilo?: number;
  iskeletKasKg?: number;
  bel?: number;
  kalca?: number;
  belKalca?: number;
  belBoy?: number;
  fitPuani?: number;
  segment?: Partial<Record<SegmentAdi, SegmentDeger>>;
  belgeId?: string; // danışana gönderilen rapor PDF'i
  not?: string;
}

export interface PaketBilgisi {
  ad: string;
  baslangic?: string;
  bitis?: string;
  toplamGorusme?: number;
  kalanGorusme?: number;
  not?: string;
}

export interface TakipRandevu {
  id: string;
  tarih: string;
  saat: string;
  tur: 'yuzyuze' | 'online';
  durum: 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi';
}

export interface TakipMesaj {
  id: string;
  tarih: number; // ms
  metin: string;
  duyuru?: boolean;
}

export interface TakipBelge {
  id: string;
  baslik: string;
  ad: string; // dosya adı
  tur: string; // mime
  boyut: number;
  tarih: number;
}

/** Danışanın telefonuna giden şifreli özet (Takibim verisi) */
export interface TakipVerisi {
  v: 1;
  guncellendi: number;
  danisan: { ad: string; cinsiyet?: 'K' | 'E'; boy?: number; hedefKilo?: number };
  paket: PaketBilgisi | null;
  randevular: TakipRandevu[];
  olcumler: Olcum[];
  mesajlar: TakipMesaj[];
  belgeler: TakipBelge[];
}

export const SEGMENTLER: { ad: SegmentAdi; etiket: string }[] = [
  { ad: 'sagKol', etiket: 'Sağ Kol' },
  { ad: 'solKol', etiket: 'Sol Kol' },
  { ad: 'govde', etiket: 'Gövde' },
  { ad: 'sagBacak', etiket: 'Sağ Bacak' },
  { ad: 'solBacak', etiket: 'Sol Bacak' },
];

/** Ölçüm alanları: ad, birim, ondalık */
export const OLCUM_ALANLARI: { ad: keyof Olcum; etiket: string; birim: string; basamak: number; kisa?: string }[] = [
  { ad: 'kilo', etiket: 'Kilo', birim: 'kg', basamak: 1 },
  { ad: 'yagOrani', etiket: 'Yağ Oranı', birim: '%', basamak: 1 },
  { ad: 'yagKg', etiket: 'Yağ Kütlesi', birim: 'kg', basamak: 1 },
  { ad: 'kasKg', etiket: 'Kas Kütlesi', birim: 'kg', basamak: 1 },
  { ad: 'yagsizKg', etiket: 'Yağsız Kütle', birim: 'kg', basamak: 1 },
  { ad: 'suOrani', etiket: 'Vücut Suyu', birim: '%', basamak: 1 },
  { ad: 'suKg', etiket: 'Vücut Suyu', birim: 'kg', basamak: 1, kisa: 'Su (kg)' },
  { ad: 'icYag', etiket: 'İç Yağlanma', birim: '', basamak: 0 },
  { ad: 'bmh', etiket: 'Bazal Metabolizma', birim: 'kcal', basamak: 0 },
  { ad: 'metabolikYas', etiket: 'Metabolik Yaş', birim: '', basamak: 0 },
  { ad: 'bmi', etiket: 'BKİ', birim: '', basamak: 1 },
  { ad: 'bel', etiket: 'Bel Çevresi', birim: 'cm', basamak: 0 },
  { ad: 'kalca', etiket: 'Kalça Çevresi', birim: 'cm', basamak: 0 },
];
