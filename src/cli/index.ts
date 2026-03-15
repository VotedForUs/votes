#!/usr/bin/env node

/**
 * Main CLI entry point using Commander.js
 * Provides commands for generating legislators and bills data
 */

import { config } from 'dotenv';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getLegislators, buildLegislatorsFromCache } from './legislators.js';
import { getBills, writeVotedBills, buildFromCache, fetchOneBill } from './bills.js';
import { processTypes } from './types.js';
import { generateChangeSummary } from './changelog.js';
import { BILL_TYPES } from '../api-congress-gov/abstract-api.types.js';

// Load environment variables from .env file
// Searches current directory and parent directories up to 3 levels
function loadEnvFile(): void {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env'),
    path.join(process.cwd(), '..', '..', '..', '.env'),
  ];
  
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      config({ path: envPath });
      return;
    }
  }
  
  // Try default (current directory)
  config();
}

loadEnvFile();

const program = new Command();

program
  .name('vfu')
  .description('CLI tool for generating congressional data from the Congress.gov API')
  .version('1.0.0');

// Legislators command
program
  .command('legislators')
  .description('Generate legislators data (one [bioguideid].json per legislator in output directory)')
  .option('-o, --output <path>', 'Output directory for legislator JSON files (default: .cache/legislators)')
  .option('-t, --congress <number>', 'Congressional term to fetch (default: 119)', (v) => parseInt(v, 10))
  .option('-s, --small', 'Output reduced legislator data', false)
  .option('-i, --images <dir>', 'Download legislator images to this directory and update imageUrl to local path')
  .action(async (options) => {
    try {
      await getLegislators(
        options.output,
        options.small,
        {
          congress: options.congress ?? undefined,
          imagesDir: options.images ?? undefined,
        }
      );
      process.exit(0);
    } catch (error) {
      console.error('Error generating legislators data:', error);
      process.exit(1);
    }
  });

program
  .command('legislators-build-from-cache')
  .description('Write per-legislator JSON files from cached all-legislators.json (no API calls)')
  .option('-c, --cache <path>', 'Path to cached all-legislators.json', path.join(process.cwd(), '.cache', 'all-legislators.json'))
  .option('-o, --output <path>', 'Output directory for legislator JSON files')
  .option('-s, --small', 'Output reduced legislator data', false)
  .action((options) => {
    try {
      const outputDir = options.output || path.join(process.cwd(), 'src', 'data', 'legislators');
      const count = buildLegislatorsFromCache({
        cachePath: options.cache,
        outputDir,
        small: options.small,
      });
      console.log(`Wrote ${count} legislators to ${outputDir}`);
      process.exit(0);
    } catch (error) {
      console.error('Error building legislators from cache:', error);
      process.exit(1);
    }
  });

// Bills command
program
  .command('bills')
  .description('Generate bills data file')
  .option('-o, --output <path>', 'Output file path (default: .cache/bills-{term}.json)')
  .option('-t, --term <number>', 'Congressional term', '119')
  .option('-b, --bill-type <type>', 'Bill type filter (e.g., HR, S)')
  .option('--skip-cache', 'Skip cache and fetch fresh data from API', false)
  .option('-s, --small', 'Output reduced bill data', false)
  .option('-a, --actions <type>', 'Include actions: "all" (all actions), "votes" (only actions with recorded votes), or "none" (no actions)', 'votes')
  .option('-v, --include-votes <type>', 'Include votes: "all" (include votes), "only" (only bills with recorded votes), or "none" (no votes)', 'only')
  .option('-l, --limit <number>', 'Limit number of bills to fetch')
  .action(async (options) => {
    try {
      const term = parseInt(options.term, 10);
      if (isNaN(term)) {
        console.error('Error: Term must be a valid number');
        process.exit(1);
      }
      
      // Validate actions option
      const validActions = ['all', 'votes', 'none'];
      if (!validActions.includes(options.actions)) {
        console.error(`Error: --actions must be one of: ${validActions.join(', ')}`);
        process.exit(1);
      }
      
      // Validate includeVotes option
      const validVotes = ['all', 'only', 'none'];
      if (!validVotes.includes(options.includeVotes)) {
        console.error(`Error: --include-votes must be one of: ${validVotes.join(', ')}`);
        process.exit(1);
      }
      
      const limit = options.limit ? parseInt(options.limit, 10) : undefined;
      if (options.limit && isNaN(limit!)) {
        console.error('Error: Limit must be a valid number');
        process.exit(1);
      }
      
      const bills = await getBills(
        term,
        options.billType,
        options.skipCache,
        options.small,
        options.actions as 'all' | 'votes' | 'none',
        options.includeVotes as 'all' | 'only' | 'none',
        limit
      );
      
      // Write to file
      const fileName = `bills-${term}${options.billType ? `-${options.billType}` : ''}.json`;
      const finalOutputPath = options.output || path.join(process.cwd(), '.cache', fileName);
      const outputDir = path.dirname(finalOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`Created output directory: ${outputDir}`);
      }
      fs.writeFileSync(finalOutputPath, JSON.stringify(bills, null, 2), 'utf8');
      console.log(`Successfully wrote ${bills.length} bills to ${finalOutputPath}`);
      
      process.exit(0);
    } catch (error) {
      console.error('Error generating bills data:', error);
      process.exit(1);
    }
  });

// Voted-bills command - optimized fetching of bills with recorded votes
program
  .command('voted-bills')
  .description('Get bills with recorded votes for a bill type (optimized)')
  .requiredOption('-b, --bill-type <type>', 'Bill type (e.g., HR, S, HJRES)')
  .option('-o, --output <path>', 'Output directory path')
  .option('-t, --term <number>', 'Congressional term', '119')
  .option('-s, --small', 'Output reduced bill data', true)
  .option('--no-small', 'Output full bill data')
  .option('-l, --limit <number>', 'Limit number of bills to fetch')
  .action(async (options) => {
    try {
      const term = parseInt(options.term, 10);
      if (isNaN(term)) {
        console.error('Error: Term must be a valid number');
        process.exit(1);
      }
      
      const limit = options.limit ? parseInt(options.limit, 10) : undefined;
      if (options.limit && isNaN(limit!)) {
        console.error('Error: Limit must be a valid number');
        process.exit(1);
      }
      
      const outputDir = options.output || path.join(process.cwd(), '.cache');
      
      const result = await writeVotedBills({
        term,
        billType: options.billType,
        outputDir,
        small: options.small,
        limit,
      });
      
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('Error getting voted bills:', error);
      process.exit(1);
    }
  });

// Voted-bills-sync command - runs voted-bills for all bill types synchronously
program
  .command('voted-bills-sync')
  .description('Get bills with recorded votes for all bill types (runs synchronously)')
  .option('-o, --output <path>', 'Output directory path (default: .cache/)')
  .option('-t, --term <number>', 'Congressional term', '119')
  .option('-s, --small', 'Output reduced bill data', true)
  .option('--no-small', 'Output full bill data')
  .option('-l, --limit <number>', 'Limit number of bills to fetch per type')
  .action(async (options) => {
    try {
      const term = parseInt(options.term, 10);
      if (isNaN(term)) {
        console.error('Error: Term must be a valid number');
        process.exit(1);
      }
      
      const limit = options.limit ? parseInt(options.limit, 10) : undefined;
      if (options.limit && isNaN(limit!)) {
        console.error('Error: Limit must be a valid number');
        process.exit(1);
      }
      
      const outputDir = options.output || path.join(process.cwd(), '.cache');
      
      console.log(`\n=== Voted Bills Sync ===`);
      console.log(`Congressional term: ${term}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(`Small: ${options.small}`);
      if (limit) {
        console.log(`Limit per type: ${limit}`);
      }
      console.log(`Bill types: ${BILL_TYPES.join(', ')}\n`);
      
      const results: { type: string; success: boolean; count?: number; error?: string }[] = [];
      
      for (const billType of BILL_TYPES) {
        console.log(`\n--- Processing ${billType.toUpperCase()} bills ---`);
        
        const result = await writeVotedBills({
          term,
          billType,
          outputDir,
          small: options.small,
          limit,
        });
        
        results.push({ type: billType, ...result });
      }
      
      // Summary
      console.log(`\n=== Summary ===`);
      for (const result of results) {
        if (result.success) {
          console.log(`✓ ${result.type.toUpperCase()}: ${result.count} bills`);
        } else {
          console.log(`✗ ${result.type.toUpperCase()}: Failed - ${result.error}`);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const totalBills = results.filter(r => r.success).reduce((sum, r) => sum + (r.count || 0), 0);
      console.log(`\nCompleted: ${successCount}/${BILL_TYPES.length} bill types, ${totalBills} total bills`);
      
      process.exit(successCount === BILL_TYPES.length ? 0 : 1);
    } catch (error) {
      console.error('Error in voted-bills-sync:', error);
      process.exit(1);
    }
  });

// Single-bill command - fetch one bill from API (refreshes cache), optionally write to output
program
  .command('bill')
  .description('Fetch one bill from the API (uses/refreshes cache). Optionally write to --output.')
  .requiredOption('-b, --bill-type <type>', 'Bill type (e.g., hr, s, hjres)')
  .requiredOption('-n, --number <number>', 'Bill number')
  .option('-t, --term <number>', 'Congressional term', '119')
  .option('-o, --output <path>', 'Write bill JSON to this directory (e.g. packages/site/src/data)')
  .option('-c, --cache <path>', 'Cache directory', path.join(process.cwd(), '.cache', 'congress'))
  .option('-s, --small', 'Output reduced bill data', true)
  .option('--no-small', 'Output full bill data')
  .action(async (options) => {
    try {
      const term = parseInt(options.term, 10);
      if (isNaN(term)) {
        console.error('Error: Term must be a valid number');
        process.exit(1);
      }
      const result = await fetchOneBill({
        term,
        billType: options.billType,
        billNumber: options.number,
        small: options.small,
        outputDir: options.output,
        cacheDir: options.cache,
      });
      if (!result.success) {
        console.error(result.error ?? 'Failed to fetch bill');
        process.exit(1);
      }
      console.log(`Fetched ${options.billType.toUpperCase()} ${options.number}`);
    } catch (error) {
      console.error('Error fetching bill:', error);
      process.exit(1);
    }
  });

// Build-from-cache command - builds output files from cached API data without making API calls
program
  .command('build-from-cache')
  .description('Build bill JSON files from cached API data (no API calls)')
  .option('-b, --bill-type <type>', 'Bill type filter (e.g., HR, S) - if omitted, builds all types')
  .option('-o, --output <path>', 'Output directory path (required)')
  .option('-c, --cache <path>', 'Cache directory path (default: .cache/congress)')
  .option('-t, --term <number>', 'Congressional term', '119')
  .option('-s, --small', 'Output reduced bill data', true)
  .option('--no-small', 'Output full bill data')
  .action(async (options) => {
    try {
      const term = parseInt(options.term, 10);
      if (isNaN(term)) {
        console.error('Error: Term must be a valid number');
        process.exit(1);
      }
      
      if (!options.output) {
        console.error('Error: --output <path> is required');
        process.exit(1);
      }
      
      const result = await buildFromCache({
        term,
        billType: options.billType,
        outputDir: options.output,
        cacheDir: options.cache,
        small: options.small,
      });
      
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('Error building from cache:', error);
      process.exit(1);
    }
  });

// Generate change summary command
program
  .command('generate-change-summary')
  .description('Generate a structured changelog entry and PR body markdown from data/ git changes')
  .option('--data-dir <path>', 'Path to the data/ directory (default: {cwd}/data)')
  .option('--changelog-dir <path>', 'Path to the changelog directory (default: {dataDir}/changelog)')
  .option('--accumulated-path <path>', 'Path to the accumulated changelog.json (default: {dataDir}/changelog.json)')
  .option('--pr-body <path>', 'Path to write the PR body markdown (default: {cwd}/.github/pr-body.md)')
  .option('--run-id <string>', 'Run ID string (default: GITHUB_RUN_ID env var or timestamp)')
  .option('--site-base-url <url>', 'Base URL for building links (default: https://votedfor.us)')
  .action((options) => {
    try {
      generateChangeSummary({
        dataDir: options.dataDir,
        changelogDir: options.changelogDir,
        accumulatedPath: options.accumulatedPath,
        prBodyPath: options.prBody,
        runId: options.runId,
        siteBaseUrl: options.siteBaseUrl,
      });
      process.exit(0);
    } catch (error) {
      console.error('Error generating change summary:', error);
      process.exit(1);
    }
  });

// Types command
program
  .command('types')
  .description('Process TypeScript declaration files to remove module wrappers')
  .option('-i, --input <path>', 'Input .d.ts file path', './dist/index.d.ts')
  .option('-o, --output <path>', 'Output .d.ts file path', './dist/index.d.ts')
  .action(async (options) => {
    try {
      await processTypes(options);
      process.exit(0);
    } catch (error) {
      console.error('Error processing types file:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

