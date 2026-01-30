export interface Model {
  id: string;
  name: string;
  description: string;
  provider: 'OpenAI Compatible';
  icon: string;
  color: string;
  tags: string[];
  premium?: boolean;
  isNew?: boolean;
}

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
