import { nodeById, state } from './model';
import type { UmlEdge } from './model';
import { applyCam, fitView, renderAll } from './render';
import { loadInto, pushPre, save, serialize } from './storage';
import type { SerializedDiagram } from './storage';

function toPlantUML(): string {
  const L: string[] = ['@startuml', ''];
  const arrowOf = (k: UmlEdge['kind']): string =>
    (
      {
        inheritance: '<|--',
        realization: '<|..',
        composition: '*--',
        aggregation: 'o--',
        dependency: '..>',
        association: '-->',
      } as Record<UmlEdge['kind'], string>
    )[k] ?? '-->';
  for (const n of state.nodes) {
    const kw = n.kind === 'abstract' ? 'abstract class' : n.kind;
    L.push(`${kw} "${n.name || 'Unnamed'}" {`);
    for (const m of n.attributes) {
      if (n.kind === 'enum') {
        L.push(`  ${m.name || 'unnamed'}${m.type ? ' = ' + m.type : ''}`);
        if (m.note) L.push(`  .. note: ${m.note}`);
        continue;
      }
      const mods = m.mods.length ? ' ' + m.mods.join(' ') : '';
      const type = m.type ? ` : ${m.type}` : '';
      L.push(`  ${m.vis}${mods} ${m.name || 'unnamed'}${type}`);
      if (m.note) L.push(`  .. note: ${m.note}`);
    }
    for (const m of n.methods) {
      const mods = m.mods.length ? ' ' + m.mods.join(' ') : '';
      const type = m.type ? ` : ${m.type}` : '';
      L.push(`  ${m.vis}${mods} ${m.name || 'unnamed'}(${m.params ?? ''})${type}`);
      if (m.note) L.push(`  .. note: ${m.note}`);
    }
    L.push('}');
    if (n.note) L.push(`note on ${n.name || 'Unnamed'}: ${n.note}`);
    L.push('');
  }
  for (const e of state.edges) {
    const a = nodeById(e.from)?.name || 'Unnamed';
    const b = nodeById(e.to)?.name || 'Unnamed';
    const arrow = arrowOf(e.kind);
    const fm = e.fromMult ? ` "${e.fromMult}"` : '';
    const tm = e.toMult ? ` "${e.toMult}"` : '';
    const lbl = e.label ? ` : ${e.label}` : '';
    L.push(`${a}${fm} ${arrow}${tm} ${b}${lbl}`);
  }
  if (state.projectNotes.trim()) {
    L.push('');
    L.push('note as projectNotes');
    for (const line of state.projectNotes.trim().split('\n')) L.push(`  ${line}`);
    L.push('end note');
  }
  L.push('');
  L.push('@enduml');
  return L.join('\n');
}

function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(): void {
  downloadFile('uml-diagram.json', serialize(), 'application/json');
}

export function copyPlantUML(): void {
  const text = toPlantUML();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => undefined,
      () => fallbackCopy(text)
    );
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* clipboard unavailable */
  }
  ta.remove();
}

export function downloadPlantUML(): void {
  downloadFile('uml-diagram.puml', toPlantUML(), 'text/plain');
}

export function importJSONFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as SerializedDiagram;
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('bad');
      pushPre();
      loadInto(data);
      renderAll();
      applyCam();
      fitView();
      save();
    } catch {
      /* invalid file */
    }
  };
  reader.readAsText(file);
}
