import console from 'node:console';
import process from 'node:process';
import { auditDist } from './audit-dist.mjs';

const { errors, files } = auditDist('dist');
if (errors.length) {
  console.error('dist/ audit FAILED:');
  for (const error of errors) console.error('  - ' + error);
  process.exit(1);
}
console.info(`dist/ audit passed (${files.length} files):`);
for (const file of files) console.info('  ' + file);
