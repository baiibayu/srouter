// Runs from server/prepack (npm pack & npm publish): stage everything the
// published @srouter/server tarball needs that does not live under server/.
//   - client/dist  -> server/client/dist  (the dashboard the server serves;
//     inside the installed package its lookup lands on <package>/client/dist,
//     the second candidate after the dev-checkout path)
//   - root LICENSE -> server/LICENSE      (npm surfaces the package-dir file)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDist = path.join(root, 'client', 'dist');

if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('[pack] client/dist/index.html is missing — run `npm run build -w client` first.');
  process.exit(1);
}
fs.rmSync(path.join(root, 'server', 'client'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'server', 'client'), { recursive: true });
// cpSync clones the source directory itself, so the destination must be the
// final `dist` path — landing index.html at server/client/index.html would
// both miss the package.json `files` entry and break the runtime lookup.
fs.cpSync(clientDist, path.join(root, 'server', 'client', 'dist'), { recursive: true });
if (!fs.existsSync(path.join(root, 'server', 'client', 'dist', 'index.html'))) {
  console.error('[pack] staging failed: server/client/dist/index.html is missing.');
  process.exit(1);
}

const license = path.join(root, 'LICENSE');
if (fs.existsSync(license)) {
  fs.copyFileSync(license, path.join(root, 'server', 'LICENSE'));
}
console.log('[pack] staged server/client/dist and server/LICENSE');
