import { ReadFile } from './ReadFile.js';

export const TOOL_LIST = {
  [ReadFile.name]: ReadFile,
} as const;
