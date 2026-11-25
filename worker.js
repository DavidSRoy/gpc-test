// GPC test page — Cloudflare Worker version
// Deploy: see README.md. Bind a KV namespace as GPC_LOG for the visit log.
// This same code is deployed as TWO Workers so the main page can embed
// a cross-origin iframe served by a different host:
//   - gpc-test        -> https://gpc-test.davidsroy.workers.dev
//   - gpc-test-frame  -> https://gpc-test-frame.davidsroy.workers.dev
// Routes: /gpc-test (main page), /gpc-test/frame (iframe page), /gpc-test/log
// All verdicts come from headers the server actually received on that
// specific request. Cache-Control: no-store everywhere, no cookies.

const CROSS_ORIGIN_FRAME_URL = 'https://gpc-test-frame.davidsroy.workers.dev/gpc-test/frame';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function shell(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;line-height:1.5;color:#111;background:#fff}
.verdict{font-size:2rem;font-weight:800;padding:20px;border-radius:12px;text-align:center;margin:16px 0}
.verdict.small{font-size:1.4rem;padding:12px;margin:8px 0}
.yes{background:#d1fae5;border:2px solid #059669}.no{background:#fee2e2;border:2px solid #dc2626}
table{border-collapse:collapse;width:100%;font-size:.9rem;word-break:break-all}
td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f4f6} pre{white-space:pre-wrap;word-break:break-all;background:#f9fafb;padding:12px;border-radius:8px}
a{color:#2563eb}
iframe{width:100%;height:270px;border:2px solid #9ca3af;border-radius:12px;background:#fff}
.frame-label{font-weight:700;margin-top:24px}
.host{font-size:.85rem;color:#555;word-break:break-all}
</style></head><body>${body}</body></html>`;
}
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

function logVisit(request, env, ctx, tag) {
  if (!env.GPC_LOG) return;
  const gpc = request.headers.get('sec-gpc') === '1';
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const entry = `${new Date().toISOString()}\t${ip}\t${gpc ? 'Sec-GPC:1' : 'Sec-GPC:absent'}\t${tag}\t${ua}`;
  // One KV key per visit — no read-modify-write, so rapid reloads
  // can't overwrite or concatenate each other's log entries.
  const key = 'v:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
  ctx.waitUntil(env.GPC_LOG.put(key, entry));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const gpc = request.headers.get('sec-gpc') === '1';

    if (url.pathname === '/gpc-test/frame') {
      // This page is loaded inside an iframe. Its verdict is based on the
      // headers of THIS frame request only — never the parent page's.
      logVisit(request, env, ctx, 'frame:' + url.host);
      const body = `
<div class="host">iframe page served by: ${esc(url.host)}</div>
<div class="verdict small ${gpc ? 'yes' : 'no'}">Sec-GPC: 1 received: ${gpc ? 'YES' : 'NO'}</div>
<div class="verdict small" id="js-verdict">navigator.globalPrivacyControl: (evaluating…)</div>
<p>This verdict comes from the headers received for this iframe's own request. The second box is evaluated live by JavaScript inside this iframe.</p>
<script>
document.getElementById('js-verdict').textContent =
  'navigator.globalPrivacyControl: ' + String(navigator.globalPrivacyControl);
</script>`;
      return new Response(shell('GPC Test — iframe', body), { headers: HEADERS });
    }

    if (url.pathname === '/gpc-test' || url.pathname === '/gpc-test/') {
      logVisit(request, env, ctx, 'main:' + url.host);
      const rows = [...request.headers.entries()]
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
      const body = `
<h1>Global Privacy Control (GPC) Test</h1>
<p class="frame-label">Main page</p>
<div class="verdict ${gpc ? 'yes' : 'no'}">Sec-GPC: 1 received: ${gpc ? 'YES' : 'NO'}</div>
<p>This verdict comes from the HTTP headers this server actually received on this request — not from JavaScript.</p>
<p id="js-fyi"></p>

<p class="frame-label">Same-origin iframe</p>
<div class="host">Served by the same host as this page: ${esc(url.host)}/gpc-test/frame</div>
<iframe src="/gpc-test/frame" title="Same-origin GPC test iframe"></iframe>

<p class="frame-label">Cross-origin iframe</p>
<div class="host">Served by a different host: gpc-test-frame.davidsroy.workers.dev/gpc-test/frame</div>
<iframe src="${CROSS_ORIGIN_FRAME_URL}" title="Cross-origin GPC test iframe"></iframe>

<h2>All received headers (main page request)</h2>
<table>${rows}</table>
<p><a href="/gpc-test/log">View visit log</a></p>
<script>
try { var v = navigator.globalPrivacyControl;
  if (typeof v !== 'undefined') document.getElementById('js-fyi').textContent =
    'For comparison only, navigator.globalPrivacyControl reports: ' + v;
} catch (e) {}
</script>`;
      return new Response(shell('GPC Test', body), { headers: HEADERS });
    }

    if (url.pathname === '/gpc-test/log') {
      let lines = [];
      if (env.GPC_LOG) {
        const list = await env.GPC_LOG.list({ prefix: 'v:', limit: 100 });
        const keys = list.keys.map(k => k.name).sort().reverse().slice(0, 100);
        const vals = await Promise.all(keys.map(k => env.GPC_LOG.get(k)));
        lines = vals.filter(Boolean);
      }
      const body = `<h1>GPC Test — Recent Visits</h1>
<p>Most recent first, last ${lines.length} visits. Each line: timestamp, client IP, Sec-GPC, page (main or frame, with host), user-agent.</p>
<pre>${esc(lines.join('\n') || '(no visits logged yet)')}</pre>
<p><a href="/gpc-test">Back to test page</a></p>`;
      return new Response(shell('GPC Test Log', body), { headers: HEADERS });
    }

    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
};
