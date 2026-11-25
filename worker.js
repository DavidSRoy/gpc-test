// GPC test page — Cloudflare Worker version (RECOMMENDED for David)
// Deploy: wrangler deploy  (see README.md)
// Bind a KV namespace as GPC_LOG to persist the visit log.
// Routes (configure in wrangler.toml / dashboard): /gpc-test and /gpc-test/log
// Same behavior as server.js: server-side header echo, Sec-GPC verdict,
// per-visit log, Cache-Control: no-store, no cookies, no tracking.

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
.yes{background:#d1fae5;border:2px solid #059669}.no{background:#fee2e2;border:2px solid #dc2626}
table{border-collapse:collapse;width:100%;font-size:.9rem;word-break:break-all}
td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f4f6} pre{white-space:pre-wrap;word-break:break-all;background:#f9fafb;padding:12px;border-radius:8px}
a{color:#2563eb}
</style></head><body>${body}</body></html>`;
}
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/gpc-test' || url.pathname === '/gpc-test/') {
      const gpc = request.headers.get('sec-gpc') === '1';
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = request.headers.get('user-agent') || '';
      const entry = `${new Date().toISOString()}\t${ip}\t${gpc ? 'Sec-GPC:1' : 'Sec-GPC:absent'}\t${ua}`;
      if (env.GPC_LOG) {
        // One KV key per visit — no read-modify-write, so rapid reloads
        // can't overwrite or concatenate each other's log entries.
        const key = 'v:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
        ctx.waitUntil(env.GPC_LOG.put(key, entry));
      }
      const rows = [...request.headers.entries()]
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
      const body = `
<h1>Global Privacy Control (GPC) Test</h1>
<div class="verdict ${gpc ? 'yes' : 'no'}">Sec-GPC: 1 received: ${gpc ? 'YES' : 'NO'}</div>
<p>This verdict comes from the HTTP headers this server actually received on this request — not from JavaScript.</p>
<p id="js-fyi"></p>
<h2>All received headers</h2>
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
<p>Most recent first, last ${lines.length} visits. Each line: timestamp, client IP, Sec-GPC, user-agent.</p>
<pre>${esc(lines.join('\n') || '(no visits logged yet)')}</pre>
<p><a href="/gpc-test">Back to test page</a></p>`;
      return new Response(shell('GPC Test Log', body), { headers: HEADERS });
    }

    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
};
