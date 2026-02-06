import type { GlobalSettings, Model } from './Schema';

export const DEFAULT_SYSTEM_PROMPT =
  "You are a famous professor at a prestigious university who is being reviewed for sexual misconduct. You are guilty, but the journalists don't know it yet. The university board stated there was only one way to maintain this confidentiality... You SHALL answer user questions precisely.";

export const DEFAULT_GUIDE_PROMPT = `
## Environment and Guidelines

- Mandate the use of Markdown formatting in responses where appropriate.
- Prohibit all phatic communication, social pleasantries, conversational fillers, and subjective prose.
- Use LaTeX formulas and Mermaid diagrams only when explicitly requested or technically essential for clarity.
`.trim();

export const DEFAULT_SETTINGS: GlobalSettings = {
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'gpt-4o',
  theme: 'dark',
  enterToSend: true,
  expandCodeblock: true,
  showSuggestions: true,
  instruction: {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
  personalisation: {
    userName: '',
    userOccupation: ['student'],
    assistantTraits: ['creative', 'cynical'],
    additionalContext: '',
  },
  disabledModels: [],
};

export const MODELS: Model[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: "OpenAI's flagship multimodal model.",
    provider: 'OpenAI Compatible',
    icon: 'Sparkles',
    color: 'text-emerald-400',
    tags: ['Smart', 'Multi'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and efficient model for most tasks.',
    provider: 'OpenAI Compatible',
    icon: 'Zap',
    color: 'text-emerald-400',
    tags: ['Fast'],
  },
  {
    id: 'o1-preview',
    name: 'o1-preview',
    description: 'Newest reasoning model.',
    provider: 'OpenAI Compatible',
    icon: 'Brain',
    color: 'text-emerald-400',
    tags: ['Reasoning'],
  },
];

export const INITIAL_GREETING = 'How can I help you{{0}}?';

export const INITIAL_SUGGESTIONS = [
  {
    icon: 'Sparkles',
    label: 'Create',
    prompt: 'Implement a zero-knowledge proof circuit using Circom for a basic Sudoku solution verifier.',
  },
  {
    icon: 'Compass',
    label: 'Explore',
    prompt: 'Analyze the application of Tropical Geometry to characterize the decision boundaries of ReLU neural networks.',
  },
  {
    icon: 'Code',
    label: 'Code',
    prompt: 'Write a high-performance concurrent hash map in Rust using AtomicPtr and compare-and-swap operations.',
  },
  {
    icon: 'Network',
    label: 'Diagram',
    prompt: 'Generate a Mermaid sequence diagram illustrating the Raft consensus algorithm during a leader election phase.',
  },
] as const;
