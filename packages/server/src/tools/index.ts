import { DeleteFile } from '@yuji/server/tools/DeleteFile';
import { ExecuteCommand } from '@yuji/server/tools/ExecuteCommand';
import { SystemInfo } from '@yuji/server/tools/internal/SystemInfo';
import { ListFile } from '@yuji/server/tools/ListFile';
import { ReadFile } from '@yuji/server/tools/ReadFile';
import { SearchFile } from '@yuji/server/tools/SearchFile';
import { UpdateFile } from '@yuji/server/tools/UpdateFile';
import { WriteFile } from '@yuji/server/tools/WriteFile';

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
const INTERNAL_TOOL_LIST = {
  [SystemInfo.name]: SystemInfo,
} as const;

export const TOOL_LIST = {
  ...EXTERNAL_TOOL_LIST,
  ...INTERNAL_TOOL_LIST,
} as const;
