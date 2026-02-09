import { Schema } from 'effect';

export const Model = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  provider: Schema.Literal('OpenAI Compatible'),
  icon: Schema.String,
  color: Schema.String,
  tags: Schema.Array(Schema.String),
  premium: Schema.optional(Schema.Boolean),
  isNew: Schema.optional(Schema.Boolean),
});
export type Model = Schema.Schema.Type<typeof Model>;

export const ModelConfig = Schema.Struct({
  provider: Schema.Literal('openai'),
  model: Schema.String,
  temperature: Schema.Number,
  maxTokens: Schema.optional(Schema.Number),
  topP: Schema.optional(Schema.Number),
});
export type ModelConfig = Schema.Schema.Type<typeof ModelConfig>;

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

export const GlobalSettings = Schema.Struct({
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
export type GlobalSettings = Schema.Schema.Type<typeof GlobalSettings>;

export const ThreadSettings = Schema.Struct({
  general: Schema.Struct({
    model: Schema.optional(Schema.String),
    overrideInstruction: Schema.optional(Schema.Boolean),
    overridePersonalisation: Schema.optional(Schema.Boolean),
  }),
  instruction: Instruction,
  personalisation: Personalisation,
});
export type ThreadSettings = Schema.Schema.Type<typeof ThreadSettings>;

export const ChatMetadata = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  activeMessageId: Schema.optional(Schema.String),
  archived: Schema.optional(Schema.Boolean),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});
export type ChatMetadata = Schema.Schema.Type<typeof ChatMetadata>;

export const ChatMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal('system', 'user', 'assistant'),
  content: Schema.String,
  attachments: Schema.optional(Schema.Array(Attachment)),
  timestamp: Schema.Number,
  parentId: Schema.optional(Schema.String),
  childrenIds: Schema.optional(Schema.Array(Schema.String)),
  isError: Schema.optional(Schema.Boolean),
});
export type ChatMessage = Schema.Schema.Type<typeof ChatMessage>;

export const ChatThread = Schema.extend(
  ChatMetadata,
  Schema.extend(
    ThreadSettings,
    Schema.Struct({
      messages: Schema.Record({ key: Schema.String, value: ChatMessage }),
    }),
  ),
);
export type ChatThread = Schema.Schema.Type<typeof ChatThread>;

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
  settings: GlobalSettings,
  availableModels: Schema.Array(Model),
  pinnedThreadIds: Schema.Array(Schema.String),
  backgroundThreadIds: Schema.Array(Schema.String),
});
export type AppStoreState = Schema.Schema.Type<typeof AppStoreState>;

export const AppRuntimeState = Schema.extend(
  AppStoreState,
  Schema.Struct({
    threads: Schema.Record({ key: Schema.String, value: ChatMetadata }),
    activeThread: Schema.NullOr(ChatThread),
    isSidebarOpen: Schema.Boolean,
    isSettingOpen: Schema.Boolean,
    isHydrated: Schema.Boolean,
    confirm: ConfirmState,
    notifications: Schema.Array(Notification),
    initializationError: Schema.optional(Schema.String),
  }),
);
export type AppRuntimeState = Schema.Schema.Type<typeof AppRuntimeState>;
