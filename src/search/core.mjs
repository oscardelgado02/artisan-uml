// Pure search matcher, shared like layout-constants.mjs so the contract test
// can run it without a TS loader. No DOM, no editor state.
export function tokenize(query) {
  return String(query).toLowerCase().split(/\s+/).filter(Boolean);
}

// AND semantics: every token must appear somewhere in the (lowercased) text.
export function matchesTokens(tokens, text) {
  if (!tokens.length) return false;
  return tokens.every(t => text.includes(t.toLowerCase()));
}

export function searchableText(parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}
