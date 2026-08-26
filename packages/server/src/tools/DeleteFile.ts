import { FileSystem } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { defineTool, forEachFile } from '@yuji/server/helpers/ToolHelper';

const DeleteFileSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String.annotations({ description: 'The path of the directory or file designated for deletion.' }),
    }),
  ).pipe(Schema.minItems(1), Schema.maxItems(20), Schema.annotations({ description: 'A list of files to delete.' })),
});

export const DeleteFile = defineTool(
  'delete_file',
  `USE this for the permanent and irrevocable removal of files or entire directory structures. This is the designated instrument for expunging obsolete artifacts from the workspace.`,
  DeleteFileSchema,
  ({ files }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* forEachFile(files, ({ path }) =>
        Effect.gen(function* () {
          const exists = yield* fs.exists(path);
          if (!exists) {
            return { path, error: `Path not found: ${path}` };
          }

          yield* fs.remove(path, { recursive: true });
          return { path, status: 'success' };
        }),
      );
    }),
);
