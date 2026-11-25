// GPC test page — zero-dependency Node server (spec-literal version)
// Implements: GET /gpc-test  and  GET /gpc-test/log
// - Server-side header echo, Sec-GPC verdict from actual received headers
// - Appends every /gpc-test visit to ./gpc-visits.log
// - Cache-Control: no-store on every response, no cookies, no tracking
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, 'gpc-visits.log');
// The cross-origin iframe is served by a second host running the same code.
const CROSS_ORIGIN_FRAME_URL = process.env.CROSS_ORIGIN_FRAME_URL ||
  'https://gpc-test-frame.davidsroy.workers.dev/gpc-test/frame';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function pageShell(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;line-height:1.5;color:#111;background:#fff}
.verdict{font-size:2rem;font-weight:800;padding:20px;border-radius:12px;text-align:center;margin:16px 0}
.verdict.small{font-size:1.4rem;padding:12px;margin:8px 0}
.yes{background:#d1fae5;border:2px solid #059669}.no{background:#fee2e2;border:2px solid #dc2626}
iframe{width:100%;height:270px;border:2px solid #9ca3af;border-radius:12px}
.frame-label{font-weight:700;margin-top:24px}.host{font-size:.85rem;color:#555;word-break:break-all}
table{border-collapse:collapse;width:100%;font-size:.9rem;word-break:break-all}
td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f4f6} pre{white-space:pre-wrap;word-break:break-all;background:#f9fafb;padding:12px;border-radius:8px}
a{color:#2563eb}
</style></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');

  function logVisit(tag) {
    const gpc = req.headers['sec-gpc'] === '1';
    const entry = `${new Date().toISOString()}\t${clientIp(req)}\t${gpc ? 'Sec-GPC:1' : 'Sec-GPC:absent'}\t${tag}\t${req.headers['user-agent'] || ''}\n`;
    try { fs.appendFileSync(LOG_FILE, entry); } catch (e) { console.error('log write failed', e); }
    return gpc;
  }

  if (url.pathname === '/gpc-test/frame') {
    const gpc = logVisit('frame:' + (req.headers.host || ''));
    const body = `
<div class="host">iframe page served by: ${esc(req.headers.host || '')}</div>
<div class="verdict small ${gpc ? 'yes' : 'no'}">Sec-GPC: 1 received: ${gpc ? 'YES' : 'NO'}</div>
<div class="verdict small" id="js-verdict">navigator.globalPrivacyControl: (evaluating…)</div>
<p>This verdict comes from the headers received for this iframe's own request. The second box is evaluated live by JavaScript inside this iframe.</p>
<script>
document.getElementById('js-verdict').textContent =
  'navigator.globalPrivacyControl: ' + String(navigator.globalPrivacyControl);
</script>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageShell('GPC Test — iframe', body));
    return;
  }

  if (url.pathname === '/gpc-test' || url.pathname === '/gpc-test/') {
    const gpc = logVisit('main:' + (req.headers.host || ''));

    const rows = Object.entries(req.headers)
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    const body = `
<h1>Global Privacy Control (GPC) Test</h1>
<p class="frame-label">Main page</p>
<div class="verdict ${gpc ? 'yes' : 'no'}">Sec-GPC: 1 received: ${gpc ? 'YES' : 'NO'}</div>
<p>This verdict comes from the HTTP headers this server actually received on this request — not from JavaScript.</p>
<p id="js-fyi"></p>
<p class="frame-label">Same-origin iframe</p>
<div class="host">Served by the same host as this page: ${esc(req.headers.host || '')}/gpc-test/frame</div>
<iframe src="/gpc-test/frame" title="Same-origin GPC test iframe"></iframe>
<p class="frame-label">Cross-origin iframe</p>
<div class="host">Served by a different host: ${esc(CROSS_ORIGIN_FRAME_URL)}</div>
<iframe src="${esc(CROSS_ORIGIN_FRAME_URL)}" title="Cross-origin GPC test iframe"></iframe>
<h2>All received headers (main page request)</h2>
<table>${rows}</table>
<p><a href="/gpc-test/log">View visit log</a></p>
<script>
// Secondary FYI only — the verdict above does NOT use this.
try {
  var v = navigator.globalPrivacyControl;
  if (typeof v !== 'undefined') document.getElementById('js-fyi').textContent =
    'For comparison only, navigator.globalPrivacyControl reports: ' + v;
} catch (e) {}
</script>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageShell('GPC Test', body));
    return;
  }

  if (url.pathname === '/gpc-test/log') {
    let lines = [];
    try { lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean).slice(-100).reverse(); }
    catch (e) { /* no visits yet */ }
    const body = `<h1>GPC Test — Recent Visits</h1>
<p>Most recent first, last ${lines.length} visits. Each line: timestamp, client IP, Sec-GPC, page (main or frame, with host), user-agent.</p>
<pre>${esc(lines.join('\n') || '(no visits logged yet)')}</pre>
<p><a href="/gpc-test">Back to test page</a></p>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageShell('GPC Test Log', body));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => console.log(`GPC test listening on :${PORT}`));
