// Runs from cli/prepack (npm pack & npm publish): stage everything the
// published @baiibayu/srouter tarball needs beyond the CLI's own build.
//   - server/dist          -> cli/server/dist          (the gateway; serve.ts
//     resolves it as ../server/dist/index.js relative to dist/)
//   - client/dist          -> cli/client/dist          (the dashboard; app.ts's
//     first lookup candidate is ../../client/dist from server/dist)
//   - desktop/package.json -> cli/desktop/package.json (the release number the
//     dashboard's version row walks up to find, app-version.ts)
// cli/LICENSE stays untouched: it is tracked in git and npm packs a
// package-dir LICENSE on its own.
// `--clean` (cli/postpack) removes the staging again so a source checkout
// keeps resolving the gateway from the sibling workspace, never from stale
// copies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli');
const staged = [
  path.join(cli, 'server'),
  path.join(cli, 'client'),
  path.join(cli, 'desktop'),
];

if (process.argv.includes('--clean')) {
  for (const target of staged) fs.rmSync(target, { recursive: true, force: true });
  console.log('[pack] cleaned cli staging');
  process.exit(0);
}

const serverDist = path.join(root, 'server', 'dist');
const clientDist = path.join(root, 'client', 'dist');
if (!fs.existsSync(path.join(serverDist, 'index.js'))) {
  console.error('[pack] server/dist/index.js is missing — run `npm run build -w server` first.');
  process.exit(1);
}
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('[pack] client/dist/index.html is missing — run `npm run build -w client` first.');
  process.exit(1);
}

for (const target of staged) fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.join(cli, 'server'), { recursive: true });
fs.mkdirSync(path.join(cli, 'client'), { recursive: true });
fs.mkdirSync(path.join(cli, 'desktop'), { recursive: true });
// cpSync clones the source directory itself, so the destination must be the
// final path — landing index.html at cli/client/index.html would both miss
// the package.json `files` entry and break app.ts's ../../client/dist lookup.
fs.cpSync(serverDist, path.join(cli, 'server', 'dist'), { recursive: true });
fs.cpSync(clientDist, path.join(cli, 'client', 'dist'), { recursive: true });
fs.copyFileSync(path.join(root, 'desktop', 'package.json'), path.join(cli, 'desktop', 'package.json'));

for (const probe of [
  path.join(cli, 'server', 'dist', 'index.js'),
  path.join(cli, 'client', 'dist', 'index.html'),
  path.join(cli, 'desktop', 'package.json'),
]) {
  if (!fs.existsSync(probe)) {
    console.error(`[pack] staging failed: ${path.relative(root, probe)} is missing.`);
    process.exit(1);
  }
}
console.log('[pack] staged cli/server/dist, cli/client/dist, cli/desktop/package.json');
