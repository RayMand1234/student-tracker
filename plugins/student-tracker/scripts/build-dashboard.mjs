// Builds dashboard/index.html (the published page) from page.html with derive.mjs inlined.
// `node scripts/build-dashboard.mjs` writes it; tests import buildDashboard() to check it's current.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../dashboard/', import.meta.url);
const MARK = '/* @inline derive.mjs */';

export function buildDashboard() {
  const page = fs.readFileSync(new URL('page.html', dir), 'utf8');
  const derive = fs.readFileSync(new URL('derive.mjs', dir), 'utf8').replace(/^export /gm, '');
  if (!page.includes(MARK)) throw new Error(`page.html lacks ${MARK}`);
  return page.replace(MARK, () => derive.trimEnd());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(new URL('index.html', dir), buildDashboard());
}
