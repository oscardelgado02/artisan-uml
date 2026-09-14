# Security Policy

## Supported versions

Only the latest release of `artisan-uml` receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Use [GitHub private vulnerability reporting](https://github.com/oscardelgado02/artisan-uml/security/advisories/new)
— it is the fastest, most private channel.

## Scope

Artisan UML is a fully client-side application: no server, no authentication,
no analytics. Diagram data lives in the browser's `localStorage` and in JSON
files you export/import yourself.

Areas worth scrutiny:

- **JSON import** — the editor parses untrusted `.json` diagram files
  (`exporters.ts`, `storage.ts`). Malformed or malicious files should fail
  safely, never execute anything.
- **XSS via text input** — class names, members, notes and labels are rendered
  into HTML elements; they must never be injected as markup.
- **File System Access autosave** (`Connect file`) writes only to the file the
  user explicitly picked.

Out of scope: the dev server (`vite dev`), build tooling vulnerabilities, and
anything requiring a malicious dependency install.
