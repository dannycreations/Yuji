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

export const MERMAID_CONFIG = (theme: 'dark' | 'light') => {
  const isDark = theme === 'dark';
  return {
    startOnLoad: false,
    theme: 'base' as const,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    themeVariables: {
      fontSize: '14px',
      primaryColor: isDark ? '#2f2f2f' : '#f3f4f6',
      primaryTextColor: isDark ? '#ececec' : '#111827',
      primaryBorderColor: isDark ? '#424242' : '#d1d5db',
      lineColor: isDark ? '#71717a' : '#9ca3af',
      secondaryColor: isDark ? '#171717' : '#f9fafb',
      tertiaryColor: isDark ? '#212121' : '#ffffff',
      mainBkg: isDark ? '#2f2f2f' : '#f3f4f6',
      nodeBorder: isDark ? '#424242' : '#d1d5db',
      clusterBkg: isDark ? '#171717' : '#f9fafb',
      clusterBorder: isDark ? '#424242' : '#d1d5db',
      defaultLinkColor: isDark ? '#71717a' : '#9ca3af',
      titleColor: isDark ? '#ececec' : '#111827',
      edgeLabelBackground: isDark ? '#0d0d0d' : '#ffffff',
      nodeTextColor: isDark ? '#ececec' : '#111827',
      noteBkgColor: isDark ? '#424242' : '#e5e7eb',
      noteTextColor: isDark ? '#ececec' : '#111827',
      noteBorderColor: isDark ? '#71717a' : '#9ca3af',
      actorBkg: isDark ? '#2f2f2f' : '#f3f4f6',
      actorBorder: isDark ? '#424242' : '#d1d5db',
      actorTextColor: isDark ? '#ececec' : '#111827',
      actorLineColor: isDark ? '#71717a' : '#9ca3af',
      signalColor: isDark ? '#ececec' : '#111827',
      signalTextColor: isDark ? '#ececec' : '#111827',
      labelBoxBkgColor: isDark ? '#2f2f2f' : '#f3f4f6',
      labelBoxBorderColor: isDark ? '#424242' : '#d1d5db',
      labelTextColor: isDark ? '#ececec' : '#111827',
      loopTextColor: isDark ? '#ececec' : '#111827',
    },
  };
};

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
