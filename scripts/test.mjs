// Esegue i test: li compila con esbuild in un unico file e li lancia con il test runner di Node.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '.tmp', 'tests');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const entries = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts')).map((f) => join(root, 'tests', f));

await build({
  entryPoints: entries,
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'warning',
  alias: { '@supabase/supabase-js': join(root, 'tests', 'stubs', 'supabase.ts') },
});

const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...entries.map((f) => join(out, f.split('/').pop().replace(/\.ts$/, '.mjs')))], { stdio: 'inherit', env: { ...process.env, TZ: 'Europe/Rome' } });
process.exit(r.status ?? 1);
