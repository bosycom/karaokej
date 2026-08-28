import { StatementSync, type SQLInputValue } from 'node:sqlite';

export interface Statement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

function coerceValue(value: unknown): unknown {
  if (typeof value !== 'bigint') {
    return value;
  }
  if (
    value <= BigInt(Number.MAX_SAFE_INTEGER) &&
    value >= BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Number(value);
  }
  return null;
}

function coerceRow(row: unknown): unknown {
  if (row == null || typeof row !== 'object') {
    return row;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    out[key] = coerceValue(value);
  }
  return out;
}

export function wrapStatement(stmt: StatementSync): Statement {
  stmt.setReadBigInts(true);
  return {
    run: (...params: unknown[]) => stmt.run(...(params as SQLInputValue[])),
    get: (...params: unknown[]) => {
      const row = stmt.get(...(params as SQLInputValue[]));
      return row == null ? row : coerceRow(row);
    },
    all: (...params: unknown[]) =>
      stmt.all(...(params as SQLInputValue[])).map((row) => coerceRow(row)),
  };
}
