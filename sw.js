// sw.js
const CACHE_PREFIX = "valolog-cache";
const CORE_ASSETS = [
    "/",
    "/index.html",
    "/style.css",
    "/app.js",
    "/manifest.webmanifest"
    // 필요시 폰트/이미지 추가
];

// 설치: 필수 파일 프리캐시
self.addEventListener("install", (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_PREFIX).then((c) => c.addAll(CORE_ASSETS)));
});

// 활성화: 오래된 캐시 정리 + 즉시 클라이언트 제어
self.addEventListener("activate", (e) => {
    e.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => (k.startsWith(CACHE_PREFIX) ? null : caches.delete(k))));
            await self.clients.claim();
        })()
    );
});

// 네트워크 우선 + 실패 시 캐시
self.addEventListener("fetch", (e) => {
    const { request } = e;
    // only GET
    if (request.method !== "GET") return;
    e.respondWith(
        (async () => {
            try {
                // 네트워크에서 최신 받기
                const fresh = await fetch(request, { cache: "no-store" });
                // 받아온 응답을 캐시에 백그라운드 저장
                const cache = await caches.open(CACHE_PREFIX);
                cache.put(request, fresh.clone()).catch(() => {});
                return fresh;
            } catch {
                // 오프라인이면 캐시 fallback
                const cached = await caches.match(request, { ignoreSearch: true });
                if (cached) return cached;
                // 마지막 수단: 루트 반환
                const fallback = await caches.match("/");
                return fallback || Response.error();
            }
        })()
    );
});
