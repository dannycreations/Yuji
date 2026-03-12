import { DeleteFile } from './DeleteFile.js';
import { ExecuteCommand } from './ExecuteCommand.js';
import { SystemInfo } from './internal/SystemInfo.js';
import { ListFile } from './ListFile.js';
import { ReadFile } from './ReadFile.js';
import { SearchFile } from './SearchFile.js';
import { UpdateFile } from './UpdateFile.js';
import { WriteFile } from './WriteFile.js';

// Tools to be used by the agent.
export const EXTERNAL_TOOL_LIST = {
  [ReadFile.name]: ReadFile,
  [WriteFile.name]: WriteFile,
  [UpdateFile.name]: UpdateFile,
  [DeleteFile.name]: DeleteFile,
  [ListFile.name]: ListFile,
  [SearchFile.name]: SearchFile,
  [ExecuteCommand.name]: ExecuteCommand,
} as const;

// Tools to be used by the client.
export const INTERNAL_TOOL_LIST = {
  [SystemInfo.name]: SystemInfo,
} as const;

export const TOOL_LIST = {
  ...EXTERNAL_TOOL_LIST,
  ...INTERNAL_TOOL_LIST,
} as const;
