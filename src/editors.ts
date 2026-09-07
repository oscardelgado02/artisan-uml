import {
  EDGE_KINDS,
  MODIFIERS,
  VISIBILITY,
  edgeById,
  esc,
  findMember,
  memberKey,
  nodeById,
  state,
} from './model';
import type { MenuEntry } from './types';
import { anchor, nodesLayer, renderAll, renderEdges, wrap } from './render';
import { consumePendingPre, pendingPre, pushPre, save, serialize } from './storage';

export const DEFAULT_HINT =
  'Double-click canvas: new class. Right-click: menus. Pick a Relation, then click two nodes to link them.';

export const activePopoverRef: { current: { el: HTMLDivElement; close: () => void } | null } = {
  current: null,
};
export const activeMenuRef: { current: HTMLDivElement | null } = { current: null };

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function setHint(msg: string): void {
  (document.getElementById('hint') as HTMLElement).textContent = msg;
}

export function toast(msg: string): void {
  const t = document.getElementById('toast') as HTMLElement;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

export function closePopovers(): void {
  if (activePopoverRef.current) {
    const p = activePopoverRef.current;
    activePopoverRef.current = null;
    p.el.remove();
    p.close();
  }
  if (activeMenuRef.current) {
    activeMenuRef.current.remove();
    activeMenuRef.current = null;
  }
}

function buildMenu(items: MenuEntry[], isSubmenu: boolean): HTMLDivElement {
  const menu = document.createElement('div');
  menu.className = 'ctx-menu' + (isSubmenu ? ' submenu' : '');
  menu.addEventListener('mousedown', e => e.stopPropagation());
  menu.addEventListener('dblclick', e => e.stopPropagation());
  for (const it of items) {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'ctx-item' + (it.danger ? ' danger' : '');
    b.innerHTML = esc(it.label) + (it.sub ? '<span class="sub-arrow">\u203A</span>' : '');
    if (it.sub) {
      const subItems = it.sub;
      b.addEventListener('mouseenter', () => {
        const old = menu.querySelector('.submenu');
        if (old) old.remove();
        const sub = buildMenu(subItems, true);
        const r = b.getBoundingClientRect();
        sub.style.left = r.right + 2 + 'px';
        sub.style.top = Math.min(r.top, window.innerHeight - 40 - subItems.length * 32) + 'px';
        menu.appendChild(sub);
        const sr = sub.getBoundingClientRect();
        if (sr.right > window.innerWidth - 8) sub.style.left = r.left - sr.width - 2 + 'px';
        if (sr.bottom > window.innerHeight - 8) sub.style.top = window.innerHeight - sr.height - 8 + 'px';
      });
    } else {
      b.addEventListener('mouseenter', () => {
        const old = menu.querySelector('.submenu');
        if (old) old.remove();
      });
      b.addEventListener('click', () => {
        closePopovers();
        it.action?.();
      });
    }
    menu.appendChild(b);
  }
  return menu;
}

export function openMenu(x: number, y: number, items: MenuEntry[]): void {
  closePopovers();
  const menu = buildMenu(items, false);
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  activeMenuRef.current = menu;
}

function positionPopover(el: HTMLDivElement, px: number, py: number): void {
  el.style.visibility = 'hidden';
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  let x = px;
  let y = py;
  if (x + r.width > window.innerWidth - 10) x = window.innerWidth - r.width - 10;
  if (y + r.height > window.innerHeight - 10) y = Math.max(10, py - r.height - 26);
  el.style.left = Math.max(10, x) + 'px';
  el.style.top = Math.max(10, y) + 'px';
  el.style.visibility = '';
}

export function openMemberEditor(nodeId: string, mid: string): void {
  closePopovers();
  const n = nodeById(nodeId);
  if (!n) return;
  const key = memberKey(n, mid);
  const m = findMember(n, mid);
  if (!m) return;
  const rowEl = nodesLayer.querySelector<HTMLElement>(`.member[data-mid="${mid}"]`);
  pendingPre.current = serialize();
  const isMethod = key === 'methods';

  const el = document.createElement('div');
  el.className = 'popover';
  el.innerHTML = `
    <div class="row">
      <select class="f-vis" title="Visibility">
        ${VISIBILITY.map(
          v => `<option value="${v.k}" ${v.k === m.vis ? 'selected' : ''}>${v.k} ${v.label}</option>`
        ).join('')}
      </select>
      <input class="f-name" placeholder="name" value="${esc(m.name)}" />
      <input class="f-type" placeholder="${isMethod ? 'return type' : 'type'}" value="${esc(m.type)}" />
    </div>
    ${
      isMethod
        ? '<input class="f-wide f-params" placeholder="parameters, e.g. dx: int, dy: int" value="' + esc(m.params ?? '') + '" />'
        : ''
    }
    <div class="chips">
      ${MODIFIERS.map(
        mod => `<button class="chip ${m.mods.includes(mod) ? 'is-active' : ''}" data-mod="${mod}">${mod}</button>`
      ).join('')}
    </div>
    <div class="actions">
      <button class="p-btn p-del">Delete member</button>
      <button class="p-btn p-done">Done</button>
    </div>`;

  const vis = el.querySelector<HTMLSelectElement>('.f-vis');
  const name = el.querySelector<HTMLInputElement>('.f-name');
  const type = el.querySelector<HTMLInputElement>('.f-type');
  const params = el.querySelector<HTMLInputElement>('.f-params');

  const bind = (input: HTMLInputElement, fn: (v: string) => void): void => {
    input.addEventListener('input', () => {
      consumePendingPre();
      fn(input.value);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') closePopovers();
      e.stopPropagation();
    });
  };
  if (name) bind(name, v => (m.name = v.trim()));
  if (type) bind(type, v => (m.type = v.trim()));
  if (params) bind(params, v => (m.params = v.trim()));
  if (vis) {
    vis.addEventListener('change', () => {
      consumePendingPre();
      m.vis = vis.value as typeof m.vis;
    });
    vis.addEventListener('keydown', e => e.stopPropagation());
  }

  el.querySelectorAll<HTMLButtonElement>('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      consumePendingPre();
      const mod = chip.dataset.mod ?? '';
      const i = m.mods.indexOf(mod);
      if (i >= 0) m.mods.splice(i, 1);
      else m.mods.push(mod);
      chip.classList.toggle('is-active');
    });
  });

  el.querySelector('.p-del')?.addEventListener('click', () => {
    consumePendingPre();
    n[key] = n[key].filter(x => x.id !== mid);
    closePopovers();
    toast('Member deleted');
  });
  el.querySelector('.p-done')?.addEventListener('click', () => closePopovers());

  el.addEventListener('mousedown', e => e.stopPropagation());
  const rect = rowEl ? rowEl.getBoundingClientRect() : null;
  positionPopover(el, rect ? rect.left : 100, rect ? rect.bottom + 6 : 100);
  activePopoverRef.current = {
    el,
    close: () => {
      renderAll();
      save();
    },
  };
  name?.focus();
  name?.select();
}

export function openEdgeEditor(eid: string): void {
  closePopovers();
  const e = edgeById(eid);
  if (!e) return;
  const a = nodeById(e.from);
  const b = nodeById(e.to);
  if (!a || !b) return;
  pendingPre.current = serialize();

  const p1 = anchor(a, b);
  const p2 = anchor(b, a);
  const r = wrap.getBoundingClientRect();
  const sx = r.left + state.cam.x + ((p1.x + p2.x) / 2) * state.cam.z;
  const sy = r.top + state.cam.y + ((p1.y + p2.y) / 2) * state.cam.z;

  const el = document.createElement('div');
  el.className = 'popover';
  el.innerHTML = `
    <div class="p-label">Relation</div>
    <select class="f-wide f-kind">
      ${Object.entries(EDGE_KINDS)
        .map(([k, d]) => `<option value="${k}" ${k === e.kind ? 'selected' : ''}>${d.label}</option>`)
        .join('')}
    </select>
    <div class="row">
      <input class="f-name f-frommult" placeholder="from mult." value="${esc(e.fromMult)}" />
      <input class="f-type f-tomult" placeholder="to mult." value="${esc(e.toMult)}" />
    </div>
    <input class="f-wide f-label" placeholder="label, e.g. owns / uses" value="${esc(e.label)}" />
    <div class="actions">
      <button class="p-btn p-del">Delete</button>
      <button class="p-btn p-rev">Reverse</button>
      <button class="p-btn p-done">Done</button>
    </div>`;

  const kind = el.querySelector<HTMLSelectElement>('.f-kind');
  const fromMult = el.querySelector<HTMLInputElement>('.f-frommult');
  const toMult = el.querySelector<HTMLInputElement>('.f-tomult');
  const label = el.querySelector<HTMLInputElement>('.f-label');

  kind?.addEventListener('change', () => {
    consumePendingPre();
    e.kind = kind.value as typeof e.kind;
    renderEdges();
    save();
  });
  const textFields: Array<[HTMLInputElement | null, (v: string) => void]> = [
    [fromMult, v => (e.fromMult = v)],
    [toMult, v => (e.toMult = v)],
    [label, v => (e.label = v)],
  ];
  for (const [input, fn] of textFields) {
    if (!input) continue;
    input.addEventListener('input', () => {
      consumePendingPre();
      fn(input.value);
      renderEdges();
    });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') closePopovers();
      ev.stopPropagation();
    });
  }
  el.querySelector('.p-rev')?.addEventListener('click', () => {
    consumePendingPre();
    const tmp = e.from;
    e.from = e.to;
    e.to = tmp;
    renderEdges();
    save();
  });
  el.querySelector('.p-del')?.addEventListener('click', () => {
    consumePendingPre();
    state.edges = state.edges.filter(x => x.id !== eid);
    state.selected = null;
    closePopovers();
    toast('Relation deleted');
  });
  el.querySelector('.p-done')?.addEventListener('click', () => closePopovers());

  el.addEventListener('mousedown', ev => ev.stopPropagation());
  positionPopover(el, sx - 145, sy + 10);
  activePopoverRef.current = {
    el,
    close: () => {
      renderAll();
      save();
    },
  };
}

export function startRename(nodeId: string): void {
  closePopovers();
  const n = nodeById(nodeId);
  if (!n) return;
  const nameEl = nodesLayer.querySelector<HTMLElement>(`.node[data-id="${nodeId}"] .node-name`);
  if (!nameEl) return;
  const input = document.createElement('input');
  input.value = n.name;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (ok: boolean): void => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (ok && val !== n.name) {
      pushPre();
      n.name = val;
      save();
    }
    setTimeout(() => renderAll(), 0);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', () => commit(true));
  input.addEventListener('mousedown', e => e.stopPropagation());
  input.addEventListener('dblclick', e => e.stopPropagation());
}
