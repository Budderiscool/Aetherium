// sw.js — Aetherium OS Service Worker
// Cache Management & Client-Side Proxy Request Interception Engine

const CACHE_NAME = 'aetherium-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles/system.css',
  './styles/wm.css',
  './kernel/boot.js',
  './kernel/ipc.js',
  './kernel/vfs.js',
  './kernel/wm.js',
  './apps/browser.js',
  './apps/files.js',
  './apps/terminal.js',
  './apps/editor.js',
  './apps/monitor.js',
  './apps/settings.js',
  './apps/calculator.js',
  './apps/notes.js',
  './apps/mediaplayer.js'
];

// In-memory proxy configuration (can be updated via postMessage from Settings app)
let proxyConfig = {
  transportUrl: 'https://bare.benroberts.net/', // Default public Bare/Wisp endpoint
  transportType: 'bare', // 'bare' | 'wisp' | 'cors-gateway'
  corsProxy: 'https://api.allorigins.win/raw?url=',
  rewriteHtml: true
};

/* ============================================================
   1. Install & Cache
   ============================================================ */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Non-blocking best-effort caching to prevent installation blockage on network hiccups
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[AetherSW] Failed to precache ${url}:`, err);
          })
        )
      );
    })
  );
});

/* ============================================================
   2. Activation & Cleanup
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ============================================================
   3. Interprocess Message Handling
   ============================================================ */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  const { type, payload } = event.data;

  if (type === 'UPDATE_PROXY_CONFIG') {
    proxyConfig = { ...proxyConfig, ...payload };
    event.ports[0]?.postMessage({ status: 'ok', config: proxyConfig });
  } else if (type === 'GET_PROXY_STATUS') {
    event.ports[0]?.postMessage({ status: 'online', config: proxyConfig });
  } else if (type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ status: 'cache_cleared' });
    });
  }
});

/* ============================================================
   4. Fetch Interception & Proxy Rewriting Engine
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this request is a proxy navigation/resource request
  if (url.pathname.includes('/__aether_proxy__/')) {
    event.respondWith(handleProxyRequest(event.request));
    return;
  }

  // Same-origin OS app assets -> Cache-first strategy
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200 && event.request.method === 'GET') {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        }).catch(() => {
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // Third-party CDN resources (fonts, cdn libraries) -> Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkRes;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

/**
 * Client-Side Proxy Request Handler
 * Decodes the target URL, queries through transport or CORS relay,
 * and rewrites HTML/CSS attributes so relative links remain in the proxy sandbox.
 */
async function handleProxyRequest(request) {
  const reqUrl = new URL(request.url);
  const proxyPrefix = '/__aether_proxy__/';
  const targetPart = reqUrl.pathname.substring(reqUrl.pathname.indexOf(proxyPrefix) + proxyPrefix.length) + reqUrl.search;
  
  let targetUrlStr = '';
  try {
    targetUrlStr = decodeURIComponent(targetPart);
    if (!targetUrlStr.startsWith('http://') && !targetUrlStr.startsWith('https://')) {
      targetUrlStr = 'https://' + targetUrlStr;
    }
  } catch (err) {
    targetUrlStr = targetPart;
  }

  try {
    let targetUrl = new URL(targetUrlStr);
    let fetchTarget = '';
    let fetchHeaders = new Headers(request.headers);

    fetchHeaders.delete('host');
    fetchHeaders.delete('origin');
    fetchHeaders.delete('referer');

    // Route according to transport configuration
    if (proxyConfig.transportType === 'bare' && proxyConfig.transportUrl) {
      // Bare server transport protocol: send to bare endpoint with X-Bare-Url
      const bareEndpoint = proxyConfig.transportUrl.replace(/\/+$/, '') + '/';
      fetchTarget = bareEndpoint;
      fetchHeaders.set('x-bare-url', targetUrl.href);
      fetchHeaders.set('x-bare-headers', JSON.stringify(Object.fromEntries(request.headers.entries())));
    } else {
      // Fallback CORS Gateway relay
      const corsPrefix = proxyConfig.corsProxy || 'https://api.allorigins.win/raw?url=';
      fetchTarget = corsPrefix + encodeURIComponent(targetUrl.href);
    }

    const response = await fetch(fetchTarget, {
      method: request.method,
      headers: fetchHeaders,
      body: (request.method !== 'GET' && request.method !== 'HEAD') ? await request.blob() : undefined,
      mode: 'cors',
      credentials: 'omit'
    });

    const contentType = response.headers.get('content-type') || '';
    
    // If HTML, rewrite links, scripts, and stylesheets
    if (contentType.includes('text/html') && proxyConfig.rewriteHtml) {
      let htmlText = await response.text();
      const originBase = targetUrl.origin;
      const proxyBase = `${self.location.origin}/__aether_proxy__/`;

      // Rewrite src, href, action to route through proxy
      htmlText = htmlText.replace(/(href|src|action)=["'](https?:\/\/[^"']+)["']/gi, (match, attr, fullUrl) => {
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // Rewrite root-relative links
      htmlText = htmlText.replace(/(href|src|action)=["']\/([^"']*)["']/gi, (match, attr, relPath) => {
        const absoluteUrl = `${originBase}/${relPath}`;
        return `${attr}="${proxyBase}${encodeURIComponent(absoluteUrl)}"`;
      });

      // Inject base tag & client helper script
      const injectedScript = `
        <script>
          // AetherNet Client-Side Proxy Shim
          window.__AETHER_ORIGIN__ = ${JSON.stringify(originBase)};
          window.__AETHER_TARGET__ = ${JSON.stringify(targetUrl.href)};
        </script>
      `;

      if (htmlText.includes('<head>')) {
        htmlText = htmlText.replace('<head>', '<head>' + injectedScript);
      } else {
        htmlText = injectedScript + htmlText;
      }

      // Return rewritten response without restrictive framing headers
      const newHeaders = new Headers(response.headers);
      newHeaders.delete('x-frame-options');
      newHeaders.delete('content-security-policy');
      newHeaders.set('content-type', 'text/html; charset=utf-8');

      return new Response(htmlText, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }

    // For non-HTML assets (images, css, js)
    const assetHeaders = new Headers(response.headers);
    assetHeaders.delete('x-frame-options');
    assetHeaders.delete('content-security-policy');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: assetHeaders
    });
  } catch (error) {
    console.error('[AetherSW] Proxy Request Failure:', error);
    
    // Return friendly diagnostic page
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AetherNet Transport Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a14; color: #e8e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: rgba(25, 25, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 32px; max-width: 480px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
          h2 { color: #00d4ff; margin-top: 0; }
          p { color: #a0a0b8; line-height: 1.6; font-size: 14px; }
          code { background: rgba(0,0,0,0.4); padding: 3px 6px; border-radius: 4px; color: #f59e0b; font-family: monospace; }
          .btn { display: inline-block; background: #00d4ff; color: #000; font-weight: 600; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 16px; cursor: pointer; border: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>AetherNet Connection Diagnostics</h2>
          <p>Failed to route traffic to: <code>${targetUrlStr}</code></p>
          <p>The configured Bare/Wisp transport relay (<code>${proxyConfig.transportUrl}</code>) is unreachable or CORS restricted.</p>
          <p>To resolve this, open <strong>System Settings &gt; Network &amp; Proxy</strong> and configure a valid self-hosted or public Wisp/Bare endpoint.</p>
          <button class="btn" onclick="location.reload()">Retry Connection</button>
        </div>
      </body>
      </html>
    `;

    return new Response(errorHtml, {
      status: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  }
}
