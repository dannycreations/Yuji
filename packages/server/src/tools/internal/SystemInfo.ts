import { Effect, Schema } from 'effect';

import { getAvailableShells, getFriendlyOSName } from '@yuji/server/helpers/SystemHelper';
import { defineTool } from '@yuji/server/helpers/ToolHelper';

const SystemInfoSchema = Schema.Struct({});

export const SystemInfo = defineTool(
  'system_info',
  'Get information about the operating system and terminal shell environment.',
  SystemInfoSchema,
  () =>
    Effect.gen(function* () {
      return { os: getFriendlyOSName(), shell: yield* getAvailableShells() };
    }).pipe(Effect.catch((error) => Effect.succeed({ error: String(error) }))),
);
