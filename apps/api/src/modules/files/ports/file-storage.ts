import type { Readable } from 'node:stream';

/**
 * Port for object storage (ADR-0004, OQ-10). Keys are opaque, server-generated paths
 * (never user input). Objects are private; access goes through the Files module,
 * which checks authorization and issues short-lived signed URLs.
 */
export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface StoredObjectInfo {
  key: string;
  size: number;
}

export interface FileStorageProvider {
  readonly driver: string;
  put(key: string, body: Buffer | Readable, contentType: string): Promise<StoredObjectInfo>;
  /** Throws `ObjectNotFoundError` when the key does not exist. */
  get(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  /** Idempotent: deleting a missing key succeeds. */
  delete(key: string): Promise<void>;
  /** Readiness probe for /health/ready. */
  healthCheck(): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export class InvalidObjectKeyError extends Error {
  constructor(key: string) {
    super(`Invalid object key: ${key}`);
    this.name = 'InvalidObjectKeyError';
  }
}

/** Keys: lowercase segments of [a-z0-9._-] separated by "/", no traversal, no leading slash. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

export function assertValidObjectKey(key: string): void {
  if (key.length > 512 || !KEY_PATTERN.test(key) || key.split('/').some((s) => s === '..')) {
    throw new InvalidObjectKeyError(key);
  }
}
