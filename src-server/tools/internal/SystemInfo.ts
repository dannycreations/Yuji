import { Effect, Schema } from 'effect';

import { getAvailableShells, getFriendlyOSName } from '../../helpers/SystemHelper.js';
import { defineTool } from '../../helpers/ToolHelper.js';

const SystemInfoSchema = Schema.Struct({});

export interface SystemInfoResponse {
  readonly os: string;
  readonly shell: string[];
}

export const SystemInfo = defineTool(
  'system_info',
  'Get information about the operating system and terminal shell environment.',
  SystemInfoSchema,
  () =>
    Effect.gen(function* () {
      const os = getFriendlyOSName();
      const shell = yield* getAvailableShells();
      return { os, shell } as SystemInfoResponse;
    }).pipe(Effect.catchAll((error) => Effect.succeed({ error: String(error) }))),
);
