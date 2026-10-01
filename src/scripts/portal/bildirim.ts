// Diyetisyenin telefonuna bildirim ekleme sayfası (/yonetim/bildirim/)
import { api, ApiError } from './lib';


const kok = document.querySelector<HTMLElement>('[data-bildirim]')!;
const form = kok.querySelector<HTMLFormElement>('[data-form]')!;
const hata = form.querySelector<HTMLElement>('[data-form-hata]')!;
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
const anaEkranda = (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
const destekli = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
if (ios && !anaEkranda) kok.querySelector<HTMLElement>('[data-ios]')!.hidden = false;
else if (!destekli) kok.querySelector<HTMLElement>('[data-desteksiz]')!.hidden = false;

const baytlar = (b: string) => {
  const s = atob(b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hata.hidden = true;
  const btn = form.querySelector<HTMLButtonElement>('button')!;
  btn.disabled = true;
  try {
    const kod = String(new FormData(form).get('kod') ?? '').replace(/\D/g, '');
    if (kod.length !== 6) throw new Error('6 haneli kodu girin.');
    if (!destekli) throw new Error('Bu tarayıcı bildirimleri desteklemiyor.');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bildirim izni verilmedi. Telefon ayarlarından izin verip tekrar deneyin.');
    const { anahtar } = await api<{ anahtar: string }>('GET', '/bildirim/anahtar');
    const reg = await navigator.serviceWorker.register('/yonetim/sw.js', { scope: '/yonetim/' });
    await navigator.serviceWorker.ready;
    const abone =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: baytlar(anahtar) as Uint8Array<ArrayBuffer> }));
    await api('POST', '/bildirim/telefon', { kod, endpoint: abone.endpoint, ad: ios ? 'iPhone' : 'Telefon' });
    form.hidden = true;
    kok.querySelector<HTMLElement>('[data-tamam]')!.hidden = false;
  } catch (err) {
    hata.textContent = err instanceof ApiError || err instanceof Error ? err.message : 'Bildirim açılamadı.';
    hata.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
