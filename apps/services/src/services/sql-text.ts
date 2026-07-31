import type { SqlParamDef } from '../types';

/**
 * Extract named placeholders (`:name`) from SQL, preserving first-seen order.
 * Skips quoted strings and PostgreSQL `::type` casts (same rules as parse rewrite).
 */
export function extractNamedParams(sql: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }

    if (ch === ':' && next === ':') {
      i += 2;
      continue;
    }

    if (ch === ':' && next && /[A-Za-z_]/.test(next)) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) {
        j += 1;
      }
      const name = sql.slice(i + 1, j);
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
      i = j;
      continue;
    }

    i += 1;
  }

  return names;
}

/**
 * Align AI-emitted params with placeholders actually present in SQL:
 * keep defs for names that appear, fill missing with required|string, drop extras.
 */
export function reconcileSqlParams(
  sql: string,
  params?: SqlParamDef[] | null
): SqlParamDef[] {
  const names = extractNamedParams(sql);
  const byName = new Map<string, SqlParamDef>();
  for (const p of params || []) {
    if (p && typeof p.name === 'string' && p.name && !byName.has(p.name)) {
      byName.set(p.name, {
        name: p.name,
        rule: p.rule || 'required|string',
        description: p.description,
        default: p.default
      });
    }
  }
  return names.map((name) => {
    const existing = byName.get(name);
    if (existing) {
      return existing;
    }
    return { name, rule: 'required|string' };
  });
}

/**
 * Split a SQL script into top-level statements by `;`.
 * Skips content inside single/double quotes and `--` / `#` / `/* *\/` comments.
 * Empty segments (whitespace-only) are discarded.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment: false | '--' | '#' = false;
  let inBlockComment = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (inSingle) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    // Line comments
    if (ch === '-' && next === '-') {
      inLineComment = '--';
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '#') {
      inLineComment = '#';
      current += ch;
      i += 1;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}

/**
 * Scan SQL text outside of quotes/comments for a forbidden keyword at statement start
 * or as a top-level verb (used as fallback when parser fails).
 */
export function hasForbiddenKeywordOutsideQuotes(
  sql: string,
  keywords: string[]
): boolean {
  const pattern = new RegExp(
    `\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'i'
  );

  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment: false | '--' | '#' = false;
  let inBlockComment = false;
  let plain = '';

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        plain += ' ';
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        i += 2;
        inBlockComment = false;
        plain += ' ';
        continue;
      }
      i += 1;
      continue;
    }

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = '--';
      i += 2;
      continue;
    }
    if (ch === '#') {
      inLineComment = '#';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }

    plain += ch;
    i += 1;
  }

  return pattern.test(plain);
}
