/**
 * Entry point script for generating change summaries.
 * Delegates to the CLI module: src/cli/changelog.ts
 *
 * Usage: tsx scripts/generate-change-summary.ts
 *   or:  npm run generate-change-summary
 *   or:  vfu generate-change-summary
 */

import { generateChangeSummary } from '../src/cli/changelog.js';

generateChangeSummary();
