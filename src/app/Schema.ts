import { Schema } from 'effect';

export const Model = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  icon: Schema.String,
  color: Schema.String,
});
export type Model = Schema.Schema.Type<typeof Model>;

export const Attachment = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal('image'),
  url: Schema.String,
  name: Schema.String,
});
export type Attachment = Schema.Schema.Type<typeof Attachment>;

export const Instruction = Schema.Struct({ systemPrompt: Schema.String });
export type Instruction = Schema.Schema.Type<typeof Instruction>;

export const Personalisation = Schema.Struct({
  userName: Schema.String,
  userOccupation: Schema.Array(Schema.String),
  assistantTraits: Schema.Array(Schema.String),
  additionalContext: Schema.String,
});
export type Personalisation = Schema.Schema.Type<typeof Personalisation>;

export const GlobalSetting = Schema.Struct({
  apiKey: Schema.String,
  baseUrl: Schema.String,
  model: Schema.String,
  theme: Schema.Literal('dark', 'light'),
  enterToSend: Schema.Boolean,
  expandCodeblock: Schema.Boolean,
  showSuggestions: Schema.Boolean,
  saveAfterEditing: Schema.Boolean,
  instruction: Instruction,
  personalisation: Personalisation,
  disabledModels: Schema.Array(Schema.String),
});
export type GlobalSetting = Schema.Schema.Type<typeof GlobalSetting>;

export const ThreadSetting = Schema.Struct({
  general: Schema.Struct({
    model: Schema.optional(Schema.String),
    overrideInstruction: Schema.optional(Schema.Boolean),
    overridePersonalisation: Schema.optional(Schema.Boolean),
  }),
  instruction: Instruction,
  personalisation: Personalisation,
});
export type ThreadSetting = Schema.Schema.Type<typeof ThreadSetting>;

export const ThreadMetadata = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  activeMessageId: Schema.optional(Schema.String),
  archived: Schema.optional(Schema.Boolean),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});
export type ThreadMetadata = Schema.Schema.Type<typeof ThreadMetadata>;

export const ThreadMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal('system', 'user', 'assistant'),
  content: Schema.String,
  attachments: Schema.optional(Schema.Array(Attachment)),
  timestamp: Schema.Number,
  parentId: Schema.optional(Schema.String),
  childrenIds: Schema.optional(Schema.Array(Schema.String)),
  isError: Schema.optional(Schema.Boolean),
});
export type ThreadMessage = Schema.Schema.Type<typeof ThreadMessage>;

export const Thread = Schema.extend(
  ThreadMetadata,
  Schema.extend(
    ThreadSetting,
    Schema.Struct({
      messages: Schema.Record({ key: Schema.String, value: ThreadMessage }),
    }),
  ),
);
export type Thread = Schema.Schema.Type<typeof Thread>;

export const ConfirmState = Schema.Struct({
  isOpen: Schema.Boolean,
  id: Schema.optional(Schema.String),
  title: Schema.String,
  message: Schema.String,
  confirmLabel: Schema.optional(Schema.String),
  cancelLabel: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.Literal('danger', 'warning', 'info')),
});
export type ConfirmState = Schema.Schema.Type<typeof ConfirmState>;
export type ConfirmOptions = Omit<ConfirmState, 'isOpen' | 'id'> & { readonly onConfirm: () => void };

export const Notification = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal('error', 'warning', 'info', 'success'),
  message: Schema.String,
  timestamp: Schema.Number,
});
export type Notification = Schema.Schema.Type<typeof Notification>;

export const AppStoreState = Schema.Struct({
  activeThreadId: Schema.NullOr(Schema.String),
  settings: GlobalSetting,
  availableModels: Schema.Array(Model),
  pinnedThreadIds: Schema.Array(Schema.String),
  backgroundThreadIds: Schema.Array(Schema.String),
});
export type AppStoreState = Schema.Schema.Type<typeof AppStoreState>;

export const AppRuntimeState = Schema.extend(
  AppStoreState,
  Schema.Struct({
    threads: Schema.Record({ key: Schema.String, value: ThreadMetadata }),
    activeThread: Schema.NullOr(Thread),
    isSidebarOpen: Schema.Boolean,
    isSettingOpen: Schema.Boolean,
    isHydrated: Schema.Boolean,
    confirm: ConfirmState,
    notifications: Schema.Array(Notification),
    initializationError: Schema.optional(Schema.String),
  }),
);
export type AppRuntimeState = Schema.Schema.Type<typeof AppRuntimeState>;
