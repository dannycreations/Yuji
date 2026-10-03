import { Effect, FileSystem, Schema, Scope } from 'effect';
import { ChildProcessSpawner } from 'effect/process';

import type { ToolDefinition } from '@yuji/client/app/Schema';

type ToolServices = FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner;

interface ToolImplementation {
  readonly name: string;
  readonly definition: ToolDefinition;
  readonly execute: (args: unknown) => Effect.Effect<unknown, unknown, ToolServices>;
}

export const defineTool = <A>(
  name: string,
  description: string,
  schema: Schema.ConstraintDecoder<A>,
  execute: (args: A) => Effect.Effect<unknown, unknown, Scope.Scope | ToolServices>,
): ToolImplementation => {
  const parameters = Schema.toJsonSchemaDocument(schema);
  return {
    name,
    definition: {
      type: 'function',
      function: {
        name,
        description,
        parameters,
      },
    },
    execute: (args: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(schema)(args);
        return yield* execute(decoded).pipe(Effect.scoped);
      }),
  };
};

interface FileProcessingError {
  readonly path: string;
  readonly error: string;
}

export const forEachFile = <F extends { readonly path: string }, R>(
  files: ReadonlyArray<F>,
  processFile: (file: F) => Effect.Effect<R, unknown, Scope.Scope | ToolServices>,
): Effect.Effect<Array<R | FileProcessingError>, never, Scope.Scope | ToolServices> =>
  Effect.forEach(files, (file) =>
    processFile(file).pipe(Effect.catch((error) => Effect.succeed<FileProcessingError>({ path: file.path, error: String(error) }))),
  );
