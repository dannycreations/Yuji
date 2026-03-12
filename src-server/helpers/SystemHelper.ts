import os from 'node:os';
import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { Effect } from 'effect';

export const getFriendlyOSName = (): string => {
  const platform = os.platform();
  const release = os.release();

  if (platform === 'win32') {
    return 'Windows';
  }

  if (platform === 'darwin') {
    return 'macOS';
  }

  if (platform === 'linux') {
    return 'Linux';
  }

  return `${platform} ${release}`;
};

export const getAvailableShells = (): Effect.Effect<string[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const platform = os.platform();
    const shells: string[] = [];

    if (platform === 'win32') {
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const cmdPath = path.join(systemRoot, 'System32', 'cmd.exe');
      const powershellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const pwshPath = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');

      if (yield* fs.exists(cmdPath).pipe(Effect.catchAll(() => Effect.succeed(false)))) shells.push(cmdPath);
      if (yield* fs.exists(powershellPath).pipe(Effect.catchAll(() => Effect.succeed(false)))) shells.push(powershellPath);
      if (yield* fs.exists(pwshPath).pipe(Effect.catchAll(() => Effect.succeed(false)))) shells.push(pwshPath);
    } else {
      const commonShells = ['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/bash', '/usr/bin/zsh'];
      for (const shell of commonShells) {
        if (yield* fs.exists(shell).pipe(Effect.catchAll(() => Effect.succeed(false)))) {
          shells.push(shell);
        }
      }

      if (yield* fs.exists('/etc/shells').pipe(Effect.catchAll(() => Effect.succeed(false)))) {
        const content = yield* fs.readFileString('/etc/shells', 'utf8').pipe(Effect.orElseSucceed(() => ''));
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (
            trimmed &&
            !trimmed.startsWith('#') &&
            !shells.includes(trimmed) &&
            (yield* fs.exists(trimmed).pipe(Effect.catchAll(() => Effect.succeed(false))))
          ) {
            shells.push(trimmed);
          }
        }
      }
    }

    if (shells.length > 0) {
      return shells;
    }

    return [process.env.SHELL || process.env.COMSPEC || 'unknown'];
  });
