import { spawn } from 'node:child_process';
import process from 'node:process';
const child = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'build',
    '--watch',
    '--config',
    'frontend/vite.config.ts',
  ],
  { stdio: 'inherit' },
);
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  if (code) process.exitCode = code;
});
