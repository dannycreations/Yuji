import { Context, Effect, Layer, Schema } from 'effect';
import { openDB } from 'idb';

import { ChatMetadata } from '../app/Schema';

import type { AppStoreState, ChatMessage, ChatSession } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void>;

  readonly getSessionsMetadata: () => Effect.Effect<ChatMetadata[]>;
  readonly getSession: (id: string) => Effect.Effect<ChatSession | null>;
  readonly saveSession: (session: ChatSession | ChatMetadata) => Effect.Effect<void>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;

  readonly getMessages: (sessionId: string) => Effect.Effect<ChatMessage[]>;
  readonly saveMessage: (sessionId: string, message: ChatMessage) => Effect.Effect<void>;
  readonly saveMessages: (sessionId: string, messages: ChatMessage[]) => Effect.Effect<void>;
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

    const storage: StorageService = StorageService.of({
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

      getSessionsMetadata: () =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const sessions = yield* Effect.promise(() => db.getAll(STORES.SESSIONS));
          const decode = Schema.decodeSync(ChatMetadata);
          return sessions.map((s) => decode(s));
        }),

      getSession: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const session = yield* Effect.promise(() => db.get(STORES.SESSIONS, id));
          if (!session) return null;

          const messages = (yield* storage.getMessages(id)) as ChatMessage[];
          const messagesRecord: Record<string, ChatMessage> = {};
          messages.forEach((m) => (messagesRecord[m.id] = m));

          return { ...session, messages: messagesRecord } as ChatSession;
        }),

      saveSession: (session) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const existing = yield* Effect.promise(() => db.get(STORES.SESSIONS, session.id));
          // If we are saving metadata but it's already a full session, preserve config/messages
          const toSave = existing ? { ...existing, ...session } : session;
          yield* Effect.promise(() => db.put(STORES.SESSIONS, toSave));
        }),

      deleteSession: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction([STORES.SESSIONS, STORES.MESSAGES], 'readwrite');
          yield* Effect.promise(() => tx.objectStore(STORES.SESSIONS).delete(id));
          yield* Effect.promise(() => tx.objectStore(STORES.MESSAGES).index('sessionId').openKeyCursor(IDBKeyRange.only(id)));
          const messageStore = tx.objectStore(STORES.MESSAGES);
          let cursor = yield* Effect.promise(() => messageStore.index('sessionId').openKeyCursor(IDBKeyRange.only(id)));
          while (cursor) {
            yield* Effect.promise(() => messageStore.delete(cursor!.primaryKey));
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

    return storage;
  }),
);
