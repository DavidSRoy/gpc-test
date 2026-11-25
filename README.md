# GPC Test Page

A small, generic [Global Privacy Control](https://globalprivacycontrol.org/) (GPC) test page.
It verifies whether a visiting browser sends the `Sec-GPC: 1` HTTP header.

**Live demo:** https://gpc-test.davidsroy.workers.dev/gpc-test
**Visit log:** https://gpc-test.davidsroy.workers.dev/gpc-test/log

## What it does

- **Server-side verdict** — when the page is requested, the server reads the
  incoming HTTP request headers and renders them into the page. A big
  `Sec-GPC: 1 received: YES / NO` verdict sits at the top, followed by the
  full received header list.
- **Per-visit log** — every visit is logged (timestamp, client IP,
  user-agent, and whether `Sec-GPC` was present). `GET /gpc-test/log`
  displays the recent entries, most recent first, so repeated reloads can be
  correlated by time.
- **No client-side tricks** — the verdict comes only from headers the server
  actually received. `navigator.globalPrivacyControl` is shown as a
  secondary FYI only.
- **Lightweight** — plain HTML, no frameworks, no cookies, no tracking.
  Every response sends `Cache-Control: no-store`, so each reload hits the
  server.

Nothing on the page references any employer, internal tool, or test account.
It is a generic public GPC checker.

## Implementations

Two equivalent implementations are included:

### Cloudflare Worker (`worker.js`) — used for the live demo

1. Create a free Cloudflare account and a Workers KV namespace.
2. Copy `wrangler.toml.example` to `wrangler.toml` and fill in your KV
   namespace ID.
3. Deploy:

   ```sh
   npx wrangler deploy
   ```

   Or paste `worker.js` into a Worker in the Cloudflare dashboard and bind
   the KV namespace as `GPC_LOG` under Settings → Bindings.

The Worker stores one KV key per visit, so rapid reloads cannot overwrite
or merge each other's log entries.

### Node.js (`server.js`) — zero dependencies

```sh
PORT=8080 node server.js
```

Visits append to `gpc-visits.log` next to the script (set `LOG_FILE` to
change the path). Routes are the same: `/gpc-test` and `/gpc-test/log`.

## Why not GitHub Pages?

Static hosting (GitHub Pages and similar) runs no server code on a request,
so it cannot read the `Sec-GPC` header, render a server-side verdict, keep a
server-side log, or set `Cache-Control: no-store`. A static page could only
check `navigator.globalPrivacyControl` in JavaScript, which this checker
deliberately does not rely on.
