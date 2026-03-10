import { Context, Effect, Layer } from 'effect';
import { openDB } from 'idb';

import { AppStoreState, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null, Error>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void, Error>;

  readonly getThreadsMetadata: (options?: { lastKey?: IDBValidKey; limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMetadata>, Error>;
  readonly searchThreads: (query: string, options?: { limit?: number }) => Effect.Effect<ReadonlyArray<ThreadMetadata>, Error>;
  readonly getThread: (
    id: string,
    options?: {
      readonly limit?: number;
      readonly loadSiblings?: boolean;
    },
  ) => Effect.Effect<Thread | null, Error>;
  readonly getThreadMetadata: (id: string) => Effect.Effect<ThreadMetadata | null, Error>;
  readonly saveThread: (thread: Thread | ThreadMetadata) => Effect.Effect<void, Error>;
  readonly patchThread: (id: string, patch: Partial<ThreadMetadata>) => Effect.Effect<void, Error>;
  readonly deleteThreads: (ids: Iterable<string>) => Effect.Effect<void, Error>;

  readonly getDescendantIds: (threadId: string, id: string) => Effect.Effect<ReadonlyArray<string>, Error>;
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
  readonly deleteMessages: (threadId: string, ids: Iterable<string>) => Effect.Effect<void, Error>;
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
      db.createObjectStore(STORES.METADATA, { keyPath: 'id' });

      const threadStore = db.createObjectStore(STORES.THREADS, { keyPath: 'id' });
      threadStore.createIndex('title', 'title');
      threadStore.createIndex('updatedAt', 'updatedAt');

      const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: ['threadId', 'id'] });
      messageStore.createIndex('threadId_parentId', ['threadId', 'parentId']);
      messageStore.createIndex('threadId_timestamp', ['threadId', 'timestamp']);
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
        storage.paginate<ThreadMetadata>(STORES.THREADS, {
          limit: options?.limit ?? 50,
          lastKey: options?.lastKey,
          indexName: 'updatedAt',
          direction: 'prev',
        }),

      searchThreads: (query, options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const limit = options?.limit ?? 50;
          const normalizedQuery = query.trim().toLowerCase();

          if (!normalizedQuery) return [];

          const tx = db.transaction(STORES.THREADS, 'readonly');
          const index = tx.store.index('updatedAt');
          let cursor = yield* Effect.promise(() => index.openCursor(null, 'prev'));

          const results: ThreadMetadata[] = [];
          while (cursor) {
            const thread = cursor.value as ThreadMetadata;
            if (thread.title.toLowerCase().indexOf(normalizedQuery) !== -1) {
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
          for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            messagesRecord[m.id] = m;
          }
          const activeId = thread.activeMessageId;

          // Ensure the active path and their siblings are present if a limit was applied
          if (options?.limit && activeId) {
            const pathIds: string[] = [];
            let currentId: string | undefined = activeId;

            while (currentId) {
              pathIds.push(currentId);
              if (!messagesRecord[currentId]) {
                const msg = (yield* Effect.promise(() => db.get(STORES.MESSAGES, [id, currentId!]))) as ThreadMessage | undefined;
                if (!msg) break;
                messagesRecord[msg.id] = msg;
                currentId = msg.parentId;
              } else {
                currentId = messagesRecord[currentId].parentId;
              }
            }

            if (options.loadSiblings) {
              // Load siblings of every message in the active path
              // This ensures version navigation works even in large threads with lazy loading
              for (const mid of pathIds) {
                const msg = messagesRecord[mid];
                if (!msg?.parentId) continue;

                const siblingsKeys = (yield* Effect.promise(() =>
                  db.getAllKeysFromIndex(STORES.MESSAGES, 'threadId_parentId', [id, msg.parentId!]),
                )) as [string, string][];

                for (const skey of siblingsKeys) {
                  const sid = skey[1];
                  if (!messagesRecord[sid]) {
                    const smsg = (yield* Effect.promise(() => db.get(STORES.MESSAGES, skey))) as ThreadMessage | undefined;
                    if (smsg) messagesRecord[sid] = smsg;
                  }
                }
              }
            }
          }

          return { ...thread, messages: messagesRecord } as Thread;
        }),

      getThreadMetadata: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const meta = yield* Effect.promise(() => db.get(STORES.THREADS, id));
          return (meta as ThreadMetadata) || null;
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

          for (const id of ids) {
            threadStore.delete(id);
            messageStore.delete(IDBKeyRange.bound([id, ''], [id, '\uffff']));
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
          const tx = db.transaction(storeName, 'readonly');
          const source = indexName ? tx.store.index(indexName) : tx.store;

          let range: IDBKeyRange | null = null;
          if (indexValue !== undefined) {
            if (lastKey !== undefined) {
              // For compound indexes like [threadId, timestamp]
              if (direction === 'prev') {
                range = IDBKeyRange.bound([indexValue, 0], [indexValue, lastKey], false, true);
              } else {
                range = IDBKeyRange.bound([indexValue, lastKey], [indexValue, Number.MAX_SAFE_INTEGER], true, false);
              }
            } else {
              range = IDBKeyRange.bound([indexValue, 0], [indexValue, Number.MAX_SAFE_INTEGER]);
            }
          } else if (lastKey !== undefined) {
            range = direction === 'prev' ? IDBKeyRange.upperBound(lastKey, true) : IDBKeyRange.lowerBound(lastKey, true);
          }

          const results: T[] = [];
          let cursor = yield* Effect.promise(() => source.openCursor(range, direction));

          while (cursor && results.length < limit) {
            const val = cursor.value;
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
          if (!options || !options.limit) {
            const db = yield* getDB;
            const messages = yield* Effect.promise(() => db.getAll(STORES.MESSAGES, IDBKeyRange.bound([threadId, ''], [threadId, '\uffff'])));
            return messages as ThreadMessage[];
          }
          return yield* storage.paginate<ThreadMessage>(STORES.MESSAGES, {
            ...options,
            indexName: 'threadId_timestamp',
            indexValue: threadId,
            direction: 'prev',
          });
        }),

      saveMessages: (threadId, messages) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          const store = tx.store;
          for (const m of messages) {
            store.put({ ...m, threadId });
          }
          yield* Effect.promise(() => tx.done);
        }),

      deleteMessages: (threadId, ids) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          for (const id of ids) {
            tx.store.delete([threadId, id]);
          }
          yield* Effect.promise(() => tx.done);
        }),

      getDescendantIds: (threadId, id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const results: string[] = [];
          const stack = [id];

          const messages = (yield* Effect.promise(() =>
            db.getAll(STORES.MESSAGES, IDBKeyRange.bound([threadId, ''], [threadId, '\uffff'])),
          )) as ThreadMessage[];

          const parentToChildren = new Map<string, string[]>();
          for (let i = 0, len = messages.length; i < len; i++) {
            const m = messages[i];
            if (m.parentId) {
              let list = parentToChildren.get(m.parentId);
              if (!list) {
                list = [];
                parentToChildren.set(m.parentId, list);
              }
              list.push(m.id);
            }
          }

          while (stack.length > 0) {
            const currentId = stack.pop()!;
            results.push(currentId);
            const children = parentToChildren.get(currentId);
            if (children) {
              for (let i = 0, len = children.length; i < len; i++) {
                stack.push(children[i]);
              }
            }
          }
          return results;
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
