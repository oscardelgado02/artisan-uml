# Editing

## Creating classes

- **Node button** in the toolbar, **double-click empty canvas**, or
  **right-click canvas** → *Add class*.
- New classes get a default name and start inline-renamed immediately.

## Class kinds

Class, abstract class, interface, enum, record, struct. Interfaces show
properties + methods; enums show values only (`Name = 1`, value optional);
everything else has attributes + methods. Stereotypes like `«interface»` /
`«enum»` are shown on the header.

## Selecting vs editing

- **Click** a class body to **select** it (animated ring appears).
- **Drag** a class to move it — the ring shows during the drag and reverts
  if the class was not selected before.
- With a class **already selected**, click its **name**, **attributes** or
  **methods** to edit them in place.
- **Add buttons always work** — `+ attribute` / `+ method` / `+ value`
  never require prior selection.

## Member editor

Click any member row (on a selected class) to edit:

- **Visibility**: `+` public, `-` private, `#` protected, `~` internal
- **Name** and **type** (attribute) or **return type** (method)
- **Parameters**, e.g. `dx: int, dy: int`
- **Modifier chips**: `static`, `abstract`, `readonly`, `virtual`, `override`,
  `sealed`, `async`, `const`

## Syntax coloring

Member rows are color-coded in every theme: names use the foreground color,
visibility is **orange**, types are **cyan**, modifiers are **purple**.

## Renaming

Click the class name (on a selected class) or right-click → *Rename*. The
input keeps the box at its current size while you type — the box only
re-measures when you commit with `Enter` (or `Esc` to cancel).

## Project notes

The **Notes** button opens a project-wide notes editor. Classes, members and
relations each accept their own note (right-click → *Add note*).
