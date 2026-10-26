// Tiny static file server for previews and end-to-end tests (no dependencies).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!p.startsWith(base)) {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    p = p.slice(base.length - 1);
    let file = path.join(dir, p);
    if (!file.startsWith(dir)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(dir, '404.html');
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream', 'Cache-Control': file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=0' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}${base}`));
