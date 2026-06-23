import { build } from 'esbuild';

// Bundle our own code (including @rto/shared) into one file; keep third-party
// runtime deps external so they're installed from the deploy artifact's package.json.
const external = [
  'hono',
  '@hono/node-server',
  '@azure/data-tables',
  '@azure/identity',
  'zod',
  'dotenv',
];

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/index.js',
  sourcemap: true,
  external,
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
});
console.log('server build complete');
