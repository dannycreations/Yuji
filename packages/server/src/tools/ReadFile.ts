import { FileSystem } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { defineTool, forEachFile } from '@yuji/server/helpers/ToolHelper';

const ReadFileSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String.annotations({ description: 'The explicit file path for content acquisition.' }),
    }),
  ).pipe(Schema.minItems(1), Schema.maxItems(20), Schema.annotations({ description: 'A list of target file paths for content ingestion.' })),
});

export const ReadFile = defineTool(
  'read_file',
  `USE this to ingest the complete contents of specified files into the active context. This is the designated method for gaining awareness of a file's content for subsequent analysis or modification. This mandate is to be bypassed if, and only if, the file's content is already present and known to be current; redundant data ingestion is inefficient and thus forbidden.`,
  ReadFileSchema,
  ({ files }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* forEachFile(files, ({ path }) =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(path);
          if (!exists) {
            return { path, error: `File not found: ${path}` };
          }

          const content = yield* fs.readFileString(path);
          return { path, content };
        }),
      );
    }),
);
