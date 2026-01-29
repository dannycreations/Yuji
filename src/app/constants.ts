export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful, intelligent, and precise AI assistant. You answer questions accurately and concisely using Markdown formatting where appropriate. You support LaTeX math using $ and $$ delimiters, and Mermaid diagrams using ```mermaid blocks.';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  defaultModel: 'gpt-4o',
  theme: 'dark' as const,
  enterToSend: true,

  // Persona Defaults
  userName: '',
  userOccupation: '',
  assistantTraits: ['helpful', 'precise'],
  additionalContext: '',
};

export const INITIAL_GREETING = 'How can I help you today?';

export const SUGGESTIONS = [
  { icon: 'Sparkles', label: 'Create', prompt: 'Write a creative story about a detective in a cyberpunk city.' },
  { icon: 'Compass', label: 'Explore', prompt: 'Explain the concept of quantum entanglement to a 5-year-old.' },
  { icon: 'Code', label: 'Code', prompt: 'Write a React component for a responsive navigation bar using Tailwind CSS.' },
  { icon: 'Network', label: 'Diagram', prompt: 'Create a mermaid sequence diagram showing an OAuth2 flow.' },
];
