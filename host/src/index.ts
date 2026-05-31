import { parseArgs } from 'node:util';
import { basename } from 'node:path';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    origin: { type: 'string', multiple: true },
    name: { type: 'string' },
    'notes-dir': { type: 'string' },
    port: { type: 'string' },
    token: { type: 'string' },
  },
  strict: false,
});

if (!values.root) {
  console.error('stickyfix-host: --root is required');
  process.exit(1);
}

// Phase 1 stub — Phase 2 replaces this with the real HTTP server
const root = values.root as string;
const projectName = (values.name as string | undefined) ?? basename(root);
console.log(JSON.stringify({
  app: 'stickyfix',
  name: projectName,
  root,
  port: null,       // Phase 2: real port after server binds
  token: null,      // Phase 2: real token
  notesDir: null,   // Phase 2: resolved notes dir
}));
