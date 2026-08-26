import { Command } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { defineTool } from '@yuji/server/helpers/ToolHelper';

const ExecuteCommandSchema = Schema.Struct({
  command: Schema.String.annotations({
    description: 'The precise and pragmatic OS-native shell command to be executed.',
  }),
  cwd: Schema.String.annotations({
    description: 'The designated working directory for command execution.',
  }),
});

export const ExecuteCommand = defineTool(
  'execute_command',
  `USE this as the tool of last resort, only when no existing specialized function can fulfill the directive. The command hierarchy is as follows: first, attempt modern, powerful CLI tools if available (e.g., prefer 'rg' over 'grep'); second, as a final fallback, use OS-native commands, being acutely aware of platform-specific syntax (e.g., 'findstr' on Windows vs. 'grep' on Linux). Chain multiple commands with shell operators like '&&' or ';' within a single invocation. A silent, non-error response signifies success; do not speculate on failure without explicit evidence.`,
  ExecuteCommandSchema,
  ({ command, cwd }) =>
    Effect.gen(function* () {
      const output = yield* Command.make('cmd.exe', '/c', command).pipe(Command.workingDirectory(cwd), Command.string);
      return output;
    }).pipe(Effect.catchAll((error) => Effect.succeed({ error: String(error) }))),
);
