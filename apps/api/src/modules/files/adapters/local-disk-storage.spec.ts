import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidObjectKeyError, ObjectNotFoundError } from '../ports/file-storage';
import { LocalDiskStorage, readAll } from './local-disk-storage';

describe('LocalDiskStorage (FileStorageProvider contract)', () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'roshd-storage-'));
    storage = new LocalDiskStorage(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores and reads back buffers and streams', async () => {
    const info = await storage.put('users/u1/doc.pdf', Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(info).toEqual({ key: 'users/u1/doc.pdf', size: 8 });
    expect((await readAll(await storage.get('users/u1/doc.pdf'))).toString()).toBe('%PDF-1.7');

    await storage.put('users/u1/stream.txt', Readable.from(['a', 'b']), 'text/plain');
    expect((await readAll(await storage.get('users/u1/stream.txt'))).toString()).toBe('ab');
  });

  it('reports missing objects and deletes idempotently', async () => {
    await expect(storage.get('missing/key')).rejects.toBeInstanceOf(ObjectNotFoundError);
    await storage.put('a/b', Buffer.from('x'), 'text/plain');
    expect(await storage.exists('a/b')).toBe(true);
    await storage.delete('a/b');
    await storage.delete('a/b');
    expect(await storage.exists('a/b')).toBe(false);
  });

  it.each(['../escape', 'a/../../etc/passwd', '/absolute', 'UPPER/case', 'a//b', 'a\\b', ''])(
    'rejects unsafe key %j',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(
        InvalidObjectKeyError,
      );
    },
  );

  it('passes its health check', async () => {
    await expect(storage.healthCheck()).resolves.toBeUndefined();
  });
});
