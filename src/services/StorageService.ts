import { Context, Effect, Layer } from 'effect';
import { openDB } from 'idb';

import { AppStoreState, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null, Error>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void, Error>;

  readonly getThreadsMetadata: (options?: { lastKey?: IDBValidKey; limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMetadata>, Error>;
  readonly searchThreads: (query: string, options?: { limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMetadata>, Error>;
  readonly getThread: (id: string, options?: { limit?: number }) => Effect.Effect<Thread | null, Error>;
  readonly saveThread: (thread: Thread | ThreadMetadata) => Effect.Effect<void, Error>;
  readonly patchThread: (id: string, patch: Partial<ThreadMetadata>) => Effect.Effect<void, Error>;
  readonly deleteThreads: (ids: Iterable<string>) => Effect.Effect<void, Error>;

  readonly getMessages: (threadId: string, options?: { lastKey?: IDBValidKey; limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMessage>, Error>;
  readonly paginate: <T>(
    storeName: string,
    options: {
      lastKey?: IDBValidKey;
      limit?: number;
      indexName?: string;
      indexValue?: IDBValidKey;
      direction?: IDBCursorDirection;
    },
  ) => Effect.Effect<ReadonlyArray<T>, Error>;
  readonly saveMessages: (threadId: string, messages: Iterable<ThreadMessage>) => Effect.Effect<void, Error>;
  readonly deleteMessages: (ids: Iterable<string>) => Effect.Effect<void, Error>;
  readonly deleteDatabase: () => Effect.Effect<void, Error>;
}

export const StorageService = Context.GenericTag<StorageService>('@services/StorageService');

const DB_NAME = 'yuji-db';
const DB_VERSION = 1;

const STORES = {
  METADATA: 'metadata',
  THREADS: 'threads',
  MESSAGES: 'messages',
} as const;

const connectDB = Effect.promise(() =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.THREADS)) {
        const threadStore = db.createObjectStore(STORES.THREADS, { keyPath: 'id' });
        threadStore.createIndex('title', 'title');
        threadStore.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
        messageStore.createIndex('threadId', 'threadId');
        messageStore.createIndex('threadId_timestamp', ['threadId', 'timestamp']);
      }
    },
  }),
).pipe(Effect.cached);

export const StorageServiceLive = Layer.effect(
  StorageService,
  Effect.gen(function* () {
    const getDB = yield* connectDB;

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
          while (cursor) {
            const thread = cursor.value as ThreadMetadata;
            if (thread.title.toLowerCase().includes(normalizedQuery)) {
              results.push(thread);
              if (results.length >= limit) break;
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
          const activeId = thread.activeMessageId;

          for (let i = 0, len = messages.length; i < len; i++) {
            const m = messages[i];
            messagesRecord[m.id] = m;
          }

          // Ensure the active message is present if a limit was applied
          if (options?.limit && activeId && !messagesRecord[activeId]) {
            const activeMsg = yield* Effect.promise(() => db.get(STORES.MESSAGES, activeId));
            if (activeMsg) {
              messagesRecord[activeMsg.id] = activeMsg as ThreadMessage;
            }
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

      deleteThreads: (ids) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction([STORES.THREADS, STORES.MESSAGES], 'readwrite');
          const threadStore = tx.objectStore(STORES.THREADS);
          const messageStore = tx.objectStore(STORES.MESSAGES);
          const msgIndex = messageStore.index('threadId');

          for (const id of ids) {
            threadStore.delete(id);
            // In IndexedDB, delete() on a store with an IDBKeyRange only deletes by primary key.
            // To delete by index, we must use a cursor or a browser-specific extension if available.
            // Industry standard: iterate cursor and delete.
            let cursor = yield* Effect.promise(() => msgIndex.openKeyCursor(IDBKeyRange.only(id)));
            while (cursor) {
              messageStore.delete(cursor.primaryKey);
              cursor = yield* Effect.promise(() => cursor!.continue());
            }
          }
          yield* Effect.promise(() => tx.done);
        }),

      paginate: <T>(
        storeName: string,
        options: {
          lastKey?: IDBValidKey;
          limit?: number;
          indexName?: string;
          indexValue?: IDBValidKey;
          direction?: IDBCursorDirection;
        },
      ) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const { lastKey, limit = 20, indexName, indexValue, direction = 'prev' } = options;
          const results: T[] = [];
          const tx = db.transaction(storeName, 'readonly');
          const source = indexName ? tx.store.index(indexName) : tx.store;

          let range: IDBKeyRange | null = null;
          if (indexValue !== undefined) {
            if (lastKey !== undefined) {
              // For compound indexes like [threadId, timestamp]
              if (direction === 'prev') {
                range = IDBKeyRange.bound([indexValue, -Infinity], [indexValue, lastKey], false, true);
              } else {
                range = IDBKeyRange.bound([indexValue, lastKey], [indexValue, Infinity], true, false);
              }
            } else {
              range = IDBKeyRange.only(indexValue);
            }
          } else if (lastKey !== undefined) {
            range = direction === 'prev' ? IDBKeyRange.upperBound(lastKey, true) : IDBKeyRange.lowerBound(lastKey, true);
          }

          let cursor = yield* Effect.promise(() => source.openCursor(range, direction));

          while (cursor && results.length < limit) {
            const val = cursor.value;
            // If using compound index but range isn't strictly 'only' on the first part (e.g. upperBound)
            // we must manually verify the prefix to avoid bleeding into other threads.
            if (indexValue !== undefined && indexName?.includes('_') && val.threadId !== indexValue) {
              break;
            }

            results.push(val);
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
            indexName: 'threadId_timestamp',
            indexValue: threadId,
            direction: 'prev',
          });

          return messages;
        }),

      saveMessages: (threadId, messages) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          for (const m of messages) {
            tx.store.put({ ...m, threadId });
          }
          yield* Effect.promise(() => tx.done);
        }),

      deleteMessages: (ids) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          for (const id of ids) {
            tx.store.delete(id);
          }
          yield* Effect.promise(() => tx.done);
        }),

      deleteDatabase: () =>
        Effect.async<void>((resume) => {
          const request = indexedDB.deleteDatabase(DB_NAME);
          const timeout = setTimeout(() => resume(Effect.void), 2000);

          request.onsuccess = () => {
            clearTimeout(timeout);
            resume(Effect.void);
          };
          request.onerror = () => {
            clearTimeout(timeout);
            resume(Effect.void);
          };
          request.onblocked = () => {
            clearTimeout(timeout);
            resume(Effect.void);
          };
        }).pipe(Effect.tap(() => Effect.sync(() => window.location.reload()))),
    });

    return storage;
  }),
);
