import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { MODELS } from '../app/Schema';
import { randomString } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

import type { AppState, ChatSession, ConfirmState, Message } from '../app/Schema';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppState>;
  readonly getSnapshot: () => AppState;
  readonly update: (f: (state: AppState) => AppState) => Effect.Effect<void>;
  readonly updateSetting: (updates: Partial<AppState['settings']>) => Effect.Effect<void>;
  readonly toggleSidebar: () => Effect.Effect<void>;
  readonly toggleSetting: () => Effect.Effect<void>;
  readonly setConfirm: (
    options: Omit<Schema.Schema.Type<typeof ConfirmState>, 'isOpen' | 'id'> & { readonly onConfirm: () => void },
  ) => Effect.Effect<void>;
  readonly getOnConfirm: (id: string) => Effect.Effect<(() => void) | undefined>;
  readonly clearConfirm: (id: string) => Effect.Effect<void>;
  readonly notify: (type: 'error' | 'warning' | 'info' | 'success', message: string) => Effect.Effect<void>;
  readonly clearNotification: (id: string) => Effect.Effect<void>;
  readonly loadMessages: (sessionId: string) => Effect.Effect<void>;
}

export const StoreService = Context.GenericTag<StoreService>('@services/StoreService');

const createNotification = (
  type: 'error' | 'warning' | 'info' | 'success',
  message: string,
  existingNotifications: ReadonlyArray<AppState['notifications'][number]>,
): AppState['notifications'] => {
  const existing = existingNotifications.find((n) => n.message === message && n.type === type);
  const filtered = existing ? existingNotifications.filter((n) => n.id !== existing.id) : existingNotifications;

  return [
    {
      id: randomString(8),
      type,
      message,
      timestamp: Date.now(),
    },
    ...filtered,
  ];
};

const INITIAL_STATE: AppState = {
  sessions: {},
  activeSessionId: null,
  settings: DEFAULT_SETTINGS,
  availableModels: MODELS,
  isSidebarOpen: true,
  isSettingOpen: false,
  isHydrated: false,
  confirm: {
    isOpen: false,
    title: '',
    message: '',
  },
  notifications: [],
  pinnedSessionIds: [],
  backgroundSessionIds: [],
};

const OnConfirmStore = new Map<string, () => void>();

export const StoreServiceLive = Layer.effect(
  StoreService,
  Effect.gen(function* () {
    const storage = yield* StorageService;

    const loadState = Effect.gen(function* () {
      const metadata = yield* storage.getMetadata();
      const sessionHeaders = yield* storage.getSessions();

      if (metadata) {
        const sessionsMap: Record<string, ChatSession> = {};
        for (const header of sessionHeaders) {
          sessionsMap[header.id] = { ...header, messages: {} };
        }

        return {
          ...INITIAL_STATE,
          activeSessionId: metadata.activeSessionId,
          settings: metadata.settings,
          pinnedSessionIds: metadata.pinnedSessionIds,
          backgroundSessionIds: metadata.backgroundSessionIds,
          sessions: sessionsMap,
          isHydrated: true,
        };
      }
      return { ...INITIAL_STATE, isHydrated: true };
    });

    const initialState = yield* loadState;
    const state = yield* SubscriptionRef.make(initialState);

    // Persistence Loop: Metadata
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.map((s) => ({
          activeSessionId: s.activeSessionId,
          settings: s.settings,
          pinnedSessionIds: s.pinnedSessionIds,
          backgroundSessionIds: s.backgroundSessionIds,
        })),
        Stream.changes,
        Stream.debounce('1 seconds'),
        Stream.runForEach((meta) => storage.saveMetadata(meta)),
      ),
    );

    // Persistence Loop: Sessions (Differential Persistence)
    yield* Effect.forkDaemon(
      state.changes.pipe(
        Stream.drop(1),
        Stream.zipWithPrevious,
        Stream.map(([maybePrev, curr]) => {
          if (maybePrev._tag === 'None') return Object.keys(curr.sessions);
          const prev = maybePrev.value;
          return Object.keys(curr.sessions).filter((id) => {
            const p = prev.sessions[id];
            const c = curr.sessions[id];
            // Only save if session object changed (reference check)
            return p !== c;
          });
        }),
        Stream.filter((ids) => ids.length > 0),
        Stream.debounce('2 seconds'),
        Stream.runForEach((ids) =>
          Effect.gen(function* () {
            const current = yield* SubscriptionRef.get(state);
            yield* Effect.all(
              ids
                .map((id) => current.sessions[id])
                .filter((s): s is ChatSession => !!s)
                .map((s) => storage.saveSession(s)),
              { discard: true },
            );
          }),
        ),
      ),
    );

    const update = (f: (state: AppState) => AppState) =>
      SubscriptionRef.update(state, (s) => {
        const next = f(s);
        // If we switch active sessions, unload messages from other sessions
        if (next.activeSessionId !== s.activeSessionId && next.activeSessionId !== null) {
          const sessions = { ...next.sessions };
          Object.keys(sessions).forEach((id) => {
            if (id !== next.activeSessionId && Object.keys(sessions[id].messages).length > 0) {
              sessions[id] = { ...sessions[id], messages: {} };
            }
          });
          return { ...next, sessions };
        }
        return next;
      });

    return StoreService.of({
      state,
      getSnapshot: () => SubscriptionRef.get(state).pipe(Effect.runSync),
      update,
      updateSetting: (updates) => update((s) => ({ ...s, settings: { ...s.settings, ...updates } })),
      toggleSidebar: () => update((s) => ({ ...s, isSidebarOpen: !s.isSidebarOpen })),
      toggleSetting: () => update((s) => ({ ...s, isSettingOpen: !s.isSettingOpen })),
      setConfirm: (options) =>
        Effect.gen(function* () {
          const { onConfirm, ...rest } = options;
          const id = randomString(8);
          OnConfirmStore.set(id, onConfirm);
          yield* update((s) => ({
            ...s,
            confirm: {
              ...rest,
              id,
              isOpen: true,
            },
          }));
        }),
      getOnConfirm: (id) => Effect.sync(() => OnConfirmStore.get(id)),
      clearConfirm: (id) => Effect.sync(() => OnConfirmStore.delete(id)),
      notify: (type, message) =>
        update((s) => ({
          ...s,
          notifications: createNotification(type, message, s.notifications),
        })),
      clearNotification: (id) =>
        update((s) => ({
          ...s,
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
      loadMessages: (sessionId) =>
        Effect.gen(function* () {
          const currentState = yield* SubscriptionRef.get(state);
          const session = currentState.sessions[sessionId];
          if (!session || Object.keys(session.messages).length > 0) return;

          const messages = yield* storage.getMessages(sessionId);
          const messagesRecord: Record<string, Message> = {};
          messages.forEach((m) => (messagesRecord[m.id] = m));

          yield* update((s) => ({
            ...s,
            sessions: {
              ...s.sessions,
              [sessionId]: {
                ...s.sessions[sessionId],
                messages: messagesRecord,
              },
            },
          }));
        }),
    });
  }),
);
