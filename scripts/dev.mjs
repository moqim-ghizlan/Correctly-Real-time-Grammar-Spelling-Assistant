import { spawn } from 'node:child_process';
import process from 'node:process';
const children = [
  'frontend/vite.config.ts',
  'frontend/vite.content.config.ts',
].map((config) =>
  spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--watch',
      '--emptyOutDir',
      'false',
      '--config',
      config,
    ],
    { stdio: 'inherit' },
  ),
);
const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    if (code) {
      stop();
      process.exitCode = code;
    }
  });
