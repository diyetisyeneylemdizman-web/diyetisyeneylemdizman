// Takibim — danışanın telefonundaki takip sayfası. İki düzende çalışır (src/data/portal.ts → takibimKipi):
//
// 'qr' (şu anki düzen, sunucusuz):
// - Diyetisyenin gösterdiği QR kodu (#n=…) danışanın özetini içinde taşır; bilgiler doğrudan bu telefonda açılır ve
//   yalnızca burada saklanır. Hiçbir sunucuya istek gönderilmez. Online danışan: 6 haneli kodla şifreli bağlantı (#k=…).
// - İlk QR / bağlantı danışana özel bir anahtar da getirir; telefonda saklanır. Sonraki ölçümlerde diyetisyenin WhatsApp'tan
//   gönderdiği güncelleme bağlantısı (#g=…) bu anahtarla açılır ve bilgiler güncellenir (qrtakip.ts → birlestir).
//   QR yeniden okutulmaz; bağlantı başka bir telefonda / tarayıcıda açılmaz.
//
// 'sunucu':
// - QR (#q=) bu telefonu danışanın uçtan uca şifreli kutusuna bağlar; anahtar yalnızca bu telefonda saklanır.
// - Diyetisyen yeni ölçüm eklediğinde sayfa açılınca kendiliğinden güncellenir; yeniden QR okutmak gerekmez.
//
// Her iki düzende evde girilen ölçümler ve PIN yalnızca bu telefonda kalır.

import { portalBelgeleri, sunucuAcik, takibimRizaSurumu } from '../../data/portal';
import { site } from '../../data/site';
import { degisimKartlari, grafikler, olcumTablosu } from './gelisim';
import { $, alan, api, ApiError, boyut, bugun, formNesnesi, h, indir, mesgul, pencere, sayi, tarih, tarihSaat, toast, turAdi, Uyari } from './lib';
import { birlestir, guncellemeAc, guncellemeKimligi, qrParcaAc, qrParcaTuru, type QrTakip } from './qrtakip';
import { aesAnahtari, b64, b64url, coz, jsonCoz, parcaCoz, parcaTuru, parolaAnahtari, rastgele, sifrele, unb64, kimlik } from './sifre';
import type { Olcum, TakipVerisi } from './tipler';
import { vucutHaritasi } from './vucut';

interface Kayit {
  v: 1;
  /** Sunucusuz düzende danışanın kimliği (QR'dan); sunuculu düzende boş */
  kimlik?: string;
  kutu: string;
  anahtar: string;
  cihaz: string;
  riza: string;
  onbellek?: TakipVerisi;
  alindi?: number;
  evdeki: Olcum[];
  okunan: string[];
  kapali?: boolean;
}

interface Saklanan {
  v: 1;
  acik?: Kayit;
  kilit?: { tuz: string; veri: string };
}

const ANAHTAR = 'takibim';
const PIN_TURU = 150_000;
const kok = $('[data-uygulama]');
let kayit: Kayit | null = null;
let pinAnahtari: CryptoKey | null = null;
let pinTuzu: string | null = null;
let cevrimdisi = false;

// ================================================================ Saklama (yalnızca bu telefon)

function okuSaklanan(): Saklanan | null {
  try {
    const s = localStorage.getItem(ANAHTAR);
    return s ? (JSON.parse(s) as Saklanan) : null;
  } catch {
    return null;
  }
}

async function kaydet() {
  if (!kayit) return;
  const veri: Saklanan = { v: 1 };
  if (pinAnahtari && pinTuzu) {
    const sifreli = await sifrele(pinAnahtari, new TextEncoder().encode(JSON.stringify(kayit)), 'takibim');
    veri.kilit = { tuz: pinTuzu, veri: b64(sifreli) };
  } else veri.acik = kayit;
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(veri));
  } catch {
    toast('Bilgiler bu telefona kaydedilemedi (gizli sekme veya dolu depolama).', 'hata');
  }
}

function yerelSil() {
  try {
    localStorage.removeItem(ANAHTAR);
  } catch {
    /* yok */
  }
  kayit = null;
  pinAnahtari = null;
  pinTuzu = null;
}

const cihazBasligi = () => ({ 'X-Cihaz': kayit!.cihaz });

// ================================================================ Sunucudan güncelleme

async function guncelle(): Promise<boolean> {
  // Sunucusuz düzende (QR) hiçbir sunucuya istek gönderilmez; bilgiler yalnızca yeni QR okutulunca güncellenir
  if (!sunucuAcik || !kayit || kayit.kapali) return false;
  try {
    const r = await api<{ veri: string | null; guncellendi: number }>('GET', `/takip/${kayit.kutu}`, undefined, cihazBasligi());
    cevrimdisi = false;
    if (r.veri) {
      kayit.onbellek = await jsonCoz<TakipVerisi>(await aesAnahtari(unb64(kayit.anahtar)), r.veri, kayit.kutu);
      kayit.alindi = Date.now();
      await kaydet();
    }
    return true;
  } catch (e) {
    if (e instanceof ApiError && [403, 404, 410].includes(e.status)) {
      kayit.kapali = true;
      await kaydet();
    } else cevrimdisi = true;
    return false;
  }
}

// ================================================================ Ekranlar: tanıtım, eşleşme, PIN

function ortaKart(...icerik: (Node | null)[]) {
  kok.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-kart' }, ...icerik)));
}

function tanitimEkrani() {
  const iosAnaEkran = (navigator as unknown as { standalone?: boolean }).standalone === true;
  ortaKart(
    h('h1', null, 'Takibim'),
    h(
      'p',
      null,
      'Takibim, klinikteki ölçümlerinizi, vücut haritanızı, paketinizi ve randevularınızı telefonunuzdan izlemenizi sağlar.',
    ),
    h(
      'ol',
      { class: 'adim-liste' },
      h('li', null, sunucuAcik ? 'Görüşmenizde diyetisyeninizden Takibim QR kodunu isteyin.' : 'Ölçümünüzden sonra diyetisyeninizden Takibim QR kodunu isteyin.'),
      h('li', null, 'Telefonunuzun kamerasıyla QR kodu okutun.'),
      h('li', null, 'Sonraki girişlerinizde sitedeki "Takibim" düğmesine dokunmanız yeterli.'),
      sunucuAcik ? null : h('li', null, 'Yeni ölçümlerinizden sonra diyetisyeninizin WhatsApp\'tan gönderdiği güncelleme bağlantısına dokunmanız yeterli.'),
    ),
    sunucuAcik
      ? null
      : h('p', { class: 'hint' }, 'Online görüşüyorsanız diyetisyeninizin WhatsApp\'tan gönderdiği bağlantıyı açıp görüşmede söylenen 6 haneli kodu girin.'),
    iosAnaEkran
      ? h('div', { class: 'bilgi-kutu' }, h('p', null, 'Ana ekrandaki simgeden açılan sayfa, Safari\'deki kaydı göremez. Takibim\'i Safari\'den açın.'))
      : null,
    h('p', { class: 'form-alt' }, h('a', { href: '/randevu-olustur/' }, 'Randevu talebi oluşturun'), ' · ', h('a', { href: '/' }, 'Ana sayfa')),
  );
}

function onayKutulari() {
  if (!sunucuAcik)
    return [
      h(
        'label',
        { class: 'onay-satiri' },
        h('input', { type: 'checkbox', name: 'aydinlatma', required: true }),
        h(
          'span',
          null,
          h('a', { href: portalBelgeleri.aydinlatma.yol, target: '_blank', rel: 'noopener' }, 'KVKK Aydınlatma Metni'),
          '’ni okudum; bilgilerimin bu telefonda saklanmasını istiyorum.',
        ),
      ),
    ];
  return [
    h(
      'label',
      { class: 'onay-satiri' },
      h('input', { type: 'checkbox', name: 'aydinlatma', required: true }),
      h(
        'span',
        null,
        h('a', { href: portalBelgeleri.aydinlatma.yol, target: '_blank', rel: 'noopener' }, 'KVKK Aydınlatma Metni'),
        '’ni okudum, ',
        h('a', { href: portalBelgeleri.kosullar.yol, target: '_blank', rel: 'noopener' }, 'Takibim Kullanım Koşulları'),
        '’nı kabul ediyorum.',
      ),
    ),
    h(
      'label',
      { class: 'onay-satiri' },
      h('input', { type: 'checkbox', name: 'riza', required: true }),
      h(
        'span',
        null,
        'Sağlık verilerimin ',
        h('a', { href: portalBelgeleri.acikRiza.yol, target: '_blank', rel: 'noopener' }, 'Açık Rıza Metni'),
        '’nde açıklandığı şekilde Takibim kapsamında işlenmesine açık rıza veriyorum.',
      ),
    ),
  ];
}

function onaylariDenetle(f: Record<string, unknown>) {
  if (!sunucuAcik) {
    if (!f.aydinlatma) throw new Uyari('Devam etmek için onay kutusunu işaretleyin.');
    return;
  }
  if (!f.aydinlatma) throw new Uyari('Devam etmek için aydınlatma metni ve kullanım koşulları kutusunu işaretleyin.');
  if (!f.riza) throw new Uyari('Takibim\'i kullanmak için açık rıza kutusunu işaretleyin. Rıza vermezseniz takibiniz klinikte devam eder.');
}

function hataYaz(form: HTMLElement, err: unknown) {
  const kutu = form.querySelector<HTMLElement>('[data-form-hata]')!;
  kutu.textContent = err instanceof ApiError || err instanceof Uyari ? err.message : 'Beklenmeyen bir hata oluştu. Tekrar deneyin.';
  if (!(err instanceof ApiError || err instanceof Uyari)) console.error(err);
  kutu.hidden = false;
}

function eslesmeEkrani(parca: string, tur: 'qr' | 'link') {
  const eski = okuSaklanan();
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    tur === 'link'
      ? alan(
          'Açılış kodu',
          h('input', { class: 'input kod-girisi', name: 'kod', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]{6}' }),
          'Diyetisyeninizin size söylediği 6 haneli kod',
        )
      : null,
    ...onayKutulari(),
    eski ? h('div', { class: 'bilgi-kutu' }, h('p', null, 'Bu telefonda kayıtlı bir Takibim var. Devam ederseniz yenisiyle değiştirilir.')) : null,
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Takibimi Aç'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        const f = formNesnesi(form);
        if (tur === 'link' && !/^\d{6}$/.test(String(f.kod).trim())) throw new Uyari('6 haneli açılış kodunu girin.');
        onaylariDenetle(f);
        let t;
        try {
          t = await parcaCoz(parca, String(f.kod ?? '').trim());
        } catch {
          throw new Uyari(tur === 'link' ? 'Açılış kodu hatalı.' : 'QR kodu okunamadı. Diyetisyeninizden yeni QR isteyin.');
        }
        // Aynı kayıt bu telefonda zaten varsa aynı cihaz anahtarı kullanılır (yeniden okutma)
        const onceki = eski?.acik?.kutu === t.kutu ? eski.acik : null;
        const cihaz = onceki?.cihaz ?? b64url(rastgele(32));
        await api('POST', `/takip/${t.kutu}/eslestir`, { jeton: t.jeton, cihaz, riza: takibimRizaSurumu });
        yerelSil();
        kayit = { v: 1, kutu: t.kutu, anahtar: t.anahtar, cihaz, riza: takibimRizaSurumu, evdeki: onceki?.evdeki ?? [], okunan: [] };
        await kaydet();
        await guncelle();
        if (!kayit.onbellek) throw new Uyari('Bilgileriniz alınamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
        location.hash = '#ozet';
        uygulama();
        toast('Takibiniz bu telefonda açıldı.');
      } catch (err) {
        hataYaz(form, err);
      }
    });
  });
  ortaKart(
    h('h1', null, 'Takibim’e Hoş Geldiniz'),
    h(
      'p',
      null,
      `${site.name}’ın klinikteki ölçümleriniz, paketiniz, randevularınız ve size gönderdiği belgeler bu telefonda görüntülenecek.`,
    ),
    h(
      'div',
      { class: 'bilgi-kutu' },
      h('p', null, h('strong', null, 'Uçtan uca şifreli: '), 'Bilgilerinizi yalnızca bu telefon ve diyetisyeninizin bilgisayarı okuyabilir. Bu QR kodu yalnızca bir telefonda kullanılabilir.'),
    ),
    form,
  );
}

function pinEkrani(s: Saklanan, sonra?: () => unknown) {
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    alan('PIN', h('input', { class: 'input kod-girisi', type: 'password', name: 'pin', inputmode: 'numeric', autocomplete: 'off', maxlength: 6 })),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Aç'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        const pin = String(formNesnesi(form).pin).trim();
        const anahtar = await parolaAnahtari(pin, unb64(s.kilit!.tuz), PIN_TURU);
        let acik: Kayit;
        try {
          acik = JSON.parse(new TextDecoder().decode(await coz(anahtar, unb64(s.kilit!.veri), 'takibim')));
        } catch {
          throw new Uyari('PIN hatalı.');
        }
        kayit = acik;
        pinAnahtari = anahtar;
        pinTuzu = s.kilit!.tuz;
        if (sonra) return void (await sonra());
        uygulama();
        void guncelle().then(() => ciz());
      } catch (err) {
        hataYaz(form, err);
      }
    });
  });
  ortaKart(
    h('h1', null, 'Takibim'),
    h('p', null, 'Devam etmek için PIN\'inizi girin.'),
    form,
    h(
      'p',
      { class: 'form-alt' },
      h('button', {
        type: 'button',
        class: 'metin-dugme',
        onclick: async () => {
          const ok = await pencere({
            baslik: 'PIN\'imi Unuttum',
            tehlikeli: true,
            kaydet: 'Bu Telefondaki Bilgileri Sil',
            icerik: h('p', null, 'PIN olmadan bilgiler açılamaz. Bu telefondaki Takibim bilgilerini silebilir, ardından diyetisyeninizden yeni bir QR kodu isteyebilirsiniz. Klinikteki kayıtlarınız silinmez.'),
          });
          if (ok) {
            yerelSil();
            tanitimEkrani();
          }
        },
      }, 'PIN\'imi unuttum'),
    ),
  );
  setTimeout(() => form.querySelector('input')?.focus(), 50);
}

function rizaYenileEkrani() {
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    ...onayKutulari(),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Onayla ve Devam Et'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        onaylariDenetle(formNesnesi(form));
        await api('POST', `/takip/${kayit!.kutu}/eslestir`, { cihaz: kayit!.cihaz, riza: takibimRizaSurumu });
        kayit!.riza = takibimRizaSurumu;
        await kaydet();
        uygulama();
      } catch (err) {
        hataYaz(form, err);
      }
    });
  });
  ortaKart(
    h('h1', null, 'Metinler Güncellendi'),
    h('p', null, 'Takibim\'e ilişkin aydınlatma metni, açık rıza metni veya kullanım koşulları güncellendi. Devam etmek için güncel metinleri onaylayın.'),
    form,
    h('p', { class: 'form-alt' }, 'Onay vermek istemiyorsanız ', h('a', { href: '#ayarlar' }, 'Ayarlar'), ' bölümünden takibinizi kapatabilirsiniz.'),
  );
}

// ================================================================ Sunucusuz Takibim: QR / bağlantı ile açma ve güncelleme

/** QR'daki bilgileri bu telefona kaydeder (aynı kişiyse günceller, değilse yenisiyle değiştirir) */
async function qrKaydet(v: QrTakip) {
  const ayniKisi = kayit?.kimlik === v.kimlik;
  if (ayniKisi && kayit!.onbellek && v.guncellendi < kayit!.onbellek.guncellendi) {
    toast('Bu QR kodu, telefonunuzdaki bilgilerden daha eski; güncelleme yapılmadı.', 'hata');
  } else {
    const evdeki = ayniKisi ? kayit!.evdeki : [];
    const okunan = ayniKisi ? kayit!.okunan : [];
    const onceki = ayniKisi ? kayit!.onbellek : undefined;
    if (!ayniKisi) {
      // Başka bir kişinin kaydı varsa (ve PIN'i) kaldırılır
      pinAnahtari = null;
      pinTuzu = null;
    }
    // Güncelleme anahtarı ilk QR / bağlantıyla gelir; güncelleme bağlantılarında yoktur, eskisi korunur
    const anahtar = v.anahtar ?? (ayniKisi ? kayit!.anahtar : '');
    kayit = {
      v: 1,
      kimlik: v.kimlik,
      kutu: '',
      anahtar,
      cihaz: '',
      riza: portalBelgeleri.aydinlatma.surum,
      onbellek: birlestir(onceki, v),
      alindi: Date.now(),
      evdeki,
      okunan,
    };
    await kaydet();
    toast(ayniKisi ? 'Bilgileriniz güncellendi.' : 'Takibiniz bu telefonda açıldı.');
  }
  history.replaceState(null, '', `${location.pathname}#ozet`);
  uygulama();
}

function qrHosGeldin(parca: string, tur: 'qr' | 'link', hazir: QrTakip | null) {
  const eskiAd = kayit?.onbellek?.danisan.ad;
  const baskaKisi = Boolean(kayit && hazir && kayit.kimlik !== hazir.kimlik);
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    tur === 'link'
      ? alan(
          'Açılış kodu',
          h('input', { class: 'input kod-girisi', name: 'kod', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]{6}' }),
          'Diyetisyeninizin görüşmede söylediği 6 haneli kod',
        )
      : null,
    ...(kayit && !baskaKisi ? [] : onayKutulari()),
    baskaKisi || (tur === 'link' && kayit)
      ? h('div', { class: 'bilgi-kutu uyari' }, h('p', null, `Bu telefonda ${eskiAd ? `${eskiAd} adına ` : ''}kayıtlı bir Takibim var. Bağlantı başka bir kişiye aitse eski bilgiler yenisiyle değiştirilir.`))
      : null,
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Takibimi Aç'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    await mesgul(btn, async () => {
      try {
        const f = formNesnesi(form);
        if (tur === 'link' && !/^\d{6}$/.test(String(f.kod).trim())) throw new Uyari('6 haneli açılış kodunu girin.');
        if (!kayit || baskaKisi) onaylariDenetle(f);
        let v = hazir;
        if (!v) {
          try {
            v = await qrParcaAc(parca, String(f.kod ?? '').trim());
          } catch {
            throw new Uyari(tur === 'link' ? 'Açılış kodu hatalı.' : 'QR kodu okunamadı. Diyetisyeninizden yeni QR isteyin.');
          }
        }
        await qrKaydet(v);
      } catch (err) {
        hataYaz(form, err);
      }
    });
  });
  ortaKart(
    h('h1', null, kayit && !baskaKisi ? 'Takibim' : 'Takibim’e Hoş Geldiniz'),
    h(
      'p',
      null,
      tur === 'link'
        ? 'Diyetisyeninizin gönderdiği bağlantı, ölçümlerinizi, vücut haritanızı, paketinizi ve randevularınızı içerir. Açmak için görüşmede söylenen 6 haneli kodu girin.'
        : `${site.name}’ın klinikteki ölçümleriniz, vücut haritanız, paketiniz ve randevularınız bu telefonda görüntülenecek.`,
    ),
    h(
      'div',
      { class: 'bilgi-kutu' },
      h('p', null, h('strong', null, 'Yalnızca bu telefonda: '), 'Bilgileriniz bu telefona kaydedilir; internete veya sunucuya gönderilmez. Telefonunuzu başkalarıyla paylaşıyorsanız Ayarlar bölümünden PIN koyabilirsiniz.'),
    ),
    form,
  );
}

function guncellemeHatasi(...metin: string[]) {
  ortaKart(
    h('h1', null, 'Takibim'),
    ...metin.map((m) => h('p', null, m)),
    h('p', { class: 'form-alt' }, h('a', { href: '/takibim/' }, 'Takibim’e dön')),
  );
}

/** WhatsApp'tan gelen güncelleme bağlantısı: telefondaki anahtarla açılır */
async function guncellemeIle(parca: string) {
  if (!kayit?.anahtar)
    return guncellemeHatasi(
      'Bu güncelleme bağlantısı, Takibim’i açtığınız telefonda ve tarayıcıda çalışır; bu tarayıcıda Takibim açık değil.',
      'Bağlantı WhatsApp’ın içinde açıldıysa sağ üstteki menüden “Tarayıcıda aç”ı seçin. Takibim’i hiç açmadıysanız ya da telefonunuzu değiştirdiyseniz diyetisyeninizden QR kodunu yeniden isteyin.',
    );
  if (guncellemeKimligi(parca) !== kayit.kimlik)
    return guncellemeHatasi('Bu güncelleme bağlantısı, bu telefondaki Takibim’e ait değil. Diyetisyeninizle iletişime geçin.');
  let v: QrTakip;
  try {
    v = await guncellemeAc(parca, kayit.anahtar);
  } catch {
    return guncellemeHatasi('Güncelleme açılamadı. Diyetisyeninizden yeni bir güncelleme bağlantısı ya da QR kodu isteyin.');
  }
  return qrKaydet(v);
}

/** Adresteki QR / bağlantı parçasını işler */
async function qrIle(parca: string, tur: 'qr' | 'link' | 'guncelleme') {
  if (tur === 'guncelleme') return guncellemeIle(parca);
  let hazir: QrTakip | null = null;
  if (tur === 'qr') {
    try {
      hazir = await qrParcaAc(parca);
    } catch {
      return ortaKart(
        h('h1', null, 'Takibim'),
        h('p', null, 'QR kodu okunamadı. QR\'ı yeniden okutun ya da diyetisyeninizden yeni QR isteyin.'),
        h('p', { class: 'form-alt' }, h('a', { href: '/takibim/' }, 'Takibim’e dön')),
      );
    }
  }
  // Aynı kişinin yeni QR'ı: onay sormadan güncelle
  if (hazir && kayit?.kimlik === hazir.kimlik) return qrKaydet(hazir);
  return qrHosGeldin(parca, tur, hazir);
}

// ================================================================ Uygulama

const MENU: [string, string][] = (
  [
    ['ozet', 'Özet'],
    ['gelisim', 'Gelişimim'],
    ['olcumler', 'Ölçümlerim'],
    ['paketim', 'Paketim'],
    ['randevular', 'Randevularım'],
    ['belgeler', 'Belgelerim'],
    ['mesajlar', 'Mesajlar'],
    ['ayarlar', 'Ayarlar'],
  ] as [string, string][]
).filter(([k]) => sunucuAcik || !['belgeler', 'mesajlar'].includes(k));

let olaylar = false;
function uygulama() {
  if (!olaylar) {
    olaylar = true;
    addEventListener('hashchange', () => kayit && ciz());
    if (sunucuAcik) document.addEventListener('visibilitychange', () => {
      if (!document.hidden && kayit && (!kayit.alindi || Date.now() - kayit.alindi > 60_000)) void guncelle().then(() => cizSessiz());
    });
    if (sunucuAcik)
      setInterval(() => {
        if (!document.hidden && kayit) void guncelle().then(() => cizSessiz());
      }, 5 * 60_000);
  }
  ciz();
}

function cizSessiz() {
  if (document.querySelector('dialog[open]')) return;
  const aktif = document.activeElement;
  if (aktif && kok.contains(aktif) && /INPUT|TEXTAREA|SELECT/.test(aktif.tagName)) return;
  ciz();
}

const veri = () => kayit!.onbellek!;
const okunmamis = () => (kayit?.onbellek?.mesajlar ?? []).filter((m) => !kayit!.okunan.includes(m.id)).length;

function ciz() {
  if (!kayit) return;
  if (!kayit.onbellek) {
    ortaKart(h('h1', null, 'Takibim'), h('p', null, 'Bilgileriniz alınamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.'));
    return;
  }
  const istenen = location.hash.slice(1) || 'ozet';
  const bolum = MENU.some(([k]) => k === istenen) ? istenen : 'ozet';
  if (sunucuAcik && kayit.riza !== takibimRizaSurumu && bolum !== 'ayarlar' && !kayit.kapali) return rizaYenileEkrani();
  const n = okunmamis();
  const menu = h(
    'nav',
    { class: 'panel-menu', 'aria-label': 'Takibim menüsü' },
    MENU.map(([k, ad]) =>
      h('a', { href: `#${k}`, 'aria-current': bolum === k ? 'page' : null }, ad, k === 'mesajlar' && n ? h('span', { class: 'rozet', 'aria-label': `${n} okunmamış` }, String(n)) : null),
    ),
  );
  const icerik = h('div', { class: 'panel-icerik' });
  kok.replaceChildren(h('div', { class: 'panel' }, menu, icerik));
  if (kayit.kapali)
    icerik.append(
      h(
        'div',
        { class: 'bilgi-kutu uyari' },
        h('p', null, h('strong', null, 'Takibiniz sonlandırılmış veya yeni bir QR oluşturulmuş. '), 'Aşağıda bu telefonda kayıtlı son bilgileriniz görünüyor. Takibe devam etmek için diyetisyeninizden yeni QR kodu isteyin.'),
      ),
    );
  else if (cevrimdisi) icerik.append(h('div', { class: 'bilgi-kutu' }, h('p', null, 'İnternete bağlanılamadı; bu telefonda kayıtlı son bilgiler gösteriliyor.')));
  const sayfalar: Record<string, () => Node[]> = { ozet, gelisim, olcumler, paketim, randevular, belgeler, mesajlar, ayarlar };
  icerik.append(...(sayfalar[bolum] ?? ozet)());
}

const kart = (baslik: string | null, ...icerik: (Node | null | false | undefined)[]) =>
  h('section', { class: 'kart' }, baslik ? h('h2', null, baslik) : null, ...icerik);
const baslik = (b: string, alt?: string | null) => h('div', { class: 'bolum-baslik' }, h('div', null, h('h1', null, b), alt ? h('p', null, alt) : null));
const bos = (m: string) => h('p', { class: 'bos' }, m);
const tumOlcumler = () => [...veri().olcumler, ...kayit!.evdeki];

function sonrakiRandevu() {
  const bu = bugun();
  return veri()
    .randevular.filter((r) => r.durum === 'onaylandi' && r.tarih >= bu)
    .sort((a, b) => (a.tarih + a.saat).localeCompare(b.tarih + b.saat))[0];
}

function sonOlcumKutusu() {
  const son = veri()
    .olcumler.filter((o) => o.kaynak !== 'ev')
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .at(-1);
  return h(
    'a',
    { class: 'kart gosterge tiklanir', href: '#olcumler' },
    h('span', { class: 'etiket' }, 'Son Ölçümüm'),
    h('span', { class: 'deger kucuk' }, son ? tarih(son.tarih) : 'Henüz yok'),
    son?.kilo !== undefined ? h('span', { class: 'alt' }, `${sayi(son.kilo, 1)} kg`) : null,
  );
}

function ozet(): Node[] {
  const v = veri();
  const r = sonrakiRandevu();
  const p = v.paket;
  return [
    baslik(`Merhaba ${v.danisan.ad.split(' ')[0]}`, kayit!.alindi ? `Son güncelleme: ${tarihSaat(kayit!.alindi)}` : null),
    h(
      'div',
      { class: 'izgara' },
      h(
        'a',
        { class: 'kart gosterge tiklanir', href: '#paketim' },
        h('span', { class: 'etiket' }, 'Paketim'),
        h('span', { class: 'deger kucuk' }, p ? p.ad : 'Paket yok'),
        p?.bitis ? h('span', { class: 'alt' }, `Bitiş: ${tarih(p.bitis)}${p.kalanGorusme !== undefined ? ` · ${p.kalanGorusme} görüşme kaldı` : ''}`) : null,
      ),
      h(
        'a',
        { class: 'kart gosterge tiklanir', href: '#randevular' },
        h('span', { class: 'etiket' }, 'Sonraki Randevum'),
        h('span', { class: 'deger kucuk' }, r ? `${tarih(r.tarih)} · ${r.saat}` : 'Planlı randevu yok'),
        r ? h('span', { class: 'alt' }, turAdi(r.tur)) : null,
      ),
      sunucuAcik
        ? h(
            'a',
            { class: 'kart gosterge tiklanir', href: '#mesajlar' },
            h('span', { class: 'etiket' }, 'Mesajlar'),
            h('span', { class: 'deger' }, String(okunmamis())),
            h('span', { class: 'alt' }, 'okunmamış'),
          )
        : sonOlcumKutusu(),
    ),
    tumOlcumler().length ? h('h2', { class: 'ara-baslik' }, 'Başlangıçtan Bu Yana') : null,
    tumOlcumler().length ? degisimKartlari(tumOlcumler(), v.danisan.hedefKilo) : null,
    kart('Vücut Haritam', vucutHaritasi(v.olcumler)),
  ].filter(Boolean) as Node[];
}

function gelisim(): Node[] {
  const v = veri();
  return [
    baslik('Gelişimim', 'Ölçümlerinizin zaman içindeki değişimi. Grafiğin üzerine gelerek ya da ok tuşlarıyla tarihleri inceleyebilirsiniz.'),
    grafikler(v.olcumler, v.danisan.hedefKilo, kayit!.evdeki),
    h('p', { class: 'bilgi-kutu' }, 'Yağ ve kas ölçümleri klinikteki vücut analizinden sonra diyetisyeniniz tarafından eklenir. Değerler kişiden kişiye değişir; yorumlamak için diyetisyeninize danışın.'),
  ];
}

function olcumler(): Node[] {
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h(
      'div',
      { class: 'form-grid uc' },
      alan('Tarih', h('input', { class: 'input', type: 'date', name: 'tarih', value: bugun(), max: bugun() })),
      alan('Kilo (kg)', h('input', { class: 'input', name: 'kilo', inputmode: 'decimal' })),
      alan('Bel Çevresi (cm)', h('input', { class: 'input', name: 'bel', inputmode: 'decimal' })),
    ),
    h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Ekle'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const f = formNesnesi(form);
      const sayiAl = (v: string, et: string, min: number, max: number) => {
        const s = String(v).trim().replace(',', '.');
        if (!s) return undefined;
        const n = Number(s);
        if (!Number.isFinite(n) || n < min || n > max) throw new Uyari(`${et} ${min}–${max} arasında olmalıdır.`);
        return Math.round(n * 10) / 10;
      };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tarih) || f.tarih > bugun()) throw new Uyari('Geçerli bir tarih seçin.');
      const kilo = sayiAl(f.kilo, 'Kilo', 20, 350);
      const bel = sayiAl(f.bel, 'Bel çevresi', 40, 250);
      if (kilo === undefined && bel === undefined) throw new Uyari('Kilo veya bel çevresi girin.');
      const o: Olcum = { id: kimlik(), tarih: f.tarih, kaynak: 'ev' };
      if (kilo !== undefined) o.kilo = kilo;
      if (bel !== undefined) o.bel = bel;
      kayit!.evdeki.push(o);
      await kaydet();
      toast('Ölçümünüz bu telefona kaydedildi.');
      ciz();
    } catch (err) {
      hataYaz(form, err);
    }
  });
  return [
    baslik('Ölçümlerim'),
    kart(
      'Evde Tartıldım',
      h('p', { class: 'hint' }, 'Evde girdiğiniz ölçümler yalnızca bu telefonda saklanır ve grafiklerde boş daire ile gösterilir. Diyetisyeninize iletilmez.'),
      form,
    ),
    kart(
      'Tüm Ölçümler',
      olcumTablosu(tumOlcumler(), (o) =>
        o.kaynak === 'ev'
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-outline btn-xs',
                onclick: async () => {
                  kayit!.evdeki = kayit!.evdeki.filter((x) => x.id !== o.id);
                  await kaydet();
                  ciz();
                },
              },
              'Sil',
            )
          : null,
      ),
    ),
  ];
}

function paketim(): Node[] {
  const p = veri().paket;
  return [
    baslik('Paketim'),
    kart(
      null,
      p
        ? h(
            'dl',
            { class: 'sabit-bilgi' },
            h('dt', null, 'Paket'),
            h('dd', null, p.ad),
            h('dt', null, 'Başlangıç'),
            h('dd', null, tarih(p.baslangic)),
            h('dt', null, 'Bitiş'),
            h('dd', null, tarih(p.bitis)),
            p.toplamGorusme !== undefined ? [h('dt', null, 'Görüşme'), h('dd', null, `${p.kalanGorusme ?? '—'} / ${p.toplamGorusme} kaldı`)] : null,
            p.not ? [h('dt', null, 'Not'), h('dd', null, p.not)] : null,
          )
        : bos('Şu anda tanımlı bir paketiniz yok. Paketler hakkında bilgi için diyetisyeninize danışın.'),
    ),
  ];
}

function randevular(): Node[] {
  const bu = bugun();
  const liste = [...veri().randevular].sort((a, b) => (b.tarih + b.saat).localeCompare(a.tarih + a.saat));
  const gelecek = liste.filter((r) => r.durum === 'onaylandi' && r.tarih >= bu).reverse();
  const gecmis = liste.filter((r) => !(r.durum === 'onaylandi' && r.tarih >= bu));
  const DURUM: Record<string, string> = { onaylandi: 'Onaylandı', tamamlandi: 'Tamamlandı', iptal: 'İptal', gelmedi: 'Katılınmadı' };
  const satir = (r: (typeof liste)[number]) =>
    h(
      'li',
      null,
      h('div', { class: 'ana' }, h('strong', null, `${tarih(r.tarih, true)} · ${r.saat}`), h('span', null, ` ${turAdi(r.tur)}`)),
      h('div', { class: 'eylemler' }, h('span', { class: `durum ${r.durum}` }, DURUM[r.durum] ?? r.durum)),
    );
  return [
    baslik('Randevularım'),
    kart('Yaklaşan', gelecek.length ? h('ul', { class: 'liste' }, gelecek.map(satir)) : bos('Onaylı yaklaşan randevunuz yok.'), h('p', null, h('a', { class: 'btn btn-primary btn-sm', href: '/randevu-olustur/' }, 'Randevu Talebi Oluştur'))),
    gecmis.length ? kart('Geçmiş', h('ul', { class: 'liste' }, gecmis.map(satir))) : null,
    h('p', { class: 'hint' }, 'Randevunuza katılamayacaksanız lütfen diyetisyeninize önceden haber verin.'),
  ].filter(Boolean) as Node[];
}

function belgeler(): Node[] {
  const liste = [...veri().belgeler].sort((a, b) => b.tarih - a.tarih);
  return [
    baslik('Belgelerim', 'Diyetisyeninizin size gönderdiği beslenme planları ve vücut analizi raporları.'),
    kart(
      null,
      liste.length
        ? h(
            'ul',
            { class: 'liste' },
            liste.map((b) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('strong', null, b.baslik), h('span', null, ` ${boyut(b.boyut)} · ${tarih(b.tarih)}`)),
                h(
                  'div',
                  { class: 'eylemler' },
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'btn btn-outline btn-xs',
                      onclick: async (e: Event) => {
                        await mesgul(e.currentTarget as HTMLButtonElement, async () => {
                          try {
                            const ham = await api<Uint8Array>('GET', `/takip/${kayit!.kutu}/belge/${b.id}`, undefined, cihazBasligi());
                            const acik = await coz(await aesAnahtari(unb64(kayit!.anahtar)), ham, `${kayit!.kutu}:${b.id}`);
                            indir(new Blob([acik as Uint8Array<ArrayBuffer>], { type: b.tur }), b.ad);
                          } catch {
                            toast('Belge açılamadı. İnternet bağlantınızı kontrol edin.', 'hata');
                          }
                        });
                      },
                    },
                    'İndir',
                  ),
                ),
              ),
            ),
          )
        : bos('Henüz belge yok.'),
    ),
    h('p', { class: 'hint' }, 'Beslenme planlarınız size özeldir; lütfen başkalarıyla paylaşmayın.'),
  ];
}

function mesajlar(): Node[] {
  const liste = [...veri().mesajlar].sort((a, b) => b.tarih - a.tarih);
  const yeni = liste.filter((m) => !kayit!.okunan.includes(m.id)).map((m) => m.id);
  if (yeni.length) {
    kayit!.okunan.push(...yeni);
    void kaydet();
    setTimeout(() => document.querySelector('.panel-menu .rozet')?.remove(), 1200);
  }
  return [
    baslik('Mesajlar'),
    kart(
      null,
      liste.length
        ? h(
            'ul',
            { class: 'liste' },
            liste.map((m) =>
              h(
                'li',
                { class: yeni.includes(m.id) ? 'mesaj okunmadi' : 'mesaj' },
                h('div', { class: 'ana' }, h('strong', null, m.duyuru ? 'Duyuru' : 'Diyetisyeninizden', ` · ${tarihSaat(m.tarih)}`), h('p', { class: 'cok-satir' }, m.metin)),
              ),
            ),
          )
        : bos('Mesaj yok.'),
    ),
    h('p', { class: 'hint' }, 'Bu bölüm yalnızca diyetisyeninizin mesajlarını gösterir. Yanıt vermek veya soru sormak için WhatsApp\'tan yazabilirsiniz. Acil durumlarda 112\'yi arayın.'),
  ];
}

function ayarlar(): Node[] {
  const pinVar = Boolean(pinAnahtari);
  return [
    baslik('Ayarlar'),
    !sunucuAcik
      ? kart(
          'Bilgilerimi Güncelle',
          h('p', null, kayit!.alindi ? `Son güncelleme: ${tarihSaat(kayit!.alindi)}` : ''),
          h(
            'p',
            null,
            'Yeni ölçümlerinizden sonra diyetisyeniniz WhatsApp’tan bir güncelleme bağlantısı gönderir; bağlantıya dokunduğunuzda bilgileriniz burada güncellenir. Bağlantı yalnızca bu telefonda ve bu tarayıcıda çalışır. Siteye her girişinizde menüdeki “Takibim” ile kendi bilgilerinizi görürsünüz.',
          ),
        )
      : kart(
      'Bilgilerimi Yenile',
      h('p', null, kayit!.alindi ? `Son güncelleme: ${tarihSaat(kayit!.alindi)}` : ''),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-outline btn-sm',
          onclick: async (e: Event) => {
            const ok = await mesgul(e.currentTarget as HTMLButtonElement, () => guncelle());
            toast(ok ? 'Bilgileriniz güncellendi.' : 'Güncellenemedi.', ok ? 'tamam' : 'hata');
            ciz();
          },
        },
        'Şimdi Yenile',
      ),
    ),
    kart(
      'Ekran Kilidi (PIN)',
      h('p', null, pinVar ? 'Takibim bu telefonda PIN ile açılıyor.' : 'Telefonunuzu başkaları da kullanıyorsa Takibim\'i 4–6 haneli bir PIN ile kilitleyebilirsiniz.'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-outline btn-sm',
          onclick: async () => {
            if (pinVar) {
              pinAnahtari = null;
              pinTuzu = null;
              await kaydet();
              toast('PIN kaldırıldı.');
              return ciz();
            }
            await pencere({
              baslik: 'PIN Belirle',
              icerik: h(
                'div',
                { class: 'form-grid' },
                alan('PIN (4–6 rakam)', h('input', { class: 'input kod-girisi', type: 'password', name: 'pin', inputmode: 'numeric', maxlength: 6 })),
                alan('PIN (tekrar)', h('input', { class: 'input kod-girisi', type: 'password', name: 'tekrar', inputmode: 'numeric', maxlength: 6 })),
                h('p', { class: 'hint' }, 'PIN\'i unutursanız bu telefondaki bilgiler açılamaz; diyetisyeninizden yeni QR istemeniz gerekir.'),
              ),
              onKaydet: async (form) => {
                const f = formNesnesi(form);
                if (!/^\d{4,6}$/.test(f.pin)) throw new Uyari('PIN 4–6 rakamdan oluşmalıdır.', 'PIN (4–6 rakam)');
                if (f.pin !== f.tekrar) throw new Uyari('PIN\'ler aynı değil.', 'PIN (tekrar)');
                const tuz = rastgele(16);
                pinAnahtari = await parolaAnahtari(f.pin, tuz, PIN_TURU);
                pinTuzu = b64(tuz);
                await kaydet();
                toast('PIN belirlendi.');
              },
            });
            ciz();
          },
        },
        pinVar ? 'PIN\'i Kaldır' : 'PIN Belirle',
      ),
    ),
    kart(
      'Kişisel Verilerim',
      h('p', null, 'Bu telefonda kayıtlı Takibim bilgilerinizi dosya olarak indirebilirsiniz.'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-outline btn-sm',
          onclick: () =>
            indir(
              new Blob([JSON.stringify({ indirme: new Date().toISOString(), takibim: kayit!.onbellek, evdeGirilenOlcumler: kayit!.evdeki }, null, 2)], {
                type: 'application/json',
              }),
              `takibim-verilerim-${bugun()}.json`,
            ),
        },
        'Verilerimi İndir',
      ),
      h(
        'p',
        { class: 'hint' },
        'Haklarınız ve başvuru yolları: ',
        h('a', { href: portalBelgeleri.aydinlatma.yol, target: '_blank', rel: 'noopener' }, 'KVKK Aydınlatma Metni'),
        sunucuAcik ? ' · ' : null,
        sunucuAcik ? h('a', { href: portalBelgeleri.acikRiza.yol, target: '_blank', rel: 'noopener' }, 'Açık Rıza Metni') : null,
        sunucuAcik ? ' · ' : null,
        sunucuAcik ? h('a', { href: portalBelgeleri.kosullar.yol, target: '_blank', rel: 'noopener' }, 'Kullanım Koşulları') : null,
      ),
    ),
    sunucuAcik
      ? null
      : kart(
          'Bilgilerimi Sil',
          h(
            'p',
            null,
            'Takibim bilgileriniz yalnızca bu telefonda saklanır; başka bir yerde kopyası yoktur. Silerseniz, tekrar görmek için diyetisyeninizden yeni QR kodu isteyin. Klinikteki danışmanlık kayıtlarınız bundan etkilenmez.',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-tehlike btn-sm',
              onclick: async () => {
                const ok = await pencere({
                  baslik: 'Bu Telefondaki Bilgileri Sil',
                  tehlikeli: true,
                  kaydet: 'Sil',
                  icerik: h('p', null, 'Takibim bilgileriniz ve evde girdiğiniz ölçümler bu telefondan silinsin mi? Bu işlem geri alınamaz.'),
                });
                if (!ok) return;
                yerelSil();
                ortaKart(h('h1', null, 'Bilgileriniz Silindi'), h('p', null, 'Takibim bilgileriniz bu telefondan silindi.'), h('p', null, h('a', { href: '/' }, 'Ana sayfaya dön')));
              },
            },
            'Bu Telefondaki Bilgileri Sil',
          ),
        ),
    !sunucuAcik
      ? null
      : kart(
      'Takibi Kapat',
      h(
        'p',
        null,
        'Takibim\'i kapatırsanız açık rızanız geri çekilmiş olur: sunucudaki şifreli bilgileriniz ve belgeleriniz silinir, bu telefondaki bilgiler de kaldırılır. Diyetisyeniniz takibi kapattığınızı görür. Klinikteki danışmanlık kayıtlarınız bundan etkilenmez.',
      ),
      h(
        'div',
        { class: 'eylemler' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-tehlike btn-sm',
            onclick: async () => {
              const ok = await pencere({
                baslik: 'Takibimi Kapat',
                tehlikeli: true,
                kaydet: 'Takibimi Kapat',
                icerik: h('p', null, 'Takibiniz kapatılsın ve açık rızanız geri çekilsin mi? Bu işlem geri alınamaz; yeniden kullanmak için diyetisyeninizden yeni QR istemeniz gerekir.'),
                onKaydet: async () => {
                  if (!kayit!.kapali) await api('DELETE', `/takip/${kayit!.kutu}`, undefined, cihazBasligi());
                },
              });
              if (!ok) return;
              yerelSil();
              ortaKart(h('h1', null, 'Takibiniz Kapatıldı'), h('p', null, 'Bilgileriniz sunucudan ve bu telefondan silindi.'), h('p', null, h('a', { href: '/' }, 'Ana sayfaya dön')));
            },
          },
          'Takibimi Kapat',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-outline btn-sm',
            onclick: async () => {
              const ok = await pencere({
                baslik: 'Bu Telefondaki Bilgileri Sil',
                tehlikeli: true,
                kaydet: 'Sil',
                icerik: h('p', null, 'Yalnızca bu telefondaki bilgiler silinir; takibiniz kapanmaz. Tekrar görmek için diyetisyeninizden yeni QR kodu istemeniz gerekir.'),
              });
              if (!ok) return;
              yerelSil();
              tanitimEkrani();
            },
          },
          'Yalnızca Bu Telefondan Sil',
        ),
      ),
    ),
  ].filter(Boolean) as Node[];
}

// ================================================================ Başlangıç

async function baslat() {
  const parca = location.hash;
  if (!sunucuAcik) return qrBaslat(parca);
  const tur = parcaTuru(parca);
  if (tur) {
    // Anahtar adres çubuğunda kalmasın
    history.replaceState(null, '', location.pathname);
    return eslesmeEkrani(parca, tur);
  }
  try {
    localStorage.getItem(ANAHTAR);
  } catch {
    return ortaKart(h('h1', null, 'Takibim'), h('p', null, 'Bu tarayıcıda bilgiler kaydedilemiyor (gizli sekme olabilir). Takibim\'i normal bir sekmede açın.'));
  }
  const s = okuSaklanan();
  if (!s || (!s.acik && !s.kilit)) return tanitimEkrani();
  if (s.kilit) return pinEkrani(s);
  kayit = s.acik!;
  if (!location.hash) history.replaceState(null, '', '#ozet');
  if (kayit.onbellek) uygulama();
  await guncelle();
  uygulama();
}

/** Sunucusuz düzen: kayıt yalnızca bu telefonda; adreste QR / bağlantı varsa işlenir */
async function qrBaslat(parca: string) {
  const tur = qrParcaTuru(parca);
  // Bilgiler adres çubuğunda ve tarayıcı geçmişinde kalmasın
  if (tur) history.replaceState(null, '', location.pathname);
  try {
    localStorage.getItem(ANAHTAR);
  } catch {
    return ortaKart(h('h1', null, 'Takibim'), h('p', null, 'Bu tarayıcıda bilgiler kaydedilemiyor (gizli sekme olabilir). Takibim\'i normal bir sekmede açın.'));
  }
  const s = okuSaklanan();
  if (s?.kilit) return pinEkrani(s, tur ? () => qrIle(parca, tur) : undefined);
  if (s?.acik) kayit = s.acik;
  if (tur) return qrIle(parca, tur);
  if (!kayit) return tanitimEkrani();
  if (!location.hash) history.replaceState(null, '', '#ozet');
  uygulama();
}

// Sayfa açıkken yeni bir QR/bağlantı açılırsa (aynı sekmede) yeniden başlat
addEventListener('hashchange', () => {
  if (sunucuAcik ? parcaTuru(location.hash) : qrParcaTuru(location.hash)) location.reload();
});

void baslat();
