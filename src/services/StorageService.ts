import { Context, Effect, Layer, Schema } from 'effect';
import { openDB } from 'idb';

import { AppStoreState, ChatMessage, ChatMetadata, ChatSession } from '../app/Schema';

export interface StorageService {
  readonly getMetadata: () => Effect.Effect<AppStoreState | null>;
  readonly saveMetadata: (metadata: AppStoreState) => Effect.Effect<void>;

  readonly getSessionsMetadata: (options?: { offset?: number; limit?: number }) => Effect.Effect<ReadonlyArray<ChatMetadata>>;
  readonly getSession: (id: string, options?: { limit?: number }) => Effect.Effect<ChatSession | null>;
  readonly saveSession: (session: ChatSession | ChatMetadata) => Effect.Effect<void>;
  readonly deleteSession: (id: string) => Effect.Effect<void>;

  readonly getMessages: (sessionId: string, options?: { offset?: number; limit?: number }) => Effect.Effect<ReadonlyArray<ChatMessage>>;
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
          const metadata = yield* Effect.promise(() => db.get(STORES.METADATA, 'current'));
          if (!metadata) return null;
          return yield* Schema.decode(AppStoreState)(metadata).pipe(Effect.orDie);
        }),

      saveMetadata: (metadata) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          yield* Effect.promise(() => db.put(STORES.METADATA, { ...metadata, id: 'current' }));
        }),

      getSessionsMetadata: (options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          if (!options) {
            const sessions = yield* Effect.promise(() => db.getAll(STORES.SESSIONS));
            return yield* Schema.decode(Schema.Array(ChatMetadata))(sessions).pipe(Effect.orDie);
          }

          const { offset = 0, limit = 50 } = options;
          const sessions: ChatMetadata[] = [];
          const tx = db.transaction(STORES.SESSIONS, 'readonly');
          let cursor = yield* Effect.promise(() => tx.store.openCursor(null, 'prev'));

          let advanced = false;
          while (cursor && sessions.length < limit) {
            if (!advanced && offset > 0) {
              cursor = yield* Effect.promise(() => cursor!.advance(offset));
              advanced = true;
              continue;
            }
            sessions.push(cursor.value);
            cursor = yield* Effect.promise(() => cursor!.continue());
          }

          return yield* Schema.decode(Schema.Array(ChatMetadata))(sessions).pipe(Effect.orDie);
        }),

      getSession: (id, options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const session = yield* Effect.promise(() => db.get(STORES.SESSIONS, id));
          if (!session) return null;

          const messages = yield* storage.getMessages(id, options);
          const messagesRecord = Object.fromEntries(messages.map((m) => [m.id, m]));

          return yield* Schema.decode(ChatSession)({ ...session, messages: messagesRecord }).pipe(Effect.orDie);
        }),

      saveSession: (session) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const existing = yield* Effect.promise(() => db.get(STORES.SESSIONS, session.id));

          // Strip messages before saving to SESSIONS store to prevent bloat
          // Messages are stored separately in STORES.MESSAGES
          const { messages: _, ...metadata } = session as ChatSession;

          const toSave = existing ? { ...existing, ...metadata } : metadata;
          yield* Effect.promise(() => db.put(STORES.SESSIONS, toSave));
        }),

      deleteSession: (id) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          const tx = db.transaction([STORES.SESSIONS, STORES.MESSAGES], 'readwrite');
          tx.objectStore(STORES.SESSIONS).delete(id);

          const messageStore = tx.objectStore(STORES.MESSAGES);
          const index = messageStore.index('sessionId');
          const keys = yield* Effect.promise(() => index.getAllKeys(IDBKeyRange.only(id)));
          for (const key of keys) {
            messageStore.delete(key);
          }

          yield* Effect.promise(() => tx.done);
        }),

      getMessages: (sessionId, options) =>
        Effect.gen(function* () {
          const db = yield* getDB;
          if (!options) {
            const messages = yield* Effect.promise(() => db.getAllFromIndex(STORES.MESSAGES, 'sessionId', sessionId));
            return yield* Schema.decode(Schema.Array(ChatMessage))(messages).pipe(Effect.orDie);
          }

          const { offset = 0, limit = 20 } = options;
          const messages: ChatMessage[] = [];
          const tx = db.transaction(STORES.MESSAGES, 'readonly');
          const index = tx.store.index('sessionId');
          let cursor = yield* Effect.promise(() => index.openCursor(IDBKeyRange.only(sessionId), 'prev'));

          let advanced = false;
          while (cursor && messages.length < limit) {
            if (!advanced && offset > 0) {
              cursor = yield* Effect.promise(() => cursor!.advance(offset));
              advanced = true;
              continue;
            }
            messages.push(cursor.value);
            cursor = yield* Effect.promise(() => cursor!.continue());
          }

          const decoded = yield* Schema.decode(Schema.Array(ChatMessage))(messages).pipe(Effect.orDie);
          return [...decoded].reverse();
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
          for (const m of messages) {
            tx.store.put({ ...m, sessionId });
          }
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
          const keys = yield* Effect.promise(() => index.getAllKeys(IDBKeyRange.only(sessionId)));
          for (const key of keys) {
            tx.store.delete(key);
          }

          yield* Effect.promise(() => tx.done);
        }),
    });

    return storage;
  }),
);
