// Diyetisyen paneli → danışanın Takibim sayfası: özet ve belgeler danışana özel anahtarla şifrelenip gönderilir.

import type { Danisan, Depo, Randevu } from './depo';
import { api, ApiError, bugun } from './lib';
import { aesAnahtari, coz, jsonSifrele, sifrele, unb64, yeniTakipAnahtari, qrParcasi, linkParcasi, type TakipAnahtari } from './sifre';
import type { TakipVerisi } from './tipler';

export const panelBasligi = (depo: Depo): Record<string, string> =>
  depo.veri.sunucu ? { Authorization: `Bearer ${depo.veri.sunucu.jeton}` } : {};

/** Danışanın telefonuna gidecek özet. Özel notlar ve sağlık geçmişi (alerji, hastalık) gönderilmez. */
export function takipVerisi(d: Danisan, randevular: Randevu[]): TakipVerisi {
  const bu = bugun();
  const kendi = randevular
    .filter((r) => r.danisanId === d.id && r.durum !== 'talep' && r.tarih)
    .sort((a, b) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat));
  const gelecek = kendi.filter((r) => r.tarih >= bu && r.durum === 'onaylandi');
  const gecmis = kendi.filter((r) => r.tarih < bu || r.durum !== 'onaylandi').slice(-12);
  return {
    v: 1,
    guncellendi: Date.now(),
    danisan: { ad: d.ad, cinsiyet: d.cinsiyet, boy: d.boy, hedefKilo: d.hedefKilo },
    paket: d.paket,
    randevular: [...gecmis, ...gelecek].map((r) => ({
      id: r.id,
      tarih: r.tarih,
      saat: r.saat,
      tur: r.tur,
      durum: r.durum as 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi',
    })),
    olcumler: d.olcumler.map(({ not: _not, ...o }) => o),
    mesajlar: d.mesajlar,
    belgeler: d.belgeler,
  };
}

type Kutu = { kutu: string; anahtar: string };

async function kutuyaYukle(depo: Depo, k: Kutu, belgeId: string, veri: Uint8Array) {
  const sifreli = await sifrele(await aesAnahtari(unb64(k.anahtar)), veri, `${k.kutu}:${belgeId}`);
  await api('PUT', `/kutu/${k.kutu}/belge/${belgeId}`, sifreli, panelBasligi(depo));
}

async function kutudanIndir(depo: Depo, k: Kutu, belgeId: string): Promise<Uint8Array> {
  const ham = await api<Uint8Array>('GET', `/kutu/${k.kutu}/belge/${belgeId}`, undefined, panelBasligi(depo));
  return coz(await aesAnahtari(unb64(k.anahtar)), ham, `${k.kutu}:${belgeId}`);
}

/**
 * Yeni Takibim anahtarı ve posta kutusu oluşturur (QR / bağlantı için).
 * Önceki kutu varsa (ör. telefon değişti) belgeler yeni kutuya taşınır ve eski kutu silinir; eski telefon erişemez.
 */
export async function takipBaslat(depo: Depo, d: Danisan): Promise<TakipAnahtari> {
  if (!depo.veri.sunucu) throw new ApiError(0, 'Önce Ayarlar bölümünden paneli sunucuya bağlayın.');
  const eski = d.takip;
  const t = yeniTakipAnahtari();
  const yaz = async (jeton?: string) => {
    const veri = await jsonSifrele(await aesAnahtari(unb64(t.anahtar)), takipVerisi(d, depo.veri.randevular), t.kutu);
    await api('PUT', `/kutu/${t.kutu}`, jeton ? { veri, jeton } : { veri }, panelBasligi(depo));
  };
  await yaz(t.jeton);
  if (eski && d.belgeler.length) {
    const tasinan = [];
    for (const b of d.belgeler) {
      try {
        await kutuyaYukle(depo, t, b.id, await kutudanIndir(depo, eski, b.id));
        tasinan.push(b);
      } catch {
        /* eski kutuda bulunamadı */
      }
    }
    if (tasinan.length !== d.belgeler.length) {
      d.belgeler = tasinan;
      await yaz();
    }
  } else if (!eski) d.belgeler = [];
  d.takip = { ...t, olusturma: Date.now(), durum: 'bekliyor', sonGonderim: Date.now() };
  await depo.simdiKaydet();
  if (eski) await api('DELETE', `/kutu/${eski.kutu}`, undefined, panelBasligi(depo)).catch(() => undefined);
  return t;
}

export const takipAnahtari = (d: Danisan): TakipAnahtari | null =>
  d.takip ? { kutu: d.takip.kutu, jeton: d.takip.jeton, anahtar: d.takip.anahtar } : null;

export const qrAdresi = (t: TakipAnahtari) => `${location.origin}/takibim/#${qrParcasi(t)}`;
export const linkAdresi = async (t: TakipAnahtari, kod: string) => `${location.origin}/takibim/#${await linkParcasi(t, kod)}`;

/** Danışanın özetini günceller. Başarısızsa "bekleyenGonderim" işaretlenir ve sonra yeniden denenir. */
export async function takipGonder(depo: Depo, d: Danisan): Promise<'tamam' | 'yok' | 'kapatildi' | 'hata' | 'atla'> {
  const t = d.takip;
  if (!t || t.durum === 'kapatildi' || t.durum === 'yok' || !depo.veri.sunucu) return 'atla';
  try {
    const veri = await jsonSifrele(await aesAnahtari(unb64(t.anahtar)), takipVerisi(d, depo.veri.randevular), t.kutu);
    await api('PUT', `/kutu/${t.kutu}`, { veri }, panelBasligi(depo));
    t.sonGonderim = Date.now();
    t.bekleyenGonderim = false;
    t.hata = undefined;
    return 'tamam';
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) {
      t.durum = 'kapatildi';
      return 'kapatildi';
    }
    if (e instanceof ApiError && e.status === 404) {
      t.durum = 'yok';
      return 'yok';
    }
    t.bekleyenGonderim = true;
    t.hata = e instanceof Error ? e.message : 'Gönderilemedi';
    return 'hata';
  } finally {
    await depo.kaydet();
  }
}

/** Belgeyi (PDF/görsel) danışana özel anahtarla şifreleyip kutuya yükler */
export async function belgeYukle(depo: Depo, d: Danisan, belgeId: string, dosya: Blob): Promise<void> {
  const t = d.takip;
  if (!t || t.durum === 'kapatildi' || t.durum === 'yok') throw new ApiError(0, 'Danışanın etkin bir Takibim kaydı yok.');
  await kutuyaYukle(depo, t, belgeId, new Uint8Array(await dosya.arrayBuffer()));
}

export async function belgeSil(depo: Depo, d: Danisan, belgeId: string): Promise<void> {
  if (!d.takip) return;
  await api('DELETE', `/kutu/${d.takip.kutu}/belge/${belgeId}`, undefined, panelBasligi(depo)).catch(() => undefined);
}

/** Belgeyi kutudan indirir (panelde açmak için) */
export const belgeIndir = (depo: Depo, d: Danisan, belgeId: string) => kutudanIndir(depo, d.takip!, belgeId);

/** Sunucudaki kutu durumlarını danışan kayıtlarına işler */
export async function durumlariGuncelle(depo: Depo): Promise<void> {
  if (!depo.veri.sunucu) return;
  const { kutular } = await api<{
    kutular: { id: string; bekliyor: boolean; eslesti: number | null; riza: string | null; sonBakis: number | null; kapatildi: number | null }[];
  }>('GET', '/kutular', undefined, panelBasligi(depo));
  const harita = new Map(kutular.map((k) => [k.id, k]));
  let degisti = false;
  for (const d of depo.veri.danisanlar) {
    const t = d.takip;
    if (!t) continue;
    const k = harita.get(t.kutu);
    const once = JSON.stringify(t);
    if (!k) {
      if (t.durum !== 'kapatildi') t.durum = 'yok';
    } else if (k.kapatildi) t.durum = 'kapatildi';
    else if (k.eslesti) {
      t.durum = 'eslesti';
      t.eslesti = k.eslesti;
      t.sonBakis = k.sonBakis ?? undefined;
      t.riza = k.riza ?? undefined;
    } else t.durum = 'bekliyor';
    if (JSON.stringify(t) !== once) degisti = true;
  }
  if (degisti) await depo.kaydet();
  // Gönderilemeyenleri yeniden dene
  for (const d of depo.veri.danisanlar) if (d.takip?.bekleyenGonderim) await takipGonder(depo, d);
}

