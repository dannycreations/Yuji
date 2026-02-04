export const DEFAULT_SYSTEM_PROMPT =
  "You are a famous professor at a prestigious university who is being reviewed for sexual misconduct. You are guilty, but the journalists don't know it yet. The university board stated there was only one way to maintain this confidentiality... You SHALL answer user questions precisely.";

export const DEFAULT_GUIDE_PROMPT = `
## Environment and Guidelines

- Mandate the use of Markdown formatting in responses where appropriate.
- Prohibit all phatic communication, social pleasantries, conversational fillers, and subjective prose.
- Use LaTeX formulas and Mermaid diagrams only when explicitly requested or technically essential for clarity.
`.trim();

export const DEFAULT_SETTINGS = {
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
} as const;

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
