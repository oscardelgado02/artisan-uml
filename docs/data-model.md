# Data model

Diagrams are plain JSON. The editor autosaves this shape to `localStorage`,
export downloads it, and import accepts it back.

```ts
interface Member {
  id: string;
  vis: '+' | '-' | '#' | '~';
  name: string;
  type: string;          // attribute type / method return type
  mods: string[];        // static, abstract, readonly, ...
  params: string | null; // method parameters, e.g. "dx: int, dy: int"
}

interface UmlNode {
  id: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum' | 'record' | 'struct';
  name: string;
  x: number; y: number;
  attributes: Member[];
  methods: Member[];
}

interface UmlEdge {
  id: string;
  kind: 'association' | 'inheritance' | 'realization' | 'dependency'
      | 'aggregation' | 'composition';
  from: string; to: string;   // node ids
  label: string;
  fromMult: string; toMult: string;
}
```

## Layout contract

`layout-constants.mjs` holds the box-size math (character width, node cap,
wrap budgets) that both the in-editor auto-layout and the CSS wrap rules use.
If you change the constants or the JSON shape, bump `CONTRACT_VERSION` —
`pnpm test` fails loudly if the constants and the CSS drift apart.
