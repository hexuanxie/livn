/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'pyodide-v0.29.3-r4';
const PYODIDE_ORIGIN = '/pyodide/';

/** Servers often serve .wasm as text/x-asm; Pyodide requires application/wasm. */
function contentTypeForPath(pathname: string): string | null {
    if (pathname.endsWith('.wasm')) return 'application/wasm';
    if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) return 'application/javascript';
    if (pathname.endsWith('.whl') || pathname.endsWith('.zip')) return 'application/zip';
    if (pathname.endsWith('.json')) return 'application/json';
    return null;
}

async function normalizePyodideResponse(
    request: Request,
    response: Response
): Promise<Response> {
    if (!response.ok) return response;

    const expected = contentTypeForPath(new URL(request.url).pathname);
    if (!expected) return response;

    const actual = (response.headers.get('Content-Type') ?? '').split(';')[0].trim();
    if (actual === expected) return response;

    const blob = await response.blob();
    const headers = new Headers();
    headers.set('Content-Type', expected);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    return new Response(blob, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

sw.addEventListener('install', () => {
    sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((n) => n.startsWith('pyodide-') && n !== CACHE_NAME)
                        .map((n) => caches.delete(n))
                )
            )
            .then(() => sw.clients.claim())
    );
});

sw.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (!url.pathname.startsWith(PYODIDE_ORIGIN)) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            if (cached) return cached;

            const raw = await fetch(event.request);
            const response = await normalizePyodideResponse(event.request, raw);
            if (response.ok) {
                cache.put(event.request, response.clone());
            }
            return response;
        })
    );
});
