import { ReadFile } from './ReadFile.js';

export const tools = {
  [ReadFile.name]: ReadFile,
} as const;
