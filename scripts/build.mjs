// Production build: esbuild (TypeScript/React) + Tailwind CSS v4 (compile API) +
// PWA manifest + hand-rolled service worker with a hashed precache list.
// Output uses relative URLs so the same build works at any GitHub Pages subpath.
import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, process.env.OUT_DIR ?? 'dist');
const watch = process.argv.includes('--watch');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildTime = new Date().toISOString();

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
function hash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

async function buildCss() {
  const tw = path.dirname(require.resolve('tailwindcss/package.json'));
  const input = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  const compiler = await compile(input, {
    base: path.join(root, 'src'),
    loadStylesheet: async (id, base) => {
      let p;
      if (id === 'tailwindcss') p = path.join(tw, 'index.css');
      else if (id.startsWith('tailwindcss/')) p = path.join(tw, id.slice('tailwindcss/'.length));
      else p = path.resolve(base, id);
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
  const candidates = new Set();
  for (const f of walk(path.join(root, 'src')).filter((f) => /\.(tsx?|html)$/.test(f))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/[A-Za-z0-9_:\-\[\]\/.%#(),!@&>~+=*'"]+/g)) {
      for (const t of m[0].split(/["'`]/)) if (t && t.length < 120) candidates.add(t);
    }
  }
  const css = compiler.build([...candidates]);
  const min = await (await import('esbuild')).transform(css, { loader: 'css', minify: true });
  return min.code;
}

async function main() {
  rm(out);
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  // 1) JavaScript
  const result = await build({
    entryPoints: [path.join(root, 'src/main.tsx')],
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir: path.join(out, 'assets'),
    entryNames: 'app-[hash]',
    chunkNames: 'chunk-[hash]',
    assetNames: 'asset-[hash]',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    target: ['es2022', 'safari16'],
    jsx: 'automatic',
    loader: { '.json': 'json' },
    metafile: true,
    legalComments: 'linked',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME__: JSON.stringify(buildTime),
      'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
    },
    logLevel: 'warning',
  });
  const entry = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint)?.[0];
  const entryFile = path.basename(entry);
  // 2) CSS
  const css = await buildCss();
  const cssName = `app-${hash(css)}.css`;
  fs.writeFileSync(path.join(out, 'assets', cssName), css);
  // 3) pdf.js worker (loaded on demand when a PDF is imported)
  const pdfDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  fs.copyFileSync(path.join(pdfDir, 'build/pdf.worker.min.mjs'), path.join(out, 'assets', 'pdf.worker.min.mjs'));
  // 4) public files (icons)
  const pub = path.join(root, 'public');
  if (fs.existsSync(pub)) for (const f of walk(pub)) {
    const rel = path.relative(pub, f);
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.copyFileSync(f, path.join(out, rel));
  }
  // 5) manifest
  const manifest = {
    name: 'THREE X | Venture Intelligence',
    short_name: 'THREE X VI',
    description: 'Cross-border investment, tax and FIBA 3x3 business intelligence — offline-first.',
    start_url: './#/overview',
    scope: './',
    id: './',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f5f5f7',
    theme_color: '#f5f5f7',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
  // 6) index.html
  const html = fs
    .readFileSync(path.join(root, 'src/index.html'), 'utf8')
    .replace('%CSS%', `assets/${cssName}`)
    .replace('%JS%', `assets/${entryFile}`)
    .replace('%VERSION%', pkg.version);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, '404.html'), html);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  // 7) service worker with precache list
  const files = walk(out)
    .map((f) => path.relative(out, f).split(path.sep).join('/'))
    .filter((f) => !f.endsWith('.map') && f !== 'sw.js' && f !== '404.html' && f !== '.nojekyll' && !f.endsWith('.LEGAL.txt'));
  const version = hash(files.map((f) => f + fs.statSync(path.join(out, f)).size).join('|') + buildTime);
  const sw = fs.readFileSync(path.join(root, 'src/sw.template.js'), 'utf8').replace('__PRECACHE__', JSON.stringify(['./', ...files])).replace('__VERSION__', version);
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  const size = files.reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
  console.log(`Built ${files.length} files (${(size / 1024 / 1024).toFixed(2)} MB) → ${path.relative(root, out)}/  [sw ${version}]`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
