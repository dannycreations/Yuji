import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';

import { DEFAULT_SETTINGS } from '../app/Constant';
import { MODELS } from '../app/Schema';
import { randomString } from '../utilities/CommonUtil';
import { StorageService } from './StorageService';

import type { AppRuntimeState, ChatMetadata, ChatSession, ConfirmState, Message } from '../app/Schema';

export interface StoreService {
  readonly state: SubscriptionRef.SubscriptionRef<AppRuntimeState>;
  readonly getSnapshot: () => AppRuntimeState;
  readonly update: (f: (state: AppRuntimeState) => AppRuntimeState) => Effect.Effect<void>;
  readonly setActiveSession: (session: ChatSession | null) => Effect.Effect<void>;
  readonly updateSetting: (updates: Partial<AppRuntimeState['settings']>) => Effect.Effect<void>;
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
  existingNotifications: ReadonlyArray<AppRuntimeState['notifications'][number]>,
): AppRuntimeState['notifications'] => {
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

const INITIAL_STATE: AppRuntimeState = {
  sessions: {},
  activeSessionId: null,
  activeSession: null,
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
        const sessionsMap: Record<string, ChatMetadata> = {};
        for (const header of sessionHeaders) {
          sessionsMap[header.id] = header;
        }

        let activeSession: ChatSession | null = null;
        if (metadata.activeSessionId && sessionsMap[metadata.activeSessionId]) {
          const header = sessionsMap[metadata.activeSessionId];
          const messages = yield* storage.getMessages(header.id);
          const messagesRecord: Record<string, Message> = {};
          messages.forEach((m) => (messagesRecord[m.id] = m));
          activeSession = { ...header, messages: messagesRecord };
        }

        return {
          ...INITIAL_STATE,
          activeSessionId: metadata.activeSessionId,
          activeSession,
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
        Stream.runForEach((meta) => storage.saveMetadata(meta as any)),
      ),
    );

    // Persistence Loop: Sessions
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
            return p !== c;
          });
        }),
        Stream.filter((ids) => ids.length > 0),
        Stream.debounce('1 seconds'),
        Stream.runForEach((ids) =>
          Effect.gen(function* () {
            const current = yield* SubscriptionRef.get(state);
            yield* Effect.all(
              ids
                .map((id) => current.sessions[id])
                .filter((s): s is ChatMetadata => !!s)
                .map((s) => storage.saveSession(s)),
              { discard: true },
            );
          }),
        ),
      ),
    );

    const update = (f: (state: AppRuntimeState) => AppRuntimeState) => SubscriptionRef.update(state, f);

    return StoreService.of({
      state,
      getSnapshot: () => SubscriptionRef.get(state).pipe(Effect.runSync),
      update,
      setActiveSession: (activeSession) => update((s) => ({ ...s, activeSession, activeSessionId: activeSession?.id ?? null })),
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
          const header = currentState.sessions[sessionId];
          if (!header || (currentState.activeSessionId === sessionId && currentState.activeSession)) return;

          const messages = yield* storage.getMessages(sessionId);
          const messagesRecord: Record<string, Message> = {};
          messages.forEach((m) => (messagesRecord[m.id] = m));

          yield* update((s) => ({
            ...s,
            activeSessionId: sessionId,
            activeSession: { ...header, messages: messagesRecord },
          }));
        }),
    });
  }),
);
