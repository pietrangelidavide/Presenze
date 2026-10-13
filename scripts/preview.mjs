// Compila l'app con esbuild in una pagina sola (HTML + CSS + JS dentro lo stesso file), per provarla e per le anteprime
// fuori da Cloudflare. Non serve Vite. Scrive in dist/ (che non va nel repo):
//   dist/anteprima.html  pagina intera, si apre con un doppio clic
//   dist/artifact.html   solo il contenuto, senza <html>/<head>/<body>, per le anteprime incorporate
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const r = await build({
  entryPoints: [join(root, 'scripts', 'preview-entry.tsx')],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic', write: false, outdir: join(dist, 'tmp'), logLevel: 'warning',
  alias: { '@supabase/supabase-js': join(root, 'tests', 'stubs', 'supabase.ts') },
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined', 'process.env.NODE_ENV': '"production"' },
});
const js = r.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = r.outputFiles.find((f) => f.path.endsWith('.css')).text;

const themeInit = `try{var t=localStorage.getItem('presenze-tema');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
const body = `<div id="root"></div><script>${themeInit}</script><script>${js}</script>`;

writeFileSync(join(dist, 'artifact.html'), `<title>Presenze Stile Apple</title><style>${css}</style>${body}`);
writeFileSync(join(dist, 'anteprima.html'), `<!doctype html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex"><title>Presenze</title><style>${css}</style></head><body>${body}</body></html>`);
console.log(`anteprima.html ${(css.length + js.length) / 1024 | 0} KB`);
