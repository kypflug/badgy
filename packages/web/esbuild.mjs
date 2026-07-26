import { copyFile, cp, mkdir } from 'node:fs/promises';
import { build, context } from 'esbuild';

const serve = process.argv.includes('--serve');
const outdir = 'dist';

const define = {
  __MSAL_CLIENT_ID__: JSON.stringify(process.env.MSAL_CLIENT_ID ?? ''),
  __MSAL_AUTHORITY__: JSON.stringify(
    process.env.MSAL_AUTHORITY ?? 'https://login.microsoftonline.com/consumers',
  ),
};

/** @type {import('esbuild').BuildOptions} */
const appOpts = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !serve,
  outdir,
  loader: { '.svg': 'text' },
  external: ['/favicon.svg'],
  define,
};

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  await copyFile('index.html', `${outdir}/index.html`);
  await copyFile('staticwebapp.config.json', `${outdir}/staticwebapp.config.json`).catch(() => {});
  await cp('public', outdir, { recursive: true }).catch(() => {});
}

async function buildSw() {
  await build({
    entryPoints: ['src/sw.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    outfile: `${outdir}/sw.js`,
    minify: !serve,
  });
}

await copyStatic();
await buildSw();

if (serve) {
  const ctx = await context(appOpts);
  await ctx.watch();
  // SPA fallback so org routes like /amazon resolve locally the way SWA rewrites them in prod.
  const { port } = await ctx.serve({
    servedir: outdir,
    fallback: `${outdir}/index.html`,
    port: 5173,
  });
  console.log(`web dev server: http://localhost:${port}`);
} else {
  await build(appOpts);
  console.log('web build complete');
}
