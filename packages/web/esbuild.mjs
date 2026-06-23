import { copyFile, mkdir } from 'node:fs/promises';
import { build, context } from 'esbuild';

const serve = process.argv.includes('--serve');
const outdir = 'dist';

/** @type {import('esbuild').BuildOptions} */
const opts = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !serve,
  outdir,
  loader: { '.svg': 'text' },
};

await mkdir(outdir, { recursive: true });
await copyFile('index.html', `${outdir}/index.html`);

if (serve) {
  const ctx = await context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: 5173 });
  console.log(`web dev server: http://localhost:${port}`);
} else {
  await build(opts);
  console.log('web build complete');
}
