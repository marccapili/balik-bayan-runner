// The project has no @types/node; this is the one Node API the unit tests use (reading shipped GLBs).
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
