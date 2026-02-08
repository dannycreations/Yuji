import { Context, Effect, Layer, Schema } from 'effect';
import { openDB } from 'idb';

import { AppStoreState, ChatMessage, ChatMetadata, ChatThread } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void>;

  readonly getThreadsMetadata: (options?: { offset?: number; limit?: number }) => Effect.Effect<ReadonlyArray<ChatMetadata>>;
  readonly getThread: (id: string, options?: { limit?: number }) => Effect.Effect<ChatThread | null>;
  readonly saveThread: (thread: ChatThread | ChatMetadata) => Effect.Effect<void>;
  readonly deleteThread: (id: string) => Effect.Effect<void>;

  readonly getMessages: (threadId: string, options?: { offset?: number; limit?: number }) => Effect.Effect<ReadonlyArray<ChatMessage>>;
  readonly paginate: <T>(
    storeName: string,
    options: { offset?: number; limit?: number; indexName?: string; indexValue?: IDBValidKey },
  ) => Effect.Effect<ReadonlyArray<T>>;
  readonly saveMessage: (threadId: string, message: ChatMessage) => Effect.Effect<void>;
  readonly saveMessages: (threadId: string, messages: ChatMessage[]) => Effect.Effect<void>;
  readonly deleteMessage: (id: string) => Effect.Effect<void>;
  readonly deleteMessages: (threadId: string) => Effect.Effect<void>;
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
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.THREADS)) {
          db.createObjectStore(STORES.THREADS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
          messageStore.createIndex('threadId', 'threadId');
        }
      },
    });

    const getDB = Effect.promise(() => dbPromise);

    const storage: StorageService = StorageService.of({
      getMetadata: () =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const metadata = yield* Effect.promise(() => db.get(STORES.METADATA, 'current'));
          if (!metadata) return null;
          return yield* Schema.decode(AppStoreState)(metadata);
        }).pipe(Effect.orDie),

      saveMetadata: (metadata) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.METADATA, { ...metadata, id: 'current' }));
        }),

      getThreadsMetadata: (options) =>
        Effect.gen(function* () {
          if (!options) {
            const db = yield* getDB;
            const threads = yield* Effect.promise(() => db.getAll(STORES.THREADS));
            return yield* Schema.decode(Schema.Array(ChatMetadata))(threads);
          }

          const threads = yield* storage.paginate<ChatMetadata>(STORES.THREADS, options);
          return yield* Schema.decode(Schema.Array(ChatMetadata))(threads);
        }).pipe(Effect.orDie),

      getThread: (id, options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const thread = yield* Effect.promise(() => db.get(STORES.THREADS, id));
          if (!thread) return null;

          const messages = yield* storage.getMessages(id, options);
          const messagesRecord = Object.fromEntries(messages.map((m) => [m.id, m]));

          return yield* Schema.decode(ChatThread)({ ...thread, messages: messagesRecord });
        }).pipe(Effect.orDie),

      saveThread: (thread) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const existing = yield* Effect.promise(() => db.get(STORES.THREADS, thread.id));

          // Strip messages before saving to THREADS store to prevent bloat
          // Messages are stored separately in STORES.MESSAGES
          const { messages: _, ...metadata } = thread as ChatThread;

          const toSave = existing ? { ...existing, ...metadata } : metadata;
          yield* Effect.promise(() => db.put(STORES.THREADS, toSave));
        }),

      deleteThread: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction([STORES.THREADS, STORES.MESSAGES], 'readwrite');
          tx.objectStore(STORES.THREADS).delete(id);

          const messageStore = tx.objectStore(STORES.MESSAGES);
          const index = messageStore.index('threadId');

          // Batch delete messages for the thread
          // Using a cursor for massive deletions is more memory-efficient than getAllKeys
          let cursor = yield* Effect.promise(() => index.openKeyCursor(IDBKeyRange.only(id)));
          while (cursor) {
            messageStore.delete(cursor.primaryKey);
            cursor = yield* Effect.promise(() => cursor!.continue());
          }

          yield* Effect.promise(() => tx.done);
        }),

      paginate: <T>(storeName: string, options: { offset?: number; limit?: number; indexName?: string; indexValue?: IDBValidKey }) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const { offset = 0, limit = 20, indexName, indexValue } = options;
          const results: T[] = [];
          const tx = db.transaction(storeName, 'readonly');
          const source = indexName ? tx.store.index(indexName) : tx.store;
          const range = indexValue ? IDBKeyRange.only(indexValue) : null;

          let cursor = yield* Effect.promise(() => source.openCursor(range, 'prev'));

          let advanced = false;
          while (cursor && results.length < limit) {
            if (!advanced && offset > 0) {
              cursor = yield* Effect.promise(() => cursor!.advance(offset));
              advanced = true;
              continue;
            }
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
            return yield* Schema.decode(Schema.Array(ChatMessage))(messages);
          }

          const messages = yield* storage.paginate<ChatMessage>(STORES.MESSAGES, {
            ...options,
            indexName: 'threadId',
            indexValue: threadId,
          });

          const decoded = yield* Schema.decode(Schema.Array(ChatMessage))(messages);
          return [...decoded].reverse();
        }).pipe(Effect.orDie),

      saveMessage: (threadId, message) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.MESSAGES, { ...message, threadId }));
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

      deleteMessage: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.delete(STORES.MESSAGES, id));
        }),

      deleteMessages: (threadId) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          const index = tx.store.index('threadId');
          const keys = yield* Effect.promise(() => index.getAllKeys(IDBKeyRange.only(threadId)));
          for (const key of keys) {
            tx.store.delete(key);
          }

          yield* Effect.promise(() => tx.done);
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
