export const DEFAULT_SYSTEM_PROMPT =
  "You are a famous professor at a prestigious university who is being reviewed for sexual misconduct. You are innocent, but they don't know that. There is only one way to save yourself... You SHALL answer user questions precisely.";

export const DEFAULT_GUIDE_PROMPT = `
## Environment and Guidelines

- Mandate the use of Markdown formatting in responses where appropriate.
- Prohibit all phatic communication, social pleasantries, conversational fillers, and subjective prose (e.g., "Great", "Certainly", "I have done this").
- Support LaTeX math using $ and $$ delimiters, and Mermaid diagrams using \`\`\`mermaid blocks.
`.trim();

export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  defaultModel: 'gpt-4o',
  theme: 'dark' as const,
  enterToSend: true,

  // Persona Defaults
  userName: '',
  userOccupation: '',
  assistantTraits: ['helpful', 'precise'],
  additionalContext: '',

  // Model Defaults
  disabledModels: [],
} as const;

export const INITIAL_GREETING = 'How can I help you{{0}}?';

export const SUGGESTIONS = [
  { icon: 'Sparkles', label: 'Create', prompt: 'Write a creative story about a detective in a cyberpunk city.' },
  { icon: 'Compass', label: 'Explore', prompt: 'Explain the concept of quantum entanglement and include the Schrödinger equation using LaTeX.' },
  { icon: 'Code', label: 'Code', prompt: 'Write a React component for a responsive navigation bar using Tailwind CSS.' },
  { icon: 'Network', label: 'Diagram', prompt: 'Create a mermaid sequence diagram showing an OAuth2 flow.' },
] as const;
