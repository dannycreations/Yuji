import { FileSystem } from '@effect/platform';
import { Effect, JSONSchema, Schema } from 'effect';

import type { ToolDefinition } from '@yuji/client/app/Schema';

export interface ToolImplementation<A = unknown, I = unknown, R = unknown> {
  readonly name: string;
  readonly definition: ToolDefinition;
  readonly schema: Schema.Schema<A, I, R>;
  readonly execute: (args: unknown) => Effect.Effect<unknown, unknown, unknown>;
}

export const defineTool = <A, I, R, E, RE>(
  name: string,
  description: string,
  schema: Schema.Schema<A, I, R>,
  execute: (args: A) => Effect.Effect<unknown, E, RE>,
): ToolImplementation<A, I, R> => {
  const parameters = JSONSchema.make(schema);
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
    schema,
    execute: (args: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(schema)(args);
        return yield* execute(decoded);
      }),
  };
};

export interface FileProcessingError {
  readonly path: string;
  readonly error: string;
}

export const forEachFile = <F extends { readonly path: string }, R>(
  files: ReadonlyArray<F>,
  processFile: (file: F) => Effect.Effect<R, unknown, FileSystem.FileSystem>,
): Effect.Effect<Array<R | FileProcessingError>, never, FileSystem.FileSystem> =>
  Effect.forEach(
    files,
    (file) => processFile(file).pipe(Effect.catchAll((error) => Effect.succeed<FileProcessingError>({ path: file.path, error: String(error) }))),
    { concurrency: 'inherit' },
  );
