// Diyetisyen (yönetici) paneli — tek sayfa; bölümler adres çubuğundaki #bolum ile açılır

import {
  $,
  alan,
  api,
  ApiError,
  boyut,
  bugun,
  durumBandi,
  formHatasi,
  formNesnesi,
  formTemizle,
  h,
  mesgul,
  para,
  pencere,
  sayi,
  tarih,
  tarihSaat,
  telefonGoster,
  toast,
  turAdi,
  whatsapp,
} from './lib';
import { cizgiGrafik } from './chart';
import { belgeSiniri, hesapDurumlari, olcumAlanlari, paketDurumlari, randevuDurumlari } from '../../data/portal';

const app = $('[data-uygulama]');
let yonetici: { ad: string; eposta: string; mod: string; belgeler: Record<string, { baslik: string; yol: string }> };

const MENU: [string, string][] = [
  ['ozet', 'Özet'],
  ['danisanlar', 'Danışanlar'],
  ['randevular', 'Randevular'],
  ['paketler', 'Paketler'],
  ['duyuru', 'Duyuru ve Mesaj'],
  ['kayitlar', 'Erişim Kayıtları'],
  ['hesap', 'Hesabım'],
];

const ONAY_ADLARI: Record<string, string> = {
  aydinlatma: 'Aydınlatma metni okundu',
  acikRiza: 'Sağlık verileri açık rızası',
  sozlesme: 'Kullanım sözleşmesi',
  veli: 'Veli / vasi onayı',
};

const durumEtiketi = (durum: string, sozluk: Record<string, string>) => h('span', { class: `durum ${durum}` }, sozluk[durum] ?? durum);
const ilkAd = (ad: string) => ad.split(' ')[0];

// ---------------------------------------------------------------- WhatsApp şablonları

const imza = '\nDyt. Eylem Dizman';
const wa = {
  randevuOnay: (ad: string, t: string, s: string, tur: string) =>
    `Merhaba ${ilkAd(ad)}, ${tarih(t, true)} saat ${s} ${turAdi(tur).toLocaleLowerCase('tr')} randevunuz onaylanmıştır.${imza}`,
  hatirlatma: (ad: string, t: string, s: string, tur: string) =>
    `Merhaba ${ilkAd(ad)}, ${tarih(t, true)} saat ${s} ${turAdi(tur).toLocaleLowerCase('tr')} randevunuzu hatırlatmak isteriz. Katılamayacaksanız lütfen önceden haber veriniz.${imza}`,
  odeme: (ad: string, paket: string) => `Merhaba ${ilkAd(ad)}, ${paket} talebiniz alınmıştır. Ödeme bilgileri: ${imza}`,
  sifre: (ad: string, link: string) =>
    `Merhaba ${ilkAd(ad)}, danışan paneli şifrenizi yenilemek için aşağıdaki bağlantıyı kullanabilirsiniz (48 saat geçerlidir, yalnızca bir kez kullanılabilir):\n${link}${imza}`,
  genel: (ad: string) => `Merhaba ${ilkAd(ad)}, `,
};
const waDugme = (telefon: string, metin: string, etiket = 'WhatsApp') =>
  telefon ? h('a', { class: 'btn btn-wa btn-xs', href: whatsapp(telefon, metin), target: '_blank', rel: 'noopener' }, etiket) : null;

// ---------------------------------------------------------------- Başlangıç

async function cikis() {
  await api('POST', '/yonetim/cikis').catch(() => {});
  location.replace('/yonetim/giris/');
}

async function basla() {
  durumBandi();
  try {
    yonetici = await api('GET', '/yonetim/ben');
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 503)) return location.replace('/yonetim/giris/');
    app.replaceChildren(h('p', { class: 'form-hata' }, (e as Error).message));
    return;
  }
  document
    .querySelector('[data-ust-eylemler]')
    ?.replaceChildren(h('span', { class: 'hint' }, yonetici.ad), h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: cikis }, 'Çıkış Yap'));
  window.addEventListener('hashchange', yonlendir);
  yonlendir();
}

let yukleniyor = 0;
async function yonlendir() {
  const [yol] = location.hash.slice(1).split('?');
  const [bolum, id, sekme] = yol.split('/');
  const aktif = MENU.some(([k]) => k === bolum) || bolum === 'danisan' ? bolum : 'ozet';
  const menu = h(
    'nav',
    { class: 'panel-menu', 'aria-label': 'Panel bölümleri' },
    MENU.map(([k, ad]) => h('a', { href: `#${k}`, 'aria-current': k === aktif || (aktif === 'danisan' && k === 'danisanlar') ? 'page' : null }, ad)),
  );
  const icerik = h('div', { class: 'panel-icerik' }, h('p', { class: 'yukleniyor' }, 'Yükleniyor…'));
  app.replaceChildren(h('div', { class: 'panel' }, menu, icerik));
  const sira = ++yukleniyor;
  try {
    let nodes: Node[];
    if (aktif === 'danisan' && id) nodes = await danisanDetay(id, sekme || 'genel');
    else if (aktif === 'danisanlar') nodes = await danisanlarBolumu();
    else if (aktif === 'randevular') nodes = await randevularBolumu();
    else if (aktif === 'paketler') nodes = await paketlerBolumu();
    else if (aktif === 'duyuru') nodes = await duyuruBolumu();
    else if (aktif === 'kayitlar') nodes = await kayitlarBolumu();
    else if (aktif === 'hesap') nodes = hesapBolumu();
    else nodes = await ozetBolumu();
    if (sira === yukleniyor) icerik.replaceChildren(...nodes);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return location.replace('/yonetim/giris/');
    icerik.replaceChildren(h('p', { class: 'form-hata' }, (e as Error).message));
  }
}

const yenile = () => yonlendir();

const baslik = (b: string, alt?: string, ...eylem: (Node | null)[]) =>
  h('div', { class: 'bolum-baslik' }, h('div', null, h('h1', null, b), alt ? h('p', null, alt) : null), h('div', { class: 'eylemler' }, eylem));

const kart = (b: string | null, ...icerik: (Node | null | false)[]) => h('div', { class: 'kart' }, b ? h('h2', null, b) : null, ...icerik);

// ============================================================== Özet

async function ozetBolumu(): Promise<Node[]> {
  const o = await api<any>('GET', '/yonetim/ozet');
  const tile = (etiket: string, deger: number, href?: string) =>
    h('a', { class: 'kart gosterge', href: href ?? null, style: 'text-decoration:none;color:inherit' }, h('span', { class: 'etiket' }, etiket), h('span', { class: 'deger' }, String(deger)));

  const bekleyen = o.randevular.filter((r: any) => r.durum === 'talep');
  const yaklasan = o.randevular.filter((r: any) => r.durum === 'onaylandi');

  return [
    baslik('Özet', `Bugün: ${tarih(o.bugun, true)}`),
    h(
      'div',
      { class: 'izgara' },
      tile('Danışan', o.sayilar.danisan, '#danisanlar'),
      tile('Aktif Paket', o.sayilar.aktifPaket),
      tile('Onay Bekleyen Randevu', o.sayilar.bekleyenRandevu, '#randevular'),
      tile('Bekleyen Paket Talebi', o.sayilar.bekleyenPaket),
    ),
    kart(
      'Onay Bekleyen Randevu Talepleri',
      bekleyen.length ? h('ul', { class: 'liste' }, bekleyen.map((r: any) => randevuSatiri(r, true))) : h('p', { class: 'bos' }, 'Bekleyen talep yok.'),
    ),
    kart(
      'Yaklaşan Randevular (7 Gün)',
      h('p', { class: 'hint' }, 'Yarınki randevular için danışanın panelinde otomatik hatırlatma oluşur; WhatsApp ile de hatırlatabilirsiniz.'),
      yaklasan.length ? h('ul', { class: 'liste' }, yaklasan.map((r: any) => randevuSatiri(r, true))) : h('p', { class: 'bos' }, 'Yaklaşan randevu yok.'),
    ),
    kart(
      'Paket Talepleri',
      o.paketTalepleri.length
        ? h(
            'ul',
            { class: 'liste' },
            o.paketTalepleri.map((p: any) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('a', { href: `#danisan/${p.danisanId}/paketler` }, h('strong', null, p.ad)), h('span', null, `${p.paket} · ${tarihSaat(p.tarih)}${p.fiyat !== null ? ` · ${para(p.fiyat)}` : ''}`)),
                h(
                  'div',
                  { class: 'eylemler' },
                  durumEtiketi(p.durum, paketDurumlari),
                  waDugme(p.telefon, wa.odeme(p.ad, p.paket), 'Ödeme Bilgisi Gönder'),
                  h('a', { class: 'btn btn-outline btn-xs', href: `#danisan/${p.danisanId}/paketler` }, 'Düzenle'),
                ),
              ),
            ),
          )
        : h('p', { class: 'bos' }, 'Bekleyen paket talebi yok.'),
    ),
    o.bitenPaketler.length
      ? kart(
          'Süresi Dolacak Paketler (7 Gün)',
          h(
            'ul',
            { class: 'liste' },
            o.bitenPaketler.map((p: any) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('a', { href: `#danisan/${p.danisanId}/paketler` }, h('strong', null, p.ad)), h('span', null, `${p.paket} · bitiş ${tarih(p.bitis)}`)),
                waDugme(p.telefon, `${wa.genel(p.ad)}${p.paket} paketinizin süresi ${tarih(p.bitis)} tarihinde doluyor.${imza}`),
              ),
            ),
          ),
        )
      : null,
    o.talepler.length
      ? kart(
          'KVKK Talepleri',
          h('p', { class: 'hint' }, 'Silme talepleri ve açık rızasını geri çekenler. Talebi değerlendirip danışan dosyasından hesabı silebilirsiniz.'),
          h(
            'ul',
            { class: 'liste' },
            o.talepler.map((t: any) =>
              h('li', null, h('div', { class: 'ana' }, h('a', { href: `#danisan/${t.id}/genel` }, h('strong', null, t.ad))), durumEtiketi(t.durum, hesapDurumlari)),
            ),
          ),
        )
      : null,
  ].filter(Boolean) as Node[];
}

function randevuSatiri(r: any, danisanBaglantisi: boolean) {
  const guncelle = async (durum: string) => {
    try {
      await api('PUT', `/yonetim/randevu/${r.id}`, { durum });
      toast(`Randevu: ${randevuDurumlari[durum as keyof typeof randevuDurumlari]}`);
      if (durum === 'onaylandi' && r.telefon)
        await pencere({
          baslik: 'Danışana Bildirin',
          kaydet: 'Kapat',
          icerik: h(
            'div',
            { class: 'form-grid' },
            h('p', null, 'Randevu onaylandı ve danışanın panelinde görünüyor. İsterseniz WhatsApp ile de bildirin:'),
            waDugme(r.telefon, wa.randevuOnay(r.ad, r.tarih, r.saat, r.tur), 'WhatsApp ile Onay Mesajı Gönder'),
          ),
        });
      yenile();
    } catch (e) {
      toast((e as Error).message, 'hata');
    }
  };
  return h(
    'li',
    null,
    h(
      'div',
      { class: 'ana' },
      danisanBaglantisi ? h('a', { href: `#danisan/${r.danisanId}/randevular` }, h('strong', null, r.ad)) : h('strong', null, `${tarih(r.tarih, true)} · ${r.saat}`),
      h('span', null, danisanBaglantisi ? `${tarih(r.tarih, true)} · ${r.saat} · ${turAdi(r.tur)}` : turAdi(r.tur)),
      r.not ? h('p', null, r.not) : null,
    ),
    h(
      'div',
      { class: 'eylemler' },
      durumEtiketi(r.durum, randevuDurumlari),
      r.durum === 'talep' ? h('button', { type: 'button', class: 'btn btn-sage btn-xs', onclick: () => guncelle('onaylandi') }, 'Onayla') : null,
      r.durum === 'onaylandi' && r.tarih <= bugun() ? h('button', { type: 'button', class: 'btn btn-outline btn-xs', onclick: () => guncelle('tamamlandi') }, 'Tamamlandı') : null,
      r.durum === 'onaylandi' ? waDugme(r.telefon, wa.hatirlatma(r.ad, r.tarih, r.saat, r.tur), 'Hatırlat') : null,
      r.durum === 'talep' || r.durum === 'onaylandi' ? h('button', { type: 'button', class: 'metin-dugme', onclick: () => guncelle('iptal') }, 'İptal') : null,
    ),
  );
}

// ============================================================== Danışanlar

async function danisanlarBolumu(): Promise<Node[]> {
  const { danisanlar } = await api<any>('GET', '/yonetim/danisanlar');
  const arama = h('input', { class: 'input arama', type: 'search', placeholder: 'Ad, e-posta veya telefon ara', 'aria-label': 'Danışan ara' });
  const govde = h('tbody');
  const doldur = () => {
    const q = arama.value.trim().toLocaleLowerCase('tr');
    const qd = q.replace(/\D/g, '');
    const liste = danisanlar.filter((d: any) => !q || d.ad.toLocaleLowerCase('tr').includes(q) || d.eposta.includes(q) || (qd && d.telefon.includes(qd)));
    govde.replaceChildren(
      ...liste.map((d: any) =>
        h(
          'tr',
          { class: 'tiklanir', tabindex: '0', onclick: () => (location.hash = `danisan/${d.id}/genel`), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && (location.hash = `danisan/${d.id}/genel`) },
          h('td', null, h('strong', null, d.ad), h('div', { class: 'hint' }, d.eposta)),
          h('td', null, telefonGoster(d.telefon)),
          h('td', null, d.paket ? [d.paket, ' ', durumEtiketi(d.paketDurum, paketDurumlari)] : '—'),
          h('td', null, d.sonOlcum ? tarih(d.sonOlcum) : '—'),
          h('td', null, d.sonrakiRandevu ? `${tarih(d.sonrakiRandevu.slice(0, 10))} ${d.sonrakiRandevu.slice(11)}` : '—'),
          h('td', null, durumEtiketi(d.durum, hesapDurumlari)),
        ),
      ),
    );
    if (!liste.length) govde.append(h('tr', null, h('td', { colspan: '6', class: 'bos' }, q ? 'Aramaya uygun danışan yok.' : 'Henüz kayıtlı danışan yok.')));
  };
  arama.addEventListener('input', doldur);
  doldur();
  return [
    baslik('Danışanlar', `${danisanlar.length} kayıtlı danışan. Danışanlar siteden kendileri üye olur.`, arama),
    kart(
      null,
      h(
        'div',
        { class: 'tablo-kap' },
        h(
          'table',
          { class: 'tablo' },
          h('thead', null, h('tr', null, h('th', null, 'Danışan'), h('th', null, 'Telefon'), h('th', null, 'Paket'), h('th', null, 'Son Ölçüm'), h('th', null, 'Sonraki Randevu'), h('th', null, 'Hesap'))),
          govde,
        ),
      ),
    ),
  ];
}

// ---------------------------------------------------------------- Danışan dosyası

const SEKMELER: [string, string][] = [
  ['genel', 'Genel'],
  ['profil', 'Profil ve Sağlık'],
  ['olcumler', 'Ölçümler'],
  ['paketler', 'Paketler'],
  ['randevular', 'Randevular'],
  ['belgeler', 'Belgeler'],
  ['mesajlar', 'Mesajlar'],
  ['notlar', 'Notlarım'],
  ['kayitlar', 'Erişim Kayıtları'],
];

let detayOnbellek: { id: string; zaman: number; veri: any } | null = null;

async function danisanVerisi(id: string, zorla = false) {
  if (!zorla && detayOnbellek?.id === id && Date.now() - detayOnbellek.zaman < 60_000) return detayOnbellek.veri;
  const veri = await api<any>('GET', `/yonetim/danisan/${id}`);
  detayOnbellek = { id, zaman: Date.now(), veri };
  return veri;
}

const yenileDetay = () => {
  detayOnbellek = null;
  yenile();
};

async function danisanDetay(id: string, sekme: string): Promise<Node[]> {
  const v = await danisanVerisi(id);
  const d = v.danisan;
  const sekmeler = h(
    'ul',
    { class: 'sekme-cubugu' },
    SEKMELER.map(([k, ad]) => h('li', null, h('a', { href: `#danisan/${id}/${k}`, 'aria-current': k === sekme ? 'page' : null }, ad))),
  );
  const alerji = [v.profil?.saglik?.alerjiler, v.profil?.saglik?.intoleranslar].filter(Boolean).join(' · ');
  const govde: Record<string, () => Node[] | Promise<Node[]>> = {
    genel: () => genelSekme(v),
    profil: () => profilSekme(v),
    olcumler: () => olcumSekme(v),
    paketler: () => paketSekme(v),
    randevular: () => randevuSekme(v),
    belgeler: () => belgeSekme(v),
    mesajlar: () => mesajSekme(v),
    notlar: () => notSekme(v),
    kayitlar: () => kayitSekme(v),
  };
  return [
    h('a', { href: '#danisanlar', class: 'geri-baglanti' }, '← Danışanlar'),
    baslik(
      d.ad,
      `${telefonGoster(d.telefon)} · ${d.eposta}`,
      durumEtiketi(d.durum, hesapDurumlari),
      waDugme(d.telefon, wa.genel(d.ad), 'WhatsApp’tan Yaz'),
    ),
    alerji ? h('p', { class: 'bilgi-kutu uyari' }, h('span', null, h('strong', null, 'Alerji / intolerans: '), alerji)) : null,
    sekmeler,
    ...(await (govde[sekme] ?? govde.genel)()),
  ].filter(Boolean) as Node[];
}

function genelSekme(v: any): Node[] {
  const d = v.danisan;
  const durumDugme = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-outline btn-sm',
      onclick: async () => {
        const yeni = d.durum === 'pasif' ? 'aktif' : 'pasif';
        await api('PUT', `/yonetim/danisan/${d.id}/durum`, { durum: yeni }).catch((e) => toast(e.message, 'hata'));
        toast(yeni === 'pasif' ? 'Hesap pasif yapıldı; danışan giriş yapamaz.' : 'Hesap aktif.');
        yenileDetay();
      },
    },
    d.durum === 'pasif' ? 'Hesabı Aktif Et' : 'Hesabı Pasif Yap',
  );
  const sifreDugme = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-outline btn-sm',
      onclick: async () => {
        try {
          const r = await api<{ baglanti: string }>('POST', `/yonetim/danisan/${d.id}/sifre-baglantisi`);
          await pencere({
            baslik: 'Şifre Yenileme Bağlantısı',
            kaydet: 'Kapat',
            icerik: h(
              'div',
              { class: 'form-grid' },
              h('p', null, 'Bağlantı 48 saat geçerlidir ve bir kez kullanılabilir. Yalnızca danışanın kendi telefonuna gönderin.'),
              h('p', { class: 'kod-kutu' }, r.baglanti),
              waDugme(d.telefon, wa.sifre(d.ad, r.baglanti), 'WhatsApp ile Gönder'),
            ),
          });
        } catch (e) {
          toast((e as Error).message, 'hata');
        }
      },
    },
    'Şifre Yenileme Bağlantısı',
  );
  const silDugme = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-tehlike btn-sm',
      onclick: async () => {
        const ok = await pencere({
          baslik: 'Hesabı ve Verileri Sil',
          kaydet: 'Kalıcı Olarak Sil',
          tehlikeli: true,
          icerik: h(
            'div',
            { class: 'form-grid' },
            h('p', null, `${d.ad} adlı danışanın hesabı, profili, ölçümleri, belgeleri, randevu ve paket kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Yasal olarak saklamanız gereken kayıtlar varsa önce ayrıca arşivleyin.`),
            alan('Onaylamak için SİL yazın', h('input', { class: 'input', name: 'onay', autocomplete: 'off' })),
          ),
          onKaydet: async (form) => {
            await api('POST', `/yonetim/danisan/${d.id}/sil`, formNesnesi(form));
          },
        });
        if (ok) {
          toast('Hesap ve veriler silindi.');
          detayOnbellek = null;
          location.hash = 'danisanlar';
        }
      },
    },
    'Hesabı ve Verileri Sil',
  );
  const bil = (k: string, val: Node | string) => [h('dt', null, k), h('dd', null, val)];
  return [
    kart(
      'Hesap',
      h(
        'dl',
        { class: 'sabit-bilgi' },
        bil('Ad Soyad', d.ad),
        bil('E-posta', d.eposta),
        bil('Telefon', telefonGoster(d.telefon)),
        bil('Kayıt', tarihSaat(d.kayit)),
        bil('Son giriş', d.sonGiris ? tarihSaat(d.sonGiris) : '—'),
        bil('Durum', durumEtiketi(d.durum, hesapDurumlari)),
        !d.resit ? bil('Yaş', '18 yaşından küçük (veli onaylı)') : null,
      ),
      h('div', { class: 'eylemler', style: 'margin-top:14px' }, sifreDugme, durumDugme),
    ),
    kart(
      'KVKK Onay Kayıtları',
      v.eksikOnaylar.length ? h('p', { class: 'bilgi-kutu uyari' }, `Eksik/güncel olmayan onay: ${v.eksikOnaylar.map((t: string) => ONAY_ADLARI[t] ?? t).join(', ')}. Danışan girişte yeniden onay verene kadar panel verileri ona kapalıdır.`) : null,
      h(
        'div',
        { class: 'tablo-kap' },
        h(
          'table',
          { class: 'tablo' },
          h('thead', null, h('tr', null, h('th', null, 'Onay'), h('th', null, 'Metin Sürümü'), h('th', null, 'Tarih'), h('th', null, 'Geri Çekme'))),
          h('tbody', null, v.onaylar.map((o: any) => h('tr', null, h('td', null, ONAY_ADLARI[o.tur] ?? o.tur), h('td', null, o.surum), h('td', null, tarihSaat(o.tarih)), h('td', null, o.geriCekme ? tarihSaat(o.geriCekme) : '—')))),
        ),
      ),
    ),
    kart(
      'Hesabı Silme',
      h('p', null, d.durum === 'silme_talebi' ? 'Danışan hesabının silinmesini talep etti.' : 'Danışanın talebi veya açık rızasını geri çekmesi hâlinde hesabı ve paneldeki verilerini silebilirsiniz.'),
      silDugme,
    ),
  ];
}

function profilSekme(v: any): Node[] {
  const p = v.profil ?? {};
  const s = p.saglik ?? {};
  const satir = (k: string, val: any) => (val === null || val === undefined || val === '' || (Array.isArray(val) && !val.length) ? null : [h('dt', null, k), h('dd', null, Array.isArray(val) ? val.join(', ') : String(val))]);
  const kiloSon = [...v.olcumler].reverse().find((m: any) => m.degerler.kilo)?.degerler.kilo;
  const vki = kiloSon && p.boy ? kiloSon / (p.boy / 100) ** 2 : null;
  return [
    kart(
      'Kişisel Bilgiler',
      h(
        'dl',
        { class: 'sabit-bilgi' },
        satir('Doğum tarihi', p.dogumTarihi ? tarih(p.dogumTarihi) : ''),
        satir('Cinsiyet', p.cinsiyet),
        satir('Şehir', p.sehir),
        satir('Meslek', p.meslek),
        satir('Bizi nereden duydu', p.kaynak),
        p.veli ? satir('Veli / vasi', `${p.veli.ad} · ${telefonGoster(p.veli.telefon)}`) : null,
      ),
    ),
    kart(
      'Hedef ve Ölçüler',
      h(
        'dl',
        { class: 'sabit-bilgi' },
        satir('Boy', p.boy ? `${sayi(p.boy)} cm` : ''),
        satir('Son kilo', kiloSon ? `${sayi(kiloSon)} kg` : ''),
        satir('VKİ (son kilo)', vki ? sayi(vki) : ''),
        satir('Hedef kilo', p.hedefKilo ? `${sayi(p.hedefKilo)} kg` : ''),
        satir('Hedef', p.hedef),
        satir('Hareket düzeyi', p.aktivite),
      ),
    ),
    kart(
      'Sağlık Bilgileri',
      h(
        'dl',
        { class: 'sabit-bilgi' },
        satir('Hastalıklar', s.hastaliklar),
        satir('Diğer hastalıklar', s.digerHastalik),
        satir('İlaç ve takviyeler', s.ilaclar),
        satir('Besin alerjileri', s.alerjiler),
        satir('Besin intoleransları', s.intoleranslar),
        satir('Gebelik / emzirme', s.gebelik !== 'Yok' ? s.gebelik : ''),
        satir('Geçirilmiş ameliyatlar', s.ameliyatlar),
        satir('Danışanın notu', s.notlar),
      ),
      h('p', { class: 'hint' }, 'Bu bilgileri danışan kendi panelinden günceller.'),
    ),
  ];
}

function olcumFormu(mevcut?: any) {
  const d = mevcut?.degerler ?? {};
  return h(
    'div',
    { class: 'form-grid' },
    alan('Tarih', h('input', { class: 'input', type: 'date', name: 'tarih', value: mevcut?.tarih ?? bugun(), max: bugun(), 'data-alan': 'Tarih' })),
    h(
      'div',
      { class: 'form-grid uc' },
      olcumAlanlari.map((f) => alan(`${f.label}${f.unit ? ` (${f.unit})` : ''}`, h('input', { class: 'input', name: `degerler.${f.key}`, inputmode: 'decimal', value: d[f.key] ?? '', 'data-alan': f.label }))),
    ),
    h('p', { class: 'hint' }, 'Boş bıraktığınız alanlar kaydedilmez. Yağ kütlesi boşsa kilo ve yağ oranından hesaplanarak gösterilir.'),
  );
}

function olcumSekme(v: any): Node[] {
  const d = v.danisan;
  const olcumler = v.olcumler as any[];
  const deger = (m: any, key: string) => (m.degerler[key] ?? (key === 'yagKg' && m.degerler.kilo && m.degerler.yagOrani ? Math.round(m.degerler.kilo * m.degerler.yagOrani) / 100 : null));
  const seri = (key: string) => {
    const map = new Map<string, { x: string; y: number }>();
    for (const m of olcumler) {
      const val = deger(m, key);
      if (val !== null) map.set(m.tarih, { x: m.tarih, y: val });
    }
    return [...map.values()].sort((a, b) => a.x.localeCompare(b.x));
  };
  const kullanilan = olcumAlanlari.filter((f) => olcumler.some((m) => deger(m, f.key) !== null));
  const ekle = async () => {
    const ok = await pencere({
      baslik: 'Klinik Ölçümü Ekle',
      icerik: olcumFormu(),
      onKaydet: async (form) => {
        await api('POST', `/yonetim/danisan/${d.id}/olcum`, formNesnesi(form));
      },
    });
    if (ok) {
      toast('Ölçüm eklendi; danışanın panelinde görünüyor.');
      yenileDetay();
    }
  };
  const grafikler = ['kilo', 'yagKg', 'kasKg']
    .map((k) => ({ k, s: seri(k), f: olcumAlanlari.find((f) => f.key === k)! }))
    .filter((x) => x.s.length)
    .map((x) => kart(null, cizgiGrafik({ baslik: x.f.label, birim: x.f.unit, noktalar: x.s, hedef: x.k === 'kilo' ? v.profil?.hedefKilo : null })));
  return [
    h('div', { class: 'eylemler', style: 'margin-bottom:14px' }, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: ekle }, 'Klinik Ölçümü Ekle')),
    grafikler.length ? h('div', { class: 'izgara', style: 'grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))' }, grafikler) : null,
    kart(
      'Ölçüm Geçmişi',
      olcumler.length
        ? h(
            'div',
            { class: 'tablo-kap' },
            h(
              'table',
              { class: 'tablo' },
              h('thead', null, h('tr', null, h('th', null, 'Tarih'), kullanilan.map((f) => h('th', { class: 'sayi' }, `${f.label}${f.unit ? ` (${f.unit})` : ''}`)), h('th', null, 'Kaynak'), h('th', null, ''))),
              h(
                'tbody',
                null,
                [...olcumler].reverse().map((m) =>
                  h(
                    'tr',
                    null,
                    h('td', null, tarih(m.tarih)),
                    kullanilan.map((f) => h('td', { class: 'sayi' }, sayi(deger(m, f.key)))),
                    h('td', null, m.kaynak === 'klinik' ? 'Klinik' : m.kaynak === 'kayit' ? 'Kayıt' : 'Danışan'),
                    h(
                      'td',
                      null,
                      h(
                        'div',
                        { class: 'eylemler' },
                        h(
                          'button',
                          {
                            type: 'button',
                            class: 'metin-dugme',
                            onclick: async () => {
                              const ok = await pencere({
                                baslik: 'Ölçümü Düzenle',
                                icerik: olcumFormu(m),
                                onKaydet: async (form) => {
                                  await api('PUT', `/yonetim/olcum/${m.id}`, formNesnesi(form));
                                },
                              });
                              if (ok) yenileDetay();
                            },
                          },
                          'Düzenle',
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            class: 'metin-dugme',
                            onclick: async () => {
                              const ok = await pencere({
                                baslik: 'Ölçümü Sil',
                                icerik: h('p', null, `${tarih(m.tarih)} tarihli ölçüm silinsin mi?`),
                                kaydet: 'Sil',
                                tehlikeli: true,
                                onKaydet: async () => {
                                  await api('DELETE', `/yonetim/olcum/${m.id}`);
                                },
                              });
                              if (ok) yenileDetay();
                            },
                          },
                          'Sil',
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'bos' }, 'Henüz ölçüm yok.'),
    ),
  ].filter(Boolean) as Node[];
}

function abonelikFormu(paketler: any[] | null, mevcut?: any) {
  return h(
    'div',
    { class: 'form-grid' },
    paketler
      ? alan('Paket', h('select', { class: 'select', name: 'paketId', 'data-alan': 'Paket' }, paketler.map((p) => h('option', { value: p.id }, `${p.ad}${p.aktif ? '' : ' (pasif)'}`))))
      : null,
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Durum', h('select', { class: 'select', name: 'durum', 'data-alan': 'Durum' }, Object.entries(paketDurumlari).map(([k, ad]) => h('option', { value: k, selected: (mevcut?.durum ?? 'aktif') === k ? true : null }, ad)))),
      alan('Tutar (TL)', h('input', { class: 'input', name: 'fiyat', inputmode: 'decimal', value: mevcut?.fiyat ?? '', 'data-alan': 'Tutar' })),
      alan('Başlangıç', h('input', { class: 'input', type: 'date', name: 'baslangic', value: mevcut?.baslangic ?? bugun(), 'data-alan': 'Başlangıç' })),
      alan('Bitiş', h('input', { class: 'input', type: 'date', name: 'bitis', value: mevcut?.bitis ?? '', 'data-alan': 'Bitiş' })),
    ),
    alan('Ödeme Notu (danışan görür)', h('input', { class: 'input', name: 'odemeNotu', maxlength: 300, value: mevcut?.odemeNotu ?? '', placeholder: 'Örn. Ödeme alındı (havale, 3 Ekim)', 'data-alan': 'Ödeme notu' })),
  );
}

function paketSekme(v: any): Node[] {
  const d = v.danisan;
  const tanimla = async () => {
    if (!v.paketler.length) return toast('Önce Paketler bölümünden paket tanımlayın.', 'hata');
    const ok = await pencere({
      baslik: 'Paket Tanımla',
      icerik: abonelikFormu(v.paketler),
      onKaydet: async (form) => {
        await api('POST', `/yonetim/danisan/${d.id}/abonelik`, formNesnesi(form));
      },
    });
    if (ok) yenileDetay();
  };
  return [
    h('div', { class: 'eylemler', style: 'margin-bottom:14px' }, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: tanimla }, 'Paket Tanımla')),
    kart(
      'Paketler ve Talepler',
      v.abonelikler.length
        ? h(
            'ul',
            { class: 'liste' },
            v.abonelikler.map((a: any) =>
              h(
                'li',
                null,
                h(
                  'div',
                  { class: 'ana' },
                  h('strong', null, a.paketAdi),
                  h('span', null, a.baslangic ? `${tarih(a.baslangic)}${a.bitis ? ` – ${tarih(a.bitis)}` : ''}` : `Talep: ${tarihSaat(a.tarih)}`, a.fiyat !== null ? ` · ${para(a.fiyat)}` : ''),
                  a.not ? h('p', null, `Danışanın notu: ${a.not}`) : null,
                  a.odemeNotu ? h('p', null, `Ödeme notu: ${a.odemeNotu}`) : null,
                ),
                h(
                  'div',
                  { class: 'eylemler' },
                  durumEtiketi(a.durum, paketDurumlari),
                  a.durum === 'talep' || a.durum === 'odeme' ? waDugme(d.telefon, wa.odeme(d.ad, a.paketAdi), 'Ödeme Bilgisi Gönder') : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'btn btn-outline btn-xs',
                      onclick: async () => {
                        const ok = await pencere({
                          baslik: a.paketAdi,
                          icerik: abonelikFormu(null, a),
                          onKaydet: async (form) => {
                            await api('PUT', `/yonetim/abonelik/${a.id}`, formNesnesi(form));
                          },
                        });
                        if (ok) yenileDetay();
                      },
                    },
                    'Düzenle',
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'bos' }, 'Paket kaydı yok.'),
    ),
  ];
}

function randevuSekme(v: any): Node[] {
  const d = v.danisan;
  const ekle = async () => {
    const ok = await pencere({
      baslik: 'Randevu Ekle',
      icerik: h(
        'div',
        { class: 'form-grid' },
        h(
          'div',
          { class: 'form-grid iki' },
          alan('Tarih', h('input', { class: 'input', type: 'date', name: 'tarih', value: bugun(), 'data-alan': 'Tarih' })),
          alan('Saat', h('input', { class: 'input', type: 'time', name: 'saat', value: '10:00', 'data-alan': 'Saat' })),
        ),
        alan('Görüşme Türü', h('select', { class: 'select', name: 'tur', 'data-alan': 'Görüşme türü' }, h('option', { value: 'yuz-yuze' }, 'Yüz yüze'), h('option', { value: 'online' }, 'Online'))),
        alan('Not (danışan görür)', h('textarea', { class: 'textarea', name: 'not', maxlength: 500, 'data-alan': 'Not' })),
      ),
      onKaydet: async (form) => {
        await api('POST', `/yonetim/danisan/${d.id}/randevu`, formNesnesi(form));
      },
    });
    if (ok) {
      toast('Randevu eklendi (onaylı).');
      yenileDetay();
    }
  };
  const liste = v.randevular.map((r: any) => ({ ...r, ad: d.ad, telefon: d.telefon, danisanId: d.id }));
  return [
    h('div', { class: 'eylemler', style: 'margin-bottom:14px' }, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: ekle }, 'Randevu Ekle')),
    kart('Randevular', liste.length ? h('ul', { class: 'liste' }, liste.map((r: any) => randevuSatiri(r, false))) : h('p', { class: 'bos' }, 'Randevu yok.')),
  ];
}

function belgeSekme(v: any): Node[] {
  const d = v.danisan;
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Belge Adı', h('input', { class: 'input', name: 'baslik', maxlength: 120, placeholder: 'Örn. Beslenme Planı – 1. Hafta', 'data-alan': 'Belge adı' })),
      alan('Dosya (PDF, JPG, PNG, WEBP · en fazla 10 MB)', h('input', { class: 'input', type: 'file', name: 'dosya', accept: Object.keys(belgeSiniri.turler).join(',') })),
    ),
    h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'gorunur', value: 'true', checked: true }), h('span', null, 'Danışan bu belgeyi panelinde görebilsin')),
    h('div', null, h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Yükle')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    const fd = new FormData(form);
    if (!fd.get('gorunur')) fd.set('gorunur', 'false');
    const dosya = fd.get('dosya') as File | null;
    if (!dosya || !dosya.size) return formHatasi(form, new ApiError(400, 'Bir dosya seçin.'));
    if (dosya.size > belgeSiniri.enFazlaBayt) return formHatasi(form, new ApiError(400, 'Dosya en fazla 10 MB olabilir.'));
    mesgul(form.querySelector('button[type=submit]'), async () => {
      try {
        await api('POST', `/yonetim/danisan/${d.id}/belge`, fd);
        toast('Belge yüklendi.');
        yenileDetay();
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  return [
    kart('Belge Yükle', form),
    kart(
      'Belgeler',
      v.belgeler.length
        ? h(
            'ul',
            { class: 'liste' },
            v.belgeler.map((b: any) =>
              h(
                'li',
                null,
                h('div', { class: 'ana' }, h('strong', null, b.baslik), h('span', null, `${tarihSaat(b.tarih)} · ${b.tur} · ${boyut(b.boyut)} · ${b.yukleyen === 'danisan' ? 'Danışan yükledi' : 'Siz yüklediniz'} · ${b.gorunur ? 'Danışana açık' : 'Danışana gizli'}`)),
                h(
                  'div',
                  { class: 'eylemler' },
                  h('a', { class: 'btn btn-outline btn-xs', href: `/api/portal/yonetim/belge/${b.id}`, target: '_blank', rel: 'noopener' }, 'Aç'),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'metin-dugme',
                      onclick: async () => {
                        await api('PUT', `/yonetim/belge/${b.id}`, { baslik: b.baslik, gorunur: !b.gorunur }).catch((e) => toast(e.message, 'hata'));
                        yenileDetay();
                      },
                    },
                    b.gorunur ? 'Danışandan Gizle' : 'Danışana Göster',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'metin-dugme',
                      onclick: async () => {
                        const ok = await pencere({
                          baslik: 'Belgeyi Sil',
                          icerik: h('p', null, `“${b.baslik}” kalıcı olarak silinsin mi?`),
                          kaydet: 'Sil',
                          tehlikeli: true,
                          onKaydet: async () => {
                            await api('DELETE', `/yonetim/belge/${b.id}`);
                          },
                        });
                        if (ok) yenileDetay();
                      },
                    },
                    'Sil',
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'bos' }, 'Belge yok.'),
    ),
  ];
}

function mesajSekme(v: any): Node[] {
  const d = v.danisan;
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    alan('Başlık', h('input', { class: 'input', name: 'baslik', maxlength: 120, 'data-alan': 'Başlık' })),
    alan('Mesaj', h('textarea', { class: 'textarea', name: 'metin', maxlength: 3000, 'data-alan': 'Mesaj' })),
    h('div', { class: 'eylemler' }, h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Panelde Gönder')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    mesgul(form.querySelector('button[type=submit]'), async () => {
      try {
        const veri = formNesnesi(form);
        await api('POST', `/yonetim/danisan/${d.id}/mesaj`, veri);
        toast('Mesaj danışanın paneline gönderildi.');
        yenileDetay();
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  return [
    kart('Yeni Mesaj', h('p', { class: 'hint' }, 'Mesaj danışanın panelinde görünür. Danışanı ayrıca WhatsApp’tan bilgilendirebilirsiniz.'), form),
    kart(
      'Gönderilen Mesajlar',
      v.mesajlar.length
        ? h(
            'ul',
            { class: 'liste' },
            v.mesajlar.map((m: any) =>
              h('li', { class: 'mesaj' }, h('div', { class: 'ana' }, h('strong', null, m.baslik), h('span', null, `${tarihSaat(m.tarih)} · ${m.tur === 'hatirlatma' ? 'Otomatik hatırlatma' : 'Mesaj'} · ${m.okundu ? 'Okundu' : 'Okunmadı'}`), h('p', null, m.metin))),
            ),
          )
        : h('p', { class: 'bos' }, 'Mesaj yok. (Tüm danışanlara giden duyurular Duyuru bölümündedir.)'),
    ),
  ];
}

function notSekme(v: any): Node[] {
  const d = v.danisan;
  const alanEl = h('textarea', { class: 'textarea', name: 'not', maxlength: 8000, style: 'min-height:280px', 'data-alan': 'Not' }, v.not ?? '');
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h('p', { class: 'hint' }, `Bu notları yalnızca siz görürsünüz; şifrelenerek saklanır.${v.notTarihi ? ` Son güncelleme: ${tarihSaat(v.notTarihi)}` : ''}`),
    alanEl,
    h('div', null, h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Kaydet')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    mesgul(form.querySelector('button'), async () => {
      try {
        await api('PUT', `/yonetim/danisan/${d.id}/not`, { not: alanEl.value });
        toast('Not kaydedildi.');
        detayOnbellek = null;
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  return [kart('Diyetisyen Notları', form)];
}

async function kayitSekme(v: any): Promise<Node[]> {
  const r = await api<any>('GET', `/yonetim/kayitlar?danisan=${v.danisan.id}`);
  return [kart('Bu Danışanla İlgili Erişim Kayıtları', kayitTablosu(r.kayitlar))];
}

function kayitTablosu(kayitlar: any[]) {
  if (!kayitlar.length) return h('p', { class: 'bos' }, 'Kayıt yok.');
  return h(
    'div',
    { class: 'tablo-kap' },
    h(
      'table',
      { class: 'tablo' },
      h('thead', null, h('tr', null, h('th', null, 'Tarih'), h('th', null, 'İşlem'), h('th', null, 'Yapan'), h('th', null, 'İlgili Danışan'), h('th', null, 'IP'))),
      h(
        'tbody',
        null,
        kayitlar.map((k) =>
          h(
            'tr',
            null,
            h('td', null, tarihSaat(k.tarih)),
            h('td', null, k.islem),
            h('td', null, `${k.kim}${k.rol === 'yonetici' ? ' (diyetisyen)' : ''}`),
            h('td', null, k.hedefId && k.hedef !== '(silinmiş hesap)' ? h('a', { href: `#danisan/${k.hedefId}/genel` }, k.hedef) : k.hedef),
            h('td', null, k.ip),
          ),
        ),
      ),
    ),
  );
}

// ============================================================== Randevular

async function randevularBolumu(): Promise<Node[]> {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const bas = params.get('bas') || bugun();
  const bit = params.get('bit') || new Date(Date.parse(`${bas}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const r = await api<any>('GET', `/yonetim/randevular?bas=${bas}&bit=${bit}`);
  const basEl = h('input', { class: 'input', type: 'date', value: r.bas, 'aria-label': 'Başlangıç tarihi' });
  const bitEl = h('input', { class: 'input', type: 'date', value: r.bit, 'aria-label': 'Bitiş tarihi' });
  const uygula = () => (location.hash = `randevular?bas=${basEl.value}&bit=${bitEl.value}`);
  basEl.addEventListener('change', uygula);
  bitEl.addEventListener('change', uygula);
  const gunler = new Map<string, any[]>();
  for (const x of r.randevular) (gunler.get(x.tarih) ?? gunler.set(x.tarih, []).get(x.tarih)!).push(x);
  return [
    baslik('Randevular', 'Randevu talepleri ve onaylı randevular.', h('div', { class: 'eylemler' }, basEl, bitEl)),
    gunler.size
      ? h('div', null, [...gunler.entries()].map(([g, list]) => kart(tarih(g, true), h('ul', { class: 'liste' }, list.map((x) => randevuSatiri({ ...x, tarih: x.tarih }, true))))))
      : kart(null, h('p', { class: 'bos' }, 'Bu tarihlerde randevu yok.')),
  ];
}

// ============================================================== Paketler

function paketFormu(p?: any) {
  return h(
    'div',
    { class: 'form-grid' },
    alan('Paket Adı', h('input', { class: 'input', name: 'ad', maxlength: 100, value: p?.ad ?? '', 'data-alan': 'Paket adı' })),
    h(
      'div',
      { class: 'form-grid uc' },
      alan('Süre', h('input', { class: 'input', name: 'sure', maxlength: 60, value: p?.sure ?? '', placeholder: 'Örn. 1 ay', 'data-alan': 'Süre' })),
      alan('Fiyat (TL)', h('input', { class: 'input', name: 'fiyat', inputmode: 'decimal', value: p?.fiyat ?? '', 'data-alan': 'Fiyat' })),
      alan('Sıra', h('input', { class: 'input', name: 'sira', inputmode: 'numeric', value: p?.sira ?? 0 })),
    ),
    alan('Açıklama', h('textarea', { class: 'textarea', name: 'ozet', maxlength: 600, 'data-alan': 'Açıklama' }, p?.ozet ?? '')),
    alan('Paket İçeriği (her satıra bir madde)', h('textarea', { class: 'textarea', name: 'icerikMetni' }, (p?.icerik ?? []).join('\n'))),
    h(
      'label',
      { class: 'onay-satiri' },
      h('input', { type: 'checkbox', name: 'fiyatGoster', checked: p ? p.fiyatGoster : true }),
      h('span', null, 'Fiyatı danışanlara göster', h('small', null, 'Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik md. 5(1)(m) nedeniyle hukukçu görüşü alınması önerilir.')),
    ),
    h('label', { class: 'onay-satiri' }, h('input', { type: 'checkbox', name: 'aktif', checked: p ? p.aktif : true }), h('span', null, 'Danışanlar bu paketi seçebilsin (aktif)')),
  );
}

function paketVerisi(form: HTMLFormElement) {
  const d = formNesnesi(form);
  d.icerik = String(d.icerikMetni ?? '')
    .split('\n')
    .map((s: string) => s.trim())
    .filter(Boolean);
  delete d.icerikMetni;
  return d;
}

async function paketlerBolumu(): Promise<Node[]> {
  const { paketler } = await api<any>('GET', '/yonetim/paketler');
  const yeni = async () => {
    const ok = await pencere({
      baslik: 'Yeni Paket',
      icerik: paketFormu(),
      onKaydet: async (form) => {
        await api('POST', '/yonetim/paketler', paketVerisi(form));
      },
    });
    if (ok) yenile();
  };
  return [
    baslik('Paketler', 'Danışanların panelde seçebileceği paketler.', h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: yeni }, 'Yeni Paket')),
    paketler.length
      ? h(
          'div',
          { class: 'izgara' },
          paketler.map((p: any) =>
            kart(
              null,
              h('h2', null, p.ad),
              h('p', null, h('span', { class: `durum ${p.aktif ? 'aktif' : 'pasif'}` }, p.aktif ? 'Aktif' : 'Pasif'), ' ', p.sure ? h('span', { class: 'chip' }, p.sure) : null),
              p.ozet ? h('p', null, p.ozet) : null,
              p.icerik.length ? h('ul', null, p.icerik.map((i: string) => h('li', null, i))) : null,
              p.fiyat !== null ? h('p', null, h('strong', null, para(p.fiyat)), p.fiyatGoster ? ' · danışanlara görünür' : ' · danışanlara gizli') : null,
              h(
                'div',
                { class: 'eylemler' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-outline btn-xs',
                    onclick: async () => {
                      const ok = await pencere({
                        baslik: p.ad,
                        icerik: paketFormu(p),
                        onKaydet: async (form) => {
                          await api('PUT', `/yonetim/paketler/${p.id}`, paketVerisi(form));
                        },
                      });
                      if (ok) yenile();
                    },
                  },
                  'Düzenle',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'metin-dugme',
                    onclick: async () => {
                      const ok = await pencere({
                        baslik: 'Paketi Sil',
                        icerik: h('p', null, `“${p.ad}” silinsin mi? Bu pakete bağlı kayıt varsa paket silinmez, pasif yapılır.`),
                        kaydet: 'Sil',
                        tehlikeli: true,
                        onKaydet: async () => {
                          await api('DELETE', `/yonetim/paketler/${p.id}`);
                        },
                      });
                      if (ok) yenile();
                    },
                  },
                  'Sil',
                ),
              ),
            ),
          ),
        )
      : kart(null, h('p', { class: 'bos' }, 'Henüz paket yok. “Yeni Paket” ile ekleyebilirsiniz.')),
  ];
}

// ============================================================== Duyuru ve toplu mesaj

async function duyuruBolumu(): Promise<Node[]> {
  const { danisanlar } = await api<any>('GET', '/yonetim/danisanlar');
  const aktifler = danisanlar.filter((d: any) => d.durum === 'aktif');
  const baslikEl = h('input', { class: 'input', name: 'baslik', maxlength: 120, 'data-alan': 'Başlık' });
  const metinEl = h('textarea', { class: 'textarea', name: 'metin', maxlength: 3000, 'data-alan': 'Mesaj' });
  const waListe = h('ul', { class: 'liste' });
  const waDoldur = () => {
    const metin = `${baslikEl.value ? `${baslikEl.value}\n` : ''}${metinEl.value}`.trim();
    waListe.replaceChildren(
      ...aktifler.map((d: any) =>
        h(
          'li',
          null,
          h('div', { class: 'ana' }, h('strong', null, d.ad), h('span', null, telefonGoster(d.telefon))),
          h(
            'a',
            {
              class: 'btn btn-wa btn-xs',
              href: whatsapp(d.telefon, `Merhaba ${ilkAd(d.ad)},\n${metin}${imza}`),
              target: '_blank',
              rel: 'noopener',
              onclick: (e: Event) => (e.currentTarget as HTMLElement).closest('li')?.classList.add('gonderildi'),
            },
            'WhatsApp’ta Aç',
          ),
        ),
      ),
    );
  };
  baslikEl.addEventListener('input', waDoldur);
  metinEl.addEventListener('input', waDoldur);
  waDoldur();
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    alan('Başlık', baslikEl),
    alan('Mesaj', metinEl),
    h('div', { class: 'eylemler' }, h('button', { type: 'submit', class: 'btn btn-primary' }, `Tüm Danışanlara Panelde Gönder (${aktifler.length})`)),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    mesgul(form.querySelector('button[type=submit]'), async () => {
      try {
        const r = await api<{ alici: number }>('POST', '/yonetim/toplu-mesaj', formNesnesi(form));
        toast(`Duyuru ${r.alici} danışanın paneline gönderildi.`);
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  return [
    baslik('Duyuru ve Mesaj', 'Tek tuşla tüm danışanların paneline duyuru gönderin; isterseniz WhatsApp’tan da tek tek iletin.'),
    kart(
      'Duyuru',
      h('p', { class: 'bilgi-kutu' }, 'Duyuruya kişisel sağlık bilgisi yazmayın. Tanıtım amaçlı toplu mesajlar yalnızca izin veren kişilere gönderilebilir (Tanıtım Yönetmeliği md. 5(1)(k)).'),
      form,
    ),
    kart('WhatsApp ile Tek Tek Gönder', h('p', { class: 'hint' }, 'Yukarıya yazdığınız mesaj her danışanın adıyla hazırlanır; düğmeye basınca WhatsApp açılır, göndermeniz yeterlidir.'), aktifler.length ? waListe : h('p', { class: 'bos' }, 'Aktif danışan yok.')),
  ];
}

// ============================================================== Kayıtlar

async function kayitlarBolumu(): Promise<Node[]> {
  const sayfa = Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('sayfa') ?? 0) || 0;
  const r = await api<any>('GET', `/yonetim/kayitlar?sayfa=${sayfa}`);
  return [
    baslik('Erişim Kayıtları', 'Giriş, görüntüleme, ekleme ve silme işlemlerinin kaydı (KVKK güvenlik önlemi). Kayıtlar 2 yıl saklanır.'),
    kart(
      null,
      kayitTablosu(r.kayitlar),
      h(
        'div',
        { class: 'eylemler', style: 'margin-top:12px' },
        sayfa > 0 ? h('a', { class: 'btn btn-outline btn-xs', href: `#kayitlar?sayfa=${sayfa - 1}` }, 'Daha Yeni') : null,
        r.kayitlar.length === 100 ? h('a', { class: 'btn btn-outline btn-xs', href: `#kayitlar?sayfa=${sayfa + 1}` }, 'Daha Eski') : null,
      ),
    ),
  ];
}

// ============================================================== Hesap

function hesapBolumu(): Node[] {
  const form = h(
    'form',
    { class: 'form-grid', novalidate: true },
    h('p', { class: 'form-hata', 'data-form-hata': true, hidden: true, role: 'alert' }),
    h(
      'div',
      { class: 'form-grid iki' },
      alan('Mevcut Şifre', h('input', { class: 'input', type: 'password', name: 'eski', autocomplete: 'current-password', 'data-alan': 'Mevcut şifre' })),
      alan('Yeni Şifre', h('input', { class: 'input', type: 'password', name: 'yeni', autocomplete: 'new-password', 'data-alan': 'Şifre' }), 'En az 12 karakter; en az bir harf ve bir rakam.'),
    ),
    h('div', null, h('button', { type: 'submit', class: 'btn btn-sage btn-sm' }, 'Şifreyi Değiştir')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formTemizle(form);
    mesgul(form.querySelector('button'), async () => {
      try {
        await api('POST', '/yonetim/sifre-degistir', formNesnesi(form));
        toast('Şifreniz değiştirildi.');
        form.reset();
      } catch (err) {
        formHatasi(form, err);
      }
    });
  });
  return [
    baslik('Hesabım', `${yonetici.ad} · ${yonetici.eposta}`),
    kart('Şifre', form),
    kart(
      'İki Adımlı Doğrulama',
      h('p', null, 'Girişte telefonunuzdaki doğrulama uygulamasının kodu istenir. Telefonunuzu değiştirirseniz kurulum koduyla doğrulamayı sıfırlayabilirsiniz.'),
      h('a', { class: 'btn btn-outline btn-sm', href: '/yonetim/kurulum/#sifirla' }, 'Doğrulamayı Sıfırla'),
    ),
    kart(
      'KVKK Metinleri',
      h('ul', null, Object.values(yonetici.belgeler).map((b) => h('li', null, h('a', { href: b.yol, target: '_blank', rel: 'noopener' }, b.baslik)))),
    ),
  ];
}

basla();
