/**
 * BlobStore abstraction for large artifacts.
 *
 * WHAT: An interface for storing/retrieving large opaque payloads (scraped page
 *       content, raw provider responses) plus a local-disk implementation.
 * WHY:  Large documents must NOT live in relational rows. The DB stores only a
 *       small pointer (a "ref"); the bytes live here. Keeps rows lean and lets
 *       us swap local disk for Azure Blob Storage later with no logic changes.
 * HOW:  `put(namespace, id, content)` returns a ref string; `get(ref)` reads it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface BlobStore {
  /** Stores content and returns an opaque reference to retrieve it later. */
  put(namespace: string, id: string, content: string): Promise<string>;
  /** Retrieves content by reference, or null if not found. */
  get(ref: string): Promise<string | null>;
}

/**
 * Local filesystem implementation. Refs are relative paths under the root, e.g.
 * "local://<runId>/<sourceId>.md". The scheme makes the storage backend obvious
 * in the DB and lets a future adapter recognise and migrate old refs.
 */
export class LocalBlobStore implements BlobStore {
  private readonly root: string;

  constructor(root = process.env.BLOB_STORE_ROOT ?? './storage') {
    this.root = resolve(root);
  }

  async put(namespace: string, id: string, content: string): Promise<string> {
    const relPath = join(namespace, `${id}.txt`);
    const absPath = join(this.root, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf8');
    return `local://${relPath}`;
  }

  async get(ref: string): Promise<string | null> {
    if (!ref.startsWith('local://')) return null;
    const relPath = ref.slice('local://'.length);
    const absPath = join(this.root, relPath);
    try {
      return await readFile(absPath, 'utf8');
    } catch {
      return null;
    }
  }
}
