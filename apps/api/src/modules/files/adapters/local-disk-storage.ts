import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  assertValidObjectKey,
  type FileStorageProvider,
  InvalidObjectKeyError,
  ObjectNotFoundError,
  type StoredObjectInfo,
} from '../ports/file-storage';

/**
 * Private local-disk storage for development and single-node deployments.
 * The root directory must live outside any web-served directory.
 */
export class LocalDiskStorage implements FileStorageProvider {
  readonly driver = 'local';
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  async put(key: string, body: Buffer | Readable, _contentType: string): Promise<StoredObjectInfo> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    if (Buffer.isBuffer(body)) await writeFile(path, body);
    else await pipeline(body, createWriteStream(path));
    const { size } = await stat(path);
    return { key, size };
  }

  async get(key: string): Promise<Readable> {
    const path = this.pathOf(key);
    if (!(await this.exists(key))) throw new ObjectNotFoundError(key);
    return createReadStream(path);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathOf(key));
      return true;
    } catch (error) {
      if (error instanceof InvalidObjectKeyError) throw error;
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async healthCheck(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root);
  }

  private pathOf(key: string): string {
    assertValidObjectKey(key);
    const path = resolve(this.root, key);
    // Defence in depth: the resolved path must stay inside the storage root.
    if (!path.startsWith(this.root + sep)) throw new InvalidObjectKeyError(key);
    return path;
  }
}

/** Convenience for tests and small payloads. */
export async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}
