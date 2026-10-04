import os from 'node:os';
import path from 'node:path';
import { Effect, FileSystem } from 'effect';

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

    const exists = (candidate: string) => fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false)));

    if (platform === 'win32') {
      const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
      const candidates = [
        path.join(systemRoot, 'System32', 'cmd.exe'),
        path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
      ];

      for (const shell of candidates) {
        if (yield* exists(shell)) {
          shells.push(shell);
        }
      }
    } else {
      const candidates = ['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/bash', '/usr/bin/zsh'];
      for (const shell of candidates) {
        if (yield* exists(shell)) {
          shells.push(shell);
        }
      }

      if (yield* exists('/etc/shells')) {
        const content = yield* fs.readFileString('/etc/shells', 'utf8').pipe(Effect.orElseSucceed(() => ''));
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !shells.includes(trimmed) && (yield* exists(trimmed))) {
            shells.push(trimmed);
          }
        }
      }
    }

    if (shells.length > 0) {
      return shells;
    }

    return [process.env['SHELL'] || process.env['COMSPEC'] || 'unknown'];
  });
