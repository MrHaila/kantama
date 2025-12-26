declare module 'topojson-client' {
  export function feature(topology: unknown, object: unknown): unknown
  export function mesh(topology: unknown, object: unknown): unknown
  export function meshArcs(topology: unknown, object?: unknown): unknown
  export function merge(topology: unknown, objects: unknown): unknown
  export function neighbors(objects: unknown[]): unknown[]
}
