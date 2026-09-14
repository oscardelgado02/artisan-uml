# Relations

## Creating a relation

Three ways:

1. **Drag a node's border** (the outer ~8 px ring, crosshair cursor) onto
   another node — a menu pops up to pick the relation kind. Drop it on the
   same node for a **self-relation** (e.g. a singleton).
2. **Right-drag** from a node to a node — same menu on drop.
3. Pick a relation in the toolbar, then click the **source** node and the
   **target** node (`Esc` or a click on empty canvas cancels).

## The six UML relations

| Relation | Notation |
| --- | --- |
| Inheritance (extends) | solid line + hollow triangle |
| Realization (implements) | dashed line + hollow triangle |
| Composition (owns) | filled diamond at the owner |
| Aggregation (has-a) | hollow diamond at the owner |
| Association | solid line + open arrow |
| Dependency | dashed line + open arrow |

Self-relations render as a small loop on the right side of the node.

## Editing a relation

Click any relation to edit its **type, label and multiplicities**
(`1`, `0..*`, …), reverse it, or delete it.

## Line styles

Pick a routing style in the toolbar — **straight**, **rectangular**,
**smooth** (rounded bends) or **curves** (fewest-bend splines). The style is
persisted per diagram. Parallel relations between the same two classes run
as separate lanes.

## Color links

The **Color links** toggle paints every relation (lines *and* arrows) in a
blue accent so they stand out from the class boxes. The color adapts to the
active theme.
