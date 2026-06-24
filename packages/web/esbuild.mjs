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
  define: {
    __MSAL_CLIENT_ID__: JSON.stringify(process.env.MSAL_CLIENT_ID ?? ''),
    __MSAL_AUTHORITY__: JSON.stringify(
      process.env.MSAL_AUTHORITY ?? 'https://login.microsoftonline.com/common',
    ),
  },
};

await mkdir(outdir, { recursive: true });
await copyFile('index.html', `${outdir}/index.html`);
try {
  await copyFile('staticwebapp.config.json', `${outdir}/staticwebapp.config.json`);
} catch {
  // optional — only needed for Azure Static Web Apps
}

if (serve) {
  const ctx = await context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: 5173 });
  console.log(`web dev server: http://localhost:${port}`);
} else {
  await build(opts);
  console.log('web build complete');
}
