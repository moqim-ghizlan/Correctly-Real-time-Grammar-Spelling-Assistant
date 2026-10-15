// A spec-complete IndexedDB (real transactions and auto-commit) for the V5.8
// usage-limit store. Every test gets a brand-new, empty one, so databases
// never leak between tests.
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
