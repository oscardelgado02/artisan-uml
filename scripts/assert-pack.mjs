// Guard: the published tarball must contain the built editor.
//
// Why: dist/ is gitignored and "files": ["dist"] silently packs nothing when
// the checkout was never built — that is exactly how artisan-uml@1.2.1 shipped
// without dist/ and every artisan-uml-cli install lost its editor.
// Runs as postpack (after the tarball is written) and in CI before publishing.

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tgz = join(process.cwd(), `${pkg.name}-${pkg.version}.tgz`);
const WANTED = 'package/dist/index.html';

if (existsSync(tgz)) {
  const names = listTgz(tgz);
  if (!names.includes(WANTED)) {
    console.error(`✗ ${tgz} does not contain ${WANTED}`);
    console.error(`  packed: ${names.filter((n) => n.startsWith('package/')).join(', ') || '(empty)'}`);
    process.exit(1);
  }
  console.log(`✓ ${tgz} contains ${WANTED}`);
} else {
  const built = new URL('../dist/index.html', import.meta.url);
  if (!existsSync(built)) {
    console.error('✗ dist/index.html is missing — run `pnpm build` before packing');
    process.exit(1);
  }
  console.log('✓ dist/index.html is present (no tarball to inspect)');
}

// Minimal tar reader: 512-byte headers, octal size, files padded to 512.
function listTgz(file) {
  const buf = gunzipSync(readFileSync(file));
  const names = [];
  for (let off = 0; off + 512 <= buf.length; ) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.toString('ascii', off + 124, off + 136).replace(/\0.*$/, '').trim() || '0', 8);
    const type = buf.toString('ascii', off + 156, off + 157);
    if (type === '0' || type === '\0') names.push(name);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}
