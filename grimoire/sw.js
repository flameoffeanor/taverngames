// Grimoire çevrimdışı kabuğu: önce internet, yoksa kayıtlı kopya. İnternet varken her zaman güncel sürüm gelir.
// (Bu dosya olmadan Chrome internetsiz yenilemede sayfanın donmuş bir "çevrimdışı kopyasını" gösterir.)
const CACHE = 'tg-grimoire-v1';
const HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin && !HOSTS.includes(u.hostname)) return; // Firebase veri/oturum trafiğine ve Sheet'e dokunma
  if (u.pathname.endsWith('/sw.js')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(r, { signal: ctl.signal }); clearTimeout(t);
      if (res && (res.ok || res.type === 'opaque')) cache.put(r, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(r, { ignoreSearch: r.mode === 'navigate' });
      if (hit) return hit;
      throw err;
    }
  })());
});
