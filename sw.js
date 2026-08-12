/* MASTER DESK — Service Worker
   목표: 첫 접속 이후 비행기 모드에서도 완전히 동작할 것.

   전략은 캐시 우선 + 백그라운드 갱신(stale-while-revalidate).
   오디오 처리는 전부 기기 안에서 도니 네트워크는 앱 파일을 받을 때만 쓴다.
   따라서 캐시가 있으면 즉시 내주고, 새 버전은 조용히 받아 다음 실행에 반영한다. */

const VERSION = 'v1.0.0';
const CACHE = 'masterdesk-' + VERSION;

// 상대 경로로 적어야 /Mastering/ 같은 하위 경로에 배포해도 그대로 동작한다.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil((async ()=>{
    const c = await caches.open(CACHE);
    // 하나가 실패해도 나머지는 캐시되도록 개별 처리한다.
    await Promise.all(ASSETS.map(async url=>{
      try{ await c.add(new Request(url, {cache:'reload'})); }
      catch(err){ console.warn('[sw] 캐시 실패:', url, err); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('masterdesk-') && k!==CACHE)
                          .map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   // 외부 요청은 건드리지 않는다

  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE);

    // 주소창 직접 진입/새로고침은 항상 index.html로 되돌린다.
    // 이게 없으면 오프라인에서 하위 경로 진입 시 사파리가 오류 페이지를 띄운다.
    const cached = await cache.match(req, {ignoreSearch:true})
                || (req.mode === 'navigate' ? await cache.match('./index.html') : null);

    const network = fetch(req).then(res=>{
      if(res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(()=>null);

    if(cached){ e.waitUntil(network); return cached; }     // 캐시 우선 + 뒤에서 갱신

    const res = await network;
    if(res) return res;
    if(req.mode === 'navigate'){
      const fallback = await cache.match('./index.html');
      if(fallback) return fallback;
    }
    return new Response('오프라인이고 캐시에도 없습니다.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});

self.addEventListener('message', e=>{
  if(e.data === 'skipWaiting') self.skipWaiting();
});
