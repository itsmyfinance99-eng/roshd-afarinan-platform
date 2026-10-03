/**
 * Immutable reads and writes in the draft of a financial model, by path. The draft is plain JSON
 * (objects, arrays, strings, numbers, booleans); every write returns a new draft and shares the
 * untouched parts with the old one.
 */

export type Path = readonly (string | number)[];
export type Draft = Record<string, unknown>;

export const pathKey = (path: Path): string => path.join('.');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function getIn(root: unknown, path: Path): unknown {
  let node = root;
  for (const key of path) {
    if (Array.isArray(node)) {
      node = typeof key === 'number' ? node[key] : undefined;
    } else if (isRecord(node) && Object.hasOwn(node, key)) {
      node = node[key];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * Writes `value` at `path`, creating the objects and arrays on the way (an array where the next
 * key is a number). `undefined` removes a property of an object; in an array it leaves a hole
 * for the caller to avoid — list items are removed with `removeAt`.
 */
export function setIn<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [key, ...rest] = path as [string | number, ...(string | number)[]];
  if (typeof key === 'number') {
    const list = Array.isArray(root) ? [...(root as unknown[])] : [];
    list[key] = setIn(list[key], rest, value);
    return list as T;
  }
  const record: Record<string, unknown> = isRecord(root) ? { ...root } : {};
  const next = setIn(Object.hasOwn(record, key) ? record[key] : undefined, rest, value);
  if (next === undefined && rest.length === 0) delete record[key];
  else
    Object.defineProperty(record, key, {
      value: next,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return record as T;
}

/** The list at `path`, or an empty one. */
export function listAt(root: unknown, path: Path): unknown[] {
  const value = getIn(root, path);
  return Array.isArray(value) ? value : [];
}

/** The object at `path`, or an empty one. */
export function recordAt(root: unknown, path: Path): Record<string, unknown> {
  const value = getIn(root, path);
  return isRecord(value) ? value : {};
}

export function append<T>(root: T, path: Path, item: unknown): T {
  return setIn(root, path, [...listAt(root, path), item]);
}

export function removeAt<T>(root: T, path: Path, index: number): T {
  return setIn(
    root,
    path,
    listAt(root, path).filter((_, i) => i !== index),
  );
}

/** A text value at `path` ('' when absent or not text). */
export function textAt(root: unknown, path: Path): string {
  const value = getIn(root, path);
  return typeof value === 'string' ? value : '';
}
