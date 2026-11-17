// sw.js — Aetherium OS Service Worker
// Cache Management & Client-Side Proxy Request Interception Engine

const CACHE_NAME = 'aetherium-v2';

// In-memory proxy configuration (can be updated via postMessage from Settings app)
let proxyConfig = {
  transportUrl: 'https://bare.benroberts.net/',
  transportType: 'bare',
  corsProxy: 'https://api.allorigins.win/raw?url=',
  rewriteHtml: true
};

/* ============================================================
   1. Install & Activate (Immediate Takeover)
   ============================================================ */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

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
   2. Interprocess Message Handling
   ============================================================ */
self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type, payload } = event.data;

  if (type === 'UPDATE_PROXY_CONFIG') {
    proxyConfig = { ...proxyConfig, ...payload };
    event.ports[0]?.postMessage({ status: 'ok', config: proxyConfig });
  } else if (type === 'GET_PROXY_STATUS') {
    event.ports[0]?.postMessage({ status: 'online', config: proxyConfig });
  }
});

/* ============================================================
   3. Fetch Interception
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept proxy requests targeting external sites
  if (url.pathname.includes('/__aether_proxy__/')) {
    event.respondWith(handleProxyRequest(event.request));
    return;
  }

  // Same-origin OS app assets -> Network first, fallback to cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            return new Response('Network Error', { status: 503, statusText: 'Offline' });
          });
        })
    );
    return;
  }

  // Third-party CDN resources -> Network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

/**
 * Client-Side Proxy Request Handler
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

    if (proxyConfig.transportType === 'bare' && proxyConfig.transportUrl) {
      const bareEndpoint = proxyConfig.transportUrl.replace(/\/+$/, '') + '/';
      fetchTarget = bareEndpoint;
      fetchHeaders.set('x-bare-url', targetUrl.href);
      fetchHeaders.set('x-bare-headers', JSON.stringify(Object.fromEntries(request.headers.entries())));
    } else {
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
    
    if (contentType.includes('text/html') && proxyConfig.rewriteHtml) {
      let htmlText = await response.text();
      const originBase = targetUrl.origin;
      const proxyBase = `${self.location.origin}/__aether_proxy__/`;

      htmlText = htmlText.replace(/(href|src|action)=["'](https?:\/\/[^"']+)["']/gi, (match, attr, fullUrl) => {
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      htmlText = htmlText.replace(/(href|src|action)=["']\/([^"']*)["']/gi, (match, attr, relPath) => {
        const absoluteUrl = `${originBase}/${relPath}`;
        return `${attr}="${proxyBase}${encodeURIComponent(absoluteUrl)}"`;
      });

      const injectedScript = `
        <script>
          window.__AETHER_ORIGIN__ = ${JSON.stringify(originBase)};
          window.__AETHER_TARGET__ = ${JSON.stringify(targetUrl.href)};
        </script>
      `;

      if (htmlText.includes('<head>')) {
        htmlText = htmlText.replace('<head>', '<head>' + injectedScript);
      } else {
        htmlText = injectedScript + htmlText;
      }

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

    const assetHeaders = new Headers(response.headers);
    assetHeaders.delete('x-frame-options');
    assetHeaders.delete('content-security-policy');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: assetHeaders
    });
  } catch (error) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AetherNet Transport</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0a0a14; color: #e8e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: rgba(25, 25, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 28px; max-width: 480px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
          h2 { color: #00d4ff; margin-top: 0; }
          p { color: #a0a0b8; line-height: 1.6; font-size: 13px; }
          code { background: rgba(0,0,0,0.4); padding: 3px 6px; border-radius: 4px; color: #f59e0b; font-family: monospace; }
          .btn { display: inline-block; background: #00d4ff; color: #000; font-weight: 600; padding: 8px 16px; border-radius: 6px; text-decoration: none; margin-top: 14px; cursor: pointer; border: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>AetherNet Web Gateway</h2>
          <p>Navigating to: <code>${targetUrlStr}</code></p>
          <p>The external site restricts cross-origin framing or the configured transport relay (<code>${proxyConfig.transportUrl}</code>) is temporarily unavailable.</p>
          <p>You can configure alternative Bare/Wisp relays in <strong>System Settings &gt; Network &amp; Proxy</strong>, or open the link directly:</p>
          <a class="btn" href="${targetUrlStr}" target="_blank" rel="noopener">Open in New Tab &rarr;</a>
        </div>
      </body>
      </html>
    `;

    return new Response(errorHtml, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  }
}
