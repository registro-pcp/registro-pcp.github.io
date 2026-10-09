/* Faz o app abrir sem internet.
   - Página e arquivos públicos (login): guardados no aparelho.
   - Telas do app (/app/...): só existem no aparelho depois do login, guardadas
     pelo carregador (js/inicio.js). Sem login, este endereço não entrega nada.
   A cada versão publicada, troque o número em CACHE. */
const CACHE = 'registro-pcp-site-v4';
const CACHE_TELAS = 'registro-pcp-telas';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './js/config.js',
  './js/sessao.js',
  './js/inicio.js',
  './vendor/supabase.js',
  './fontes/nunito-sans-latin-wght-normal.woff2',
  './icones/icon-192.png',
  './icones/icon-512.png',
  './icones/apple-touch-icon.png',
  './icones/logo-friato-branca.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves
        .filter((k) => k !== CACHE && k !== CACHE_TELAS)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function comPrazo(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('prazo')), ms);
    promessa.then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Telas do app: só o que o carregador guardou depois do login.
  const escopo = new URL('./', self.registration.scope).pathname;
  if (url.pathname.startsWith(`${escopo}app/`)) {
    e.respondWith(
      caches.open(CACHE_TELAS)
        .then((c) => c.match(req, { ignoreSearch: true }))
        .then((r) => r || new Response('', { status: 404 })),
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      comPrazo(fetch(req, { cache: 'no-cache' }), 4000)
        .then((resp) => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copia));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)),
  );
});
