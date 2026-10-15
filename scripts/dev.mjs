import { spawn } from 'node:child_process';
import process from 'node:process';
// One watcher per bundle: the module build and the classic content scripts.
const children = [
  ['--config', 'frontend/vite.config.ts'],
  ['--config', 'frontend/vite.content.config.ts'],
  ['--config', 'frontend/vite.content.config.ts', '--mode', 'smart'],
].map((args) =>
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--watch', ...args],
    { stdio: 'inherit' },
  ),
);
const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    if (code) process.exitCode = code;
  });
