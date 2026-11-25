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
.yes{background:#d1fae5;border:2px solid #059669}.no{background:#fee2e2;border:2px solid #dc2626}
table{border-collapse:collapse;width:100%;font-size:.9rem;word-break:break-all}
td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f3f4f6} pre{white-space:pre-wrap;word-break:break-all;background:#f9fafb;padding:12px;border-radius:8px}
a{color:#2563eb}
</style></head><body>${body}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/gpc-test' || url.pathname === '/gpc-test/') {
    const gpc = req.headers['sec-gpc'] === '1';
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';
    const entry = `${new Date().toISOString()}\t${ip}\t${gpc ? 'Sec-GPC:1' : 'Sec-GPC:absent'}\t${ua}\n`;
    try { fs.appendFileSync(LOG_FILE, entry); } catch (e) { console.error('log write failed', e); }

    const rows = Object.entries(req.headers)
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
<p>Most recent first, last ${lines.length} visits. Each line: timestamp, client IP, Sec-GPC, user-agent.</p>
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
