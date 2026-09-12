// Editor package contract test. No framework: plain asserts, run via `pnpm test`.
// Guards the two things the artisan-uml CLI relies on:
//   1. layout-constants.mjs exports the shared knobs + CONTRACT_VERSION
//   2. style.css keeps the wrap contract (name/params wrap, locked parts don't)
import assert from 'node:assert/strict';
import fs from 'node:fs';

const here = new URL('..', import.meta.url); // package root

const C = await import(new URL('layout-constants.mjs', here).href);
for (const k of ['CHAR_PX', 'NODE_MAX_PX', 'NODE_MIN_PX', 'ROW_PAD', 'NOTE_GLYPH', 'NAME_CAP', 'NAME_FLOOR', 'PARAMS_CAP', 'PARAMS_FLOOR', 'CONTRACT_VERSION']) {
  assert.equal(typeof C[k], 'number', `layout-constants.${k} is a number`);
}
assert.ok(Number.isInteger(C.CONTRACT_VERSION), 'CONTRACT_VERSION is an integer');
assert.equal(C.NODE_MAX_PX, 640, 'NODE_MAX_PX matches style.css .node max-width');
console.log('  ok - layout-constants exports shared knobs + CONTRACT_VERSION');

// Our own layered engine: three nodes, parent above child, no overlap.
const { layeredLayout } = await import(new URL('layout.mjs', here).href);
const nodes = [
  { id: 'p', name: 'Base', width: 200, height: 100, x: 0, y: 0 },
  { id: 'a', name: 'KidA', width: 200, height: 100, x: 0, y: 0 },
  { id: 'b', name: 'KidB', width: 200, height: 100, x: 0, y: 0 },
];
layeredLayout(nodes, [{ from: 'a', to: 'p', kind: 'inheritance' }, { from: 'b', to: 'p', kind: 'inheritance' }]);
assert.ok(nodes[0].y < nodes[1].y && nodes[0].y < nodes[2].y, 'parent ranks above children');
assert.ok(nodes[1].x !== nodes[2].x, 'siblings separated');
for (let i = 0; i < nodes.length; i++)
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i];
    const b = nodes[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'no overlaps');
  }
console.log('  ok - layeredLayout: parent above children, no overlaps');

const pkg = JSON.parse(fs.readFileSync(new URL('package.json', here), 'utf8'));
assert.equal(pkg.name, 'artisan-uml', 'package name');
assert.ok(pkg.files.includes('dist') && pkg.files.includes('layout-constants.mjs'), 'npm files ship dist + constants');
assert.ok(pkg.exports['./layout-constants.mjs'], 'exports expose layout-constants');
console.log('  ok - package.json ships dist + layout-constants');

// CSS contract the CLI's size estimates mirror (name + params wrap, locked parts never do)
const css = fs.readFileSync(new URL('src/style.css', here), 'utf8');
const block = (sel) => css.slice(css.indexOf(sel + ' {'), css.indexOf('}', css.indexOf(sel + ' {')));
const mname = block('.m-name');
assert.match(mname, /white-space:\s*pre-line/, '.m-name wraps pre-line');
assert.match(mname, new RegExp(`max-width:\\s*${C.NAME_CAP}px`), '.m-name capped at NAME_CAP');
const mparams = block('.m-params');
assert.match(mparams, /white-space:\s*pre-line/, '.m-params wraps pre-line');
assert.match(mparams, new RegExp(`max-width:\\s*${C.PARAMS_CAP}px`), '.m-params capped at PARAMS_CAP');
const member = block('.member');
assert.match(member, /white-space:\s*nowrap/, '.member row stays one line for locked parts');
for (const part of ['.m-type', '.m-mods', '.m-vis']) {
  assert.doesNotMatch(block(part), /white-space:\s*normal|white-space:\s*pre-line|overflow-wrap/, part + ' must never wrap');
}
const node = block('.node');
assert.match(node, new RegExp(`max-width:\\s*${C.NODE_MAX_PX}px`), '.node max-width matches NODE_MAX_PX');
console.log('  ok - CSS contract: name/params wrap, locked parts nowrap, node cap matches constants');

console.log('\nAll editor contract checks passed.');
