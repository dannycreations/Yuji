import { Data, Schema } from 'effect';

export const ModelSchema = Schema.Struct({
  _tag: Schema.Literal('Model'),
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

export type Model = Schema.Schema.Type<typeof ModelSchema>;

export const Model = Data.tagged<Model>('Model');

export const MODELS: ReadonlyArray<Model> = [
  Model({
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: "OpenAI's flagship multimodal model.",
    provider: 'OpenAI Compatible',
    icon: 'Sparkles',
    color: 'text-emerald-400',
    tags: ['Smart', 'Multi'],
  }),
  Model({
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and efficient model for most tasks.',
    provider: 'OpenAI Compatible',
    icon: 'Zap',
    color: 'text-emerald-400',
    tags: ['Fast'],
  }),
  Model({
    id: 'o1-preview',
    name: 'o1-preview',
    description: 'Newest reasoning model.',
    provider: 'OpenAI Compatible',
    icon: 'Brain',
    color: 'text-emerald-400',
    tags: ['Reasoning'],
  }),
];

export const Role = Schema.Literal('system', 'user', 'assistant');
export type Role = Schema.Schema.Type<typeof Role>;

export const Attachment = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal('image'),
  url: Schema.String,
  name: Schema.String,
});
export type Attachment = Schema.Schema.Type<typeof Attachment>;

export const Message = Schema.Struct({
  id: Schema.String,
  role: Role,
  content: Schema.String,
  attachments: Schema.optional(Schema.Array(Attachment)),
  timestamp: Schema.Number,
  parentId: Schema.optional(Schema.String),
  childrenIds: Schema.optional(Schema.Array(Schema.String)),
});
export type Message = Schema.Schema.Type<typeof Message>;

export const ModelConfig = Schema.Struct({
  provider: Schema.Literal('openai'),
  model: Schema.String,
  temperature: Schema.Number,
  maxTokens: Schema.optional(Schema.Number),
  topP: Schema.optional(Schema.Number),
});
export type ModelConfig = Schema.Schema.Type<typeof ModelConfig>;

export const ChatSession = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  messages: Schema.Array(Message),
  activeMessageId: Schema.optional(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  systemPrompt: Schema.optional(Schema.String),
  overrideGlobalPrompt: Schema.optional(Schema.Boolean),
  modelConfig: Schema.optional(ModelConfig),
});
export type ChatSession = Schema.Schema.Type<typeof ChatSession>;

export const Settings = Schema.Struct({
  apiKey: Schema.String,
  baseUrl: Schema.String,
  defaultModel: Schema.String,
  theme: Schema.Literal('dark', 'light'),
  enterToSend: Schema.Boolean,
  userName: Schema.String,
  userOccupation: Schema.String,
  assistantTraits: Schema.Array(Schema.String),
  additionalContext: Schema.String,
  disabledModels: Schema.Array(Schema.String),
});
export type Settings = Schema.Schema.Type<typeof Settings>;

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

export const AppStoreState = Schema.Struct({
  sessions: Schema.Record({ key: Schema.String, value: ChatSession }),
  activeSessionId: Schema.NullOr(Schema.String),
  settings: Settings,
  availableModels: Schema.Array(ModelSchema),
  isSidebarOpen: Schema.Boolean,
  isSettingsOpen: Schema.Boolean,
});
export type AppStoreState = Schema.Schema.Type<typeof AppStoreState>;

export const AppState = Schema.extend(
  AppStoreState,
  Schema.Struct({
    confirm: ConfirmState,
  }),
);
export type AppState = Schema.Schema.Type<typeof AppState>;
