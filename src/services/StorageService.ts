import { Context, Effect, Layer } from 'effect';
import { openDB } from 'idb';

import type { AppStoreState, ChatMetadata, Message } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void>;

  readonly getSessions: () => Effect.Effect<ReadonlyArray<ChatMetadata>>;
  readonly saveSession: (session: ChatMetadata) => Effect.Effect<void>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;

  readonly getMessages: (sessionId: string) => Effect.Effect<ReadonlyArray<Message>>;
  readonly saveMessage: (sessionId: string, message: Message) => Effect.Effect<void>;
  readonly saveMessages: (sessionId: string, messages: ReadonlyArray<Message>) => Effect.Effect<void>;
  readonly deleteMessage: (id: string) => Effect.Effect<void>;
  readonly deleteMessages: (sessionId: string) => Effect.Effect<void>;
}

export const StorageService = Context.GenericTag<StorageService>('@services/StorageService');

const DB_NAME = 'yuji-db';
const DB_VERSION = 1;

const STORES = {
  METADATA: 'metadata',
  SESSIONS: 'sessions',
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
        if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
          db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
          messageStore.createIndex('sessionId', 'sessionId');
        }
      },
    });

    const getDB = Effect.promise(() => dbPromise);

    return StorageService.of({
      getMetadata: () =>
        Effect.gen(function* () {
          const db = yield* getDB;
          return (yield* Effect.promise(() => db.get(STORES.METADATA, 'current'))) ?? null;
        }),

      saveMetadata: (metadata) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.METADATA, { ...metadata, id: 'current' }));
        }),

      getSessions: () =>
        Effect.gen(function* () {
          const db = yield* getDB;
          return yield* Effect.promise(() => db.getAll(STORES.SESSIONS));
        }),

      saveSession: (session) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.SESSIONS, session));
        }),

      deleteSession: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction([STORES.SESSIONS, STORES.MESSAGES], 'readwrite');
          yield* Effect.promise(() => tx.objectStore(STORES.SESSIONS).delete(id));
          const index = tx.objectStore(STORES.MESSAGES).index('sessionId');
          let cursor = yield* Effect.promise(() => index.openKeyCursor(IDBKeyRange.only(id)));
          while (cursor) {
            yield* Effect.promise(() => tx.objectStore(STORES.MESSAGES).delete(cursor!.primaryKey));
            cursor = yield* Effect.promise(() => cursor!.continue());
          }
          yield* Effect.promise(() => tx.done);
        }),

      getMessages: (sessionId) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          return yield* Effect.promise(() => db.getAllFromIndex(STORES.MESSAGES, 'sessionId', sessionId));
        }),

      saveMessage: (sessionId, message) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.MESSAGES, { ...message, sessionId }));
        }),

      saveMessages: (sessionId, messages) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          yield* Effect.all(
            messages.map((m) => Effect.promise(() => tx.store.put({ ...m, sessionId }))),
            { discard: true },
          );
          yield* Effect.promise(() => tx.done);
        }),

      deleteMessage: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.delete(STORES.MESSAGES, id));
        }),

      deleteMessages: (sessionId) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction(STORES.MESSAGES, 'readwrite');
          const index = tx.store.index('sessionId');
          // Surgical deletion using IDBKeyRange
          let cursor = yield* Effect.promise(() => index.openKeyCursor(IDBKeyRange.only(sessionId)));
          while (cursor) {
            yield* Effect.promise(() => tx.store.delete(cursor!.primaryKey));
            cursor = yield* Effect.promise(() => cursor!.continue());
          }
          yield* Effect.promise(() => tx.done);
        }),
    });
  }),
);
