export interface Model {
  id: string;
  name: string;
  description: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google' | 'Meta' | 'Alibaba' | 'Mistral' | 'Other';
  icon: string;
  color: string;
  tags: string[];
  premium?: boolean;
  isNew?: boolean;
}

export const MODELS: Model[] = [
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    description: 'Lightning-fast with surprising capability.',
    provider: 'Google',
    icon: 'Zap',
    color: 'text-amber-400',
    tags: ['Fast', 'Multi'],
    isNew: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: "OpenAI's flagship multimodal model.",
    provider: 'OpenAI',
    icon: 'Sparkles',
    color: 'text-emerald-400',
    tags: ['Smart', 'Multi'],
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: "Anthropic's most advanced Sonnet yet.",
    provider: 'Anthropic',
    icon: 'Brain',
    color: 'text-orange-400',
    tags: ['Coding', 'Reasoning'],
    premium: true,
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    description: "Google's newest flagship with advanced reasoning.",
    provider: 'Google',
    icon: 'Sparkles',
    color: 'text-purple-400',
    tags: ['Smart', 'Reasoning'],
    premium: true,
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2 (Instant)',
    description: 'Next-gen speed and intelligence.',
    provider: 'OpenAI',
    icon: 'Cpu',
    color: 'text-emerald-500',
    tags: ['Experimental'],
    isNew: true,
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'High fidelity image generation built on Gemini.',
    provider: 'Google',
    icon: 'Box',
    color: 'text-pink-400',
    tags: ['Image', 'Creative'],
    premium: true,
  },
  {
    id: 'kimi-k2',
    name: 'Kimi K2 (0905)',
    description: 'Enhanced version with longer context.',
    provider: 'Other',
    icon: 'Orbit',
    color: 'text-zinc-200',
    tags: ['Long Context'],
    isNew: true,
  },
  {
    id: 'qwen-2.5-72b',
    name: 'Qwen 2.5 72B',
    description: 'Versatile open model with strong reasoning.',
    provider: 'Alibaba',
    icon: 'Cpu',
    color: 'text-violet-400',
    tags: ['Open Source'],
  },
  {
    id: 'llama3-70b-8192',
    name: 'Llama 3 70B',
    description: 'Powerful open weights model.',
    provider: 'Meta',
    icon: 'Box',
    color: 'text-blue-400',
    tags: ['Open Source'],
  },
];
