// build.ts
import { build } from 'esbuild';

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: ['node20'],
  // Don't specify format - defaults to CommonJS for Node.js platform
  // This matches the working example in 064-MONO project
  // Bundle everything - no external dependencies
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
