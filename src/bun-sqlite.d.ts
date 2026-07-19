/**
 * Ambient type declarations for bun:sqlite.
 * Bun's runtime includes SQLite natively, but TypeScript needs these
 * declarations since @types/bun is not installed.
 */

declare module 'bun:sqlite' {
  export interface Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): void;
  }

  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean });

    query(sql: string): Statement;
    run(sql: string, ...params: unknown[]): void;
    prepare(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
    transaction(fn: () => unknown): () => unknown;
  }
}
