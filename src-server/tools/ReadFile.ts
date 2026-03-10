import { FileSystem } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { defineTool } from '../helpers/ToolHelper';

const ReadFileSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String.annotations({ description: 'The explicit file path for content acquisition.' }),
    }),
  ).annotations({
    description: 'A list of target file paths for content ingestion.',
    jsonSchema: { minItems: 1, maxItems: 20 },
  }),
});

export const ReadFile = defineTool(
  'read_file',
  `USE this to ingest the complete contents of specified files into the active context. This is the designated method for gaining awareness of a file's content for subsequent analysis or modification. This mandate is to be bypassed if, and only if, the file's content is already present and known to be current; redundant data ingestion is inefficient and thus forbidden.`,
  ReadFileSchema,
  ({ files }: { readonly files: ReadonlyArray<{ readonly path: string }> }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* Effect.forEach(
        files,
        ({ path }) =>
          Effect.gen(function* () {
            const exists = yield* fs.exists(path);
            if (!exists) {
              return { path, error: `File not found: ${path}` };
            }

            const content = yield* fs.readFileString(path);
            return { path, content };
          }).pipe(Effect.catchAll((error) => Effect.succeed({ path, error: String(error) }))),
        { concurrency: 'inherit' },
      );
    }),
);
