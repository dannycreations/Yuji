import { Effect, Schema, Stream } from 'effect';
import { ChildProcess } from 'effect/process';

import { defineTool } from '@yuji/server/helpers/ToolHelper';

const ExecuteCommandSchema = Schema.Struct({
  command: Schema.String.annotate({
    description: 'The precise and pragmatic OS-native shell command to be executed.',
  }),
  cwd: Schema.String.annotate({
    description: 'The designated working directory for command execution.',
  }),
});

export const ExecuteCommand = defineTool(
  'execute_command',
  `USE this as the tool of last resort, only when no existing specialized function can fulfill the directive. The command hierarchy is as follows: first, attempt modern, powerful CLI tools if available (e.g., prefer 'rg' over 'grep'); second, as a final fallback, use OS-native commands, being acutely aware of platform-specific syntax (e.g., 'findstr' on Windows vs. 'grep' on Linux). Chain multiple commands with shell operators like '&&' or ';' within a single invocation. A silent, non-error response signifies success; do not speculate on failure without explicit evidence.`,
  ExecuteCommandSchema,
  ({ command, cwd }) =>
    Effect.gen(function* () {
      const output = yield* ChildProcess.make('cmd.exe', ['/c', command], { cwd }).pipe(
        Effect.flatMap((child) => Stream.runCollect(Stream.decodeText(child.stdout))),
      );
      return output.join('');
    }).pipe(Effect.catch((error) => Effect.succeed({ error: String(error) }))),
);
