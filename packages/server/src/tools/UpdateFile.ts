import { FileSystem } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { defineTool, forEachFile } from '@yuji/server/helpers/ToolHelper';

const UpdateFileSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String.annotations({ description: 'The path of the file designated for modification.' }),
      edits: Schema.Array(
        Schema.Struct({
          search: Schema.String.annotations({ description: 'The exact text to be replaced.' }),
          replace: Schema.String.annotations({ description: 'The replacement text.' }),
        }),
      ).pipe(Schema.minItems(1), Schema.annotations({ description: 'A list of search and replace pairs for the file.' })),
    }),
  ).pipe(Schema.minItems(1), Schema.maxItems(20), Schema.annotations({ description: 'A list of files to update.' })),
});

export const UpdateFile = defineTool(
  'update_file',
  `USE this to execute precise, surgical modifications of existing files. This tool performs targeted text replacement using explicit search and replace fields.`,
  UpdateFileSchema,
  ({ files }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return yield* forEachFile(files, ({ path, edits }) =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(path);
          if (!exists) {
            return { path, error: `File not found: ${path}` };
          }

          let content = yield* fs.readFileString(path);

          for (const { search, replace } of edits) {
            if (!content.includes(search)) {
              return { path, error: `Search text not found in file: ${path}` };
            }
            content = content.replace(search, replace);
          }

          yield* fs.writeFileString(path, content);
          return { path, status: 'success' };
        }),
      );
    }),
);
