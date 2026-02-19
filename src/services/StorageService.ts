import { Context, Effect, Layer } from 'effect';
import { openDB } from 'idb';

import { AppStoreState, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void>;

  readonly getThreadsMetadata: (options?: { lastKey?: IDBValidKey; limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMetadata>>;
  readonly searchThreads: (query: string, options?: { limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMetadata>>;
  readonly getThread: (id: string, options?: { limit?: number }) => Effect.Effect<Thread | null>;
  readonly saveThread: (thread: Thread | ThreadMetadata) => Effect.Effect<void>;
  readonly patchThread: (id: string, patch: Partial<ThreadMetadata>) => Effect.Effect<void>;
  readonly deleteThread: (id: string) => Effect.Effect<void>;

  readonly getMessages: (threadId: string, options?: { lastKey?: IDBValidKey; limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMessage>>;
  readonly paginate: <T>(
    storeName: string,
    options: { lastKey?: IDBValidKey; limit?: number; indexName?: string; indexValue?: IDBValidKey },
  ) => Effect.Effect<ReadonlyArray<T>>;
  readonly saveMessages: (threadId: string, messages: ThreadMessage | ThreadMessage[]) => Effect.Effect<void>;
  readonly deleteMessage: (id: string) => Effect.Effect<void>;
  readonly clearDatabase: () => Effect.Effect<void>;
}

export const StorageService = Context.GenericTag<StorageService>('@services/StorageService');

const DB_NAME = 'yuji-db';
const DB_VERSION = 1;

const STORES = {
  METADATA: 'metadata',
  THREADS: 'threads',
  MESSAGES: 'messages',
} as const;

export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.gen(function* () {
    const dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.THREADS)) {
          const threadStore = db.createObjectStore(STORES.THREADS, { keyPath: 'id' });
          threadStore.createIndex('title', 'title');
          threadStore.createIndex('updatedAt', 'updatedAt');
        } else {
          const store = transaction.objectStore(STORES.THREADS);
          if (!store.indexNames.contains('title')) {
            store.createIndex('title', 'title');
          }
          if (!store.indexNames.contains('updatedAt')) {
            store.createIndex('updatedAt', 'updatedAt');
          }
        }
        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
          messageStore.createIndex('threadId', 'threadId');
        }
      },
      blocked() {
        console.warn('Database opening blocked. Please close other Yuji tabs.');
      },
    }).catch((err) => {
      const name = (err as DOMException)?.name || (err as Error)?.name;
      if (name === 'VersionError') {
        return Promise.reject(
          new Error(
            'Database version conflict: Your saved data is from a newer version of Yuji. Please reset your database or use the newer version.',
          ),
        );
      }
      return Promise.reject(err);
    });

    const getDB = Effect.promise(() => dbPromise);

    const storage: StorageService = StorageService.of({
      getMetadata: () =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const metadata = yield* Effect.promise(() => db.get(STORES.METADATA, 'current'));
          if (!metadata) return null;
          return metadata as AppStoreState;
        }),

      saveMetadata: (metadata) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.METADATA, { ...metadata, id: 'current' }));
        }),

      getThreadsMetadata: (options) =>
        Effect.gen(function* () {
          if (!options) {
            const db = yield* getDB;
            const threads = yield* Effect.promise(() => db.getAllFromIndex(STORES.THREADS, 'updatedAt'));
            return (threads as ThreadMetadata[]).reverse();
          }

          const threads = yield* storage.paginate<ThreadMetadata>(STORES.THREADS, {
            ...options,
            indexName: 'updatedAt',
          });
          return threads as ThreadMetadata[];
        }),

      searchThreads: (query, options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const limit = options?.limit ?? 50;
          const normalizedQuery = query.toLowerCase();

          const tx = db.transaction(STORES.THREADS, 'readonly');
          const index = tx.store.index('updatedAt');
          let cursor = yield* Effect.promise(() => index.openCursor(null, 'prev'));

          const results: ThreadMetadata[] = [];
          while (cursor && results.length < limit) {
            const thread = cursor.value as ThreadMetadata;
            if (thread.title.toLowerCase().includes(normalizedQuery)) {
              results.push(thread);
            }
            cursor = yield* Effect.promise(() => cursor!.continue());
          }

          return results;
        }),

      getThread: (id, options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const thread = yield* Effect.promise(() => db.get(STORES.THREADS, id));
          if (!thread) return null;

          const messages = yield* storage.getMessages(id, options);
          const messagesRecord: Record<string, ThreadMessage> = {};
          for (let i = 0, len = messages.length; i < len; i++) {
            const m = messages[i];
            messagesRecord[m.id] = m;
          }

          return { ...thread, messages: messagesRecord } as Thread;
        }),

      saveThread: (thread) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const existing = yield* Effect.promise(() => db.get(STORES.THREADS, thread.id));

          // Strip messages before saving to THREADS store to prevent bloat
          const { messages: _, ...metadata } = thread as Thread;

          const toSave = existing ? { ...existing, ...metadata } : metadata;
          yield* Effect.promise(() => db.put(STORES.THREADS, toSave));
        }),

      patchThread: (id, patch) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.THREADS, 'readwrite');
          const existing = yield* Effect.promise(() => tx.store.get(id));
          if (existing) {
            yield* Effect.promise(() => tx.store.put({ ...existing, ...patch }));
          }
          yield* Effect.promise(() => tx.done);
        }),

      deleteThread: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction([STORES.THREADS, STORES.MESSAGES], 'readwrite');
          tx.objectStore(STORES.THREADS).delete(id);

          const messageStore = tx.objectStore(STORES.MESSAGES);

          // More efficient batch deletion for modern browsers:
          // Instead of manually iterating a cursor which involves multiple request cycles,
          // we use the index to find the range and let the browser's IDB engine handle the bulk deletion.
          yield* Effect.promise(() => messageStore.delete(IDBKeyRange.only(id)));

          yield* Effect.promise(() => tx.done);
        }),

      paginate: <T>(storeName: string, options: { lastKey?: IDBValidKey; limit?: number; indexName?: string; indexValue?: IDBValidKey }) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const { lastKey, limit = 20, indexName, indexValue } = options;
          const results: T[] = [];
          const tx = db.transaction(storeName, 'readonly');
          const source = indexName ? tx.store.index(indexName) : tx.store;

          let range: IDBKeyRange | null = null;
          if (indexValue !== undefined && lastKey !== undefined) {
            // In IDB, compound ranges for index + primary key require manual filtering or specific key structures.
            // Since we use threadId index, we bound by the index value and start after the lastKey.
            range = IDBKeyRange.only(indexValue);
          } else if (indexValue !== undefined) {
            range = IDBKeyRange.only(indexValue);
          } else if (lastKey !== undefined) {
            // O(log N) lookup instead of O(N) advance()
            range = IDBKeyRange.upperBound(lastKey, true);
          }

          let cursor = yield* Effect.promise(() => source.openCursor(range, 'prev'));

          // Handle manual secondary key skip if using indexValue + lastKey
          // lastKey is primaryKey (id) which is string.
          if (cursor && indexValue !== undefined && lastKey !== undefined) {
            const lastKeyStr = lastKey as string;
            while (cursor && cursor.primaryKey >= lastKeyStr) {
              cursor = yield* Effect.promise(() => cursor!.continue());
            }
          }

          while (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor = yield* Effect.promise(() => cursor!.continue());
          }
          return results;
        }),

      getMessages: (threadId, options) =>
        Effect.gen(function* () {
          if (!options) {
            const db = yield* getDB;
            const messages = yield* Effect.promise(() => db.getAllFromIndex(STORES.MESSAGES, 'threadId', threadId));
            return messages as ThreadMessage[];
          }

          const messages = yield* storage.paginate<ThreadMessage>(STORES.MESSAGES, {
            ...options,
            indexName: 'threadId',
            indexValue: threadId,
          });

          return [...(messages as ThreadMessage[])].reverse();
        }),

      saveMessages: (threadId, messages) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const msgs = Array.isArray(messages) ? messages : [messages];
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          for (const m of msgs) {
            tx.store.put({ ...m, threadId });
          }
          yield* Effect.promise(() => tx.done);
        }),

      deleteMessage: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.delete(STORES.MESSAGES, id));
        }),

      clearDatabase: () =>
        Effect.gen(function* () {
          const db = yield* getDB;
          db.close();
          yield* Effect.promise(
            () =>
              new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(DB_NAME);
                request.onsuccess = () => resolve(undefined);
                request.onerror = () => reject(request.error);
                request.onblocked = () => {
                  // If blocked, we still reload to try and clear things up
                  resolve(undefined);
                };
              }),
          );
          window.location.reload();
        }),
    });

    return storage;
  }),
);
