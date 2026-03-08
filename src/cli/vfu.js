#!/usr/bin/env node

/**
 * Wrapper script to execute the TypeScript CLI using tsx
 * This allows the bin to execute TypeScript directly without pre-compilation
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the TypeScript CLI entry point
const cliPath = join(__dirname, 'index.ts');

// Spawn tsx to execute the TypeScript file
const args = process.argv.slice(2);
const child = spawn('npx', ['tsx', cliPath, ...args], {
  stdio: 'inherit',
  shell: true,
});

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});

