// Minimal types for node:sqlite (Node 22+) used by tests only; @types/node 20 does not ship them.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): { all(...v: unknown[]): unknown[]; get(...v: unknown[]): unknown; run(...v: unknown[]): unknown };
  }
}
