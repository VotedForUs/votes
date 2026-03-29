/**
 * CLI utility functions for generating bills data files
 */

import * as fs from "fs";
import * as path from "path";
import { CongressApi, computeBillDateFields, shouldKeepAction } from "../congress/congress-api.js";
import type { BillWithActions, BillActionWithVotes } from "../congress/congress-api.types.js";
import type { BillSmall, WriteVotedBillsResult, WriteVotedBillsOptions, BuildFromCacheOptions, BuildFromCacheResult, FetchOneBillOptions, FetchOneBillResult } from "./bills.types.js";
import { BILL_TYPES, type BillType } from "../api-congress-gov/abstract-api.types.js";

/**
 * Reduce a bill to a smaller subset of properties
 * @param bill - Full bill with actions
 * @returns Reduced bill data
 */
export function reduceBill(bill: BillWithActions): BillSmall {
  delete bill.amendments;
  delete bill.constitutionalAuthorityStatementText;
  delete bill.policyArea;
  delete bill.cosponsors;
  delete bill.sponsors;
  delete bill.relatedBills;
  delete bill.textVersions;
  delete bill.cboCostEstimates;
  delete bill.committees;
  delete bill.committeeReports;
  delete bill.subjects;
  return bill;
}

/**
 * Fetches bills data and returns as an array
 * @param term - Congressional term (defaults to 119)
 * @param billType - Optional bill type filter (e.g., "HR", "S")
 * @param skipCache - Whether to skip cache for API calls (defaults to true for CLI, saves time)
 * @param small - Whether to reduce bill data to small format
 * @param includeActions - 'all' to include all actions, 'votes' to include only actions with recorded votes, 'none' to exclude actions (defaults to 'votes')
 * @param includeVotes - 'all' to include votes, 'only' to only return bills with recorded votes, 'none' to exclude votes (defaults to 'only')
 * @param limit - Optional limit on number of bills to fetch (ignored when includeVotes='only')
 * @param CongressApiClass - Optional CongressApi class (for testing)
 * @returns Array of bills data
 */
export async function getBills(
  term: number = 119,
  billType?: string,
  skipCache: boolean = false,
  small: boolean = false,
  includeActions: 'all' | 'votes' | 'none' = 'votes',
  includeVotes: 'all' | 'only' | 'none' = 'only',
  limit?: number,
  CongressApiClass: typeof CongressApi = CongressApi,
): Promise<BillWithActions[] | BillSmall[]> {
  
  console.log(`Generating bills data...`);
  console.log(`Congressional term: ${term}`);
  if (billType) {
    console.log(`Bill type filter: ${billType}`);
  }
  console.log(`Small: ${small}`);
  console.log(`Skip cache: ${skipCache}`);
  console.log(`Include actions: ${includeActions}`);
  console.log(`Include votes: ${includeVotes}`);
  
  // When includeVotes='only', we need all data to filter, so ignore limit
  const effectiveLimit = includeVotes === 'only' ? undefined : limit;
  if (effectiveLimit) {
    console.log(`Limit: ${effectiveLimit}`);
  }
  
  // Instantiate CongressApi class
  const congressApi = new CongressApiClass(term);
  
  // Map includeVotes to boolean for congress-api
  const includeVotesBoolean = includeVotes === 'all' || includeVotes === 'only';
  
  // Fetch bills with optional actions and votes
  console.log(`Fetching bills${includeActions !== 'none' ? ' with actions' : ''}${includeVotesBoolean ? ' and votes' : ''}...`);
  let billsData = await congressApi.getBills(
    billType,
    includeActions,
    includeVotesBoolean,
    effectiveLimit ? { limit: effectiveLimit } : undefined
  ) as BillWithActions[];
  
  // Filter to only bills with recorded votes if includeVotes='only'
  if (includeVotes === 'only') {
    billsData = billsData.filter(bill => {
      if (!bill.actions?.actions) return false;
      return bill.actions.actions.some(action => 
        Array.isArray(action.recordedVotes) && action.recordedVotes.length > 0
      );
    });
    
    // Apply limit after filtering if specified
    if (limit && billsData.length > limit) {
      billsData = billsData.slice(0, limit);
    }
  }
  
  console.log(`Found ${billsData.length} bills`);
  console.log(`API calls made: ${congressApi.getApiCallCount()}`);
  
  // Reduce bills if requested
  let outputData: BillWithActions[] | BillSmall[] = billsData;
  if (small) {
    outputData = billsData.map(reduceBill);
  }
  
  return outputData;
}

/**
 * Gets bills with recorded votes for a specific bill type using optimized fetching
 * @param term - Congressional term (defaults to 119)
 * @param billType - Bill type filter (e.g., "HR", "S")
 * @param small - Whether to reduce bill data to small format (defaults to true)
 * @param limit - Optional limit on number of bills to return
 * @param CongressApiClass - Optional CongressApi class (for testing)
 * @param ensureOutputCoverage - When set, bills on the API list with no JSON under `{outputDir}/bills/{term}/{type}/` are fetched too (backfill after skipped merges)
 * @returns Array of bills with recorded votes
 */
export async function getVotedBills(
  term: number = 119,
  billType: string,
  small: boolean = true,
  limit?: number,
  CongressApiClass: typeof CongressApi = CongressApi,
  ensureOutputCoverage?: { outputDir: string; term: number },
): Promise<BillWithActions[] | BillSmall[]> {
  
  console.log(`Getting bills with recorded votes...`);
  console.log(`Congressional term: ${term}`);
  console.log(`Bill type: ${billType}`);
  console.log(`Small: ${small}`);
  if (limit) {
    console.log(`Limit: ${limit}`);
  }
  
  // Instantiate CongressApi class
  const congressApi = new CongressApiClass(term);

  const voteOpts = ensureOutputCoverage ? { ensureOutputCoverage } : undefined;

  // Fetch bills with votes using optimized method
  let billsData = await congressApi.getBillsWithVotes(
    billType,
    limit ? { limit } : undefined,
    voteOpts,
  );
  
  // Apply limit if specified (getBillsWithVotes may return more due to pagination)
  if (limit && billsData.length > limit) {
    billsData = billsData.slice(0, limit);
  }
  
  console.log(`Found ${billsData.length} bills with recorded votes`);
  console.log(`API calls made: ${congressApi.getApiCallCount()}`);
  
  // Reduce bills if requested
  let outputData: BillWithActions[] | BillSmall[] = billsData;
  if (small) {
    outputData = billsData.map(reduceBill);
  }
  
  return outputData;
}

// Re-export types for convenience
export type { WriteVotedBillsResult, WriteVotedBillsOptions, BuildFromCacheOptions, BuildFromCacheResult } from "./bills.types.js";

/**
 * Fetches bills with recorded votes and writes each to an individual file
 * Output structure: {outputDir}/bills/{congress}/{billType}/{number}.json
 * 
 * @param options - Configuration options
 * @returns Result object with success status, count of bills written, and any error
 */
export async function writeVotedBills(
  options: WriteVotedBillsOptions
): Promise<WriteVotedBillsResult> {
  const {
    term,
    billType,
    outputDir,
    small,
    limit,
    CongressApiClass = CongressApi,
  } = options;

  try {
    const bills = await getVotedBills(
      term,
      billType,
      small,
      limit,
      CongressApiClass,
      { outputDir, term },
    );
    
    // Create output directory for this bill type: {outputDir}/bills/{congress}/{billType}/
    const billsCongressDir = path.join(outputDir, 'bills', String(term), billType.toLowerCase());
    if (!fs.existsSync(billsCongressDir)) {
      fs.mkdirSync(billsCongressDir, { recursive: true });
      console.log(`Created output directory: ${billsCongressDir}`);
    }
    
    // Write each bill to an individual file
    console.log(`Writing ${bills.length} bills to ${billsCongressDir}/`);
    for (const bill of bills) {
      const billNumber = (bill as BillWithActions).number || (bill as BillSmall).number;
      const filePath = path.join(billsCongressDir, `${billNumber}.json`);
      fs.writeFileSync(filePath, JSON.stringify(bill, null, 2), 'utf8');
      console.log(`  Wrote bills/${term}/${billType.toLowerCase()}/${billNumber}.json`);
    }
    
    console.log(`Successfully wrote ${bills.length} bills`);
    return { success: true, count: bills.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error writing voted bills for ${billType}: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if an action has recorded votes (including Senate UC) — same logic as CongressApi.hasRecordedVotes
 */
function actionHasRecordedVote(action: {
  sourceSystem?: { name?: string };
  type?: string;
  text?: string;
  recordedVotes?: unknown[];
}): boolean {
  if (!shouldKeepAction(action)) return false;
  if (Array.isArray(action.recordedVotes) && action.recordedVotes.length > 0) return true;
  if (!action.text) return false;
  const t = action.text.toLowerCase();
  const hasUC = t.includes("without amendment by unanimous consent");
  const hasSenatePass =
    t.includes("passed senate") || (t.includes("passed") && action.sourceSystem?.name === "Senate");
  return !!hasUC && !!hasSenatePass;
}

/**
 * Return all actions cache paths for a bill dir: actions.json (if present) then actions_*.json sorted.
 * Caller should use the first file whose actions (after shouldKeepAction) include a recorded vote.
 */
function getActionsCachePaths(billDirPath: string): string[] {
  const paths: string[] = [];
  const exact = path.join(billDirPath, "actions.json");
  if (fs.existsSync(exact)) paths.push(exact);
  const names = fs
    .readdirSync(billDirPath)
    .filter((n) => n.startsWith("actions_") && n.endsWith(".json"))
    .sort();
  for (const n of names) {
    paths.push(path.join(billDirPath, n));
  }
  return paths;
}

/**
 * Build a single bill type from cached data
 * Reads cached bill info, actions, and titles to construct BillWithActions
 * Populates vote details from cached XML data
 * @returns Array of bills with recorded votes
 */
async function buildBillTypeFromCache(
  term: number,
  billType: string,
  cacheDir: string,
  small: boolean,
  congressApi: CongressApi,
): Promise<(BillWithActions | BillSmall)[]> {
  const billTypeCacheDir = path.join(cacheDir, 'bill', String(term), billType.toLowerCase());
  
  if (!fs.existsSync(billTypeCacheDir)) {
    console.log(`  No cache directory found for ${billType}: ${billTypeCacheDir}`);
    return [];
  }
  
  const bills: (BillWithActions | BillSmall)[] = [];
  
  // Get all entries in the bill type cache directory
  const entries = fs.readdirSync(billTypeCacheDir, { withFileTypes: true });
  
  // Find bill directories (numeric names like "1", "2", "80", etc.)
  const billDirs = entries.filter(entry => 
    entry.isDirectory() && /^\d+$/.test(entry.name)
  );
  
  for (const billDir of billDirs) {
    const billNumber = billDir.name;
    const billDirPath = path.join(billTypeCacheDir, billNumber);

    const actionPaths = getActionsCachePaths(billDirPath);
    if (actionPaths.length === 0) {
      continue;
    }

    // Use the first actions file that contains at least one recorded vote (or Senate UC)
    let actionsPath: string | null = null;
    let actions: BillActionWithVotes[] = [];
    for (const p of actionPaths) {
      try {
        const actionsData = JSON.parse(fs.readFileSync(p, "utf8"));
        const filtered = (actionsData.actions || []).filter(
          (a: { sourceSystem?: { name?: string }; type?: string }) => shouldKeepAction(a)
        ) as BillActionWithVotes[];
        if (filtered.some((a) => actionHasRecordedVote(a))) {
          actionsPath = p;
          actions = filtered;
          break;
        }
      } catch {
        // Skip this path (e.g. invalid JSON) and try next
      }
    }
    if (!actionsPath || actions.length === 0) {
      continue;
    }

    try {
      
      // Read bill info
      const billInfoPath = path.join(billTypeCacheDir, `${billNumber}.json`);
      if (!fs.existsSync(billInfoPath)) {
        console.log(`  Warning: No bill info cache for ${billType} ${billNumber}`);
        continue;
      }
      const billInfoData = JSON.parse(fs.readFileSync(billInfoPath, 'utf8'));
      const billInfo = billInfoData.bill;
      
      if (!billInfo) {
        console.log(`  Warning: Invalid bill info cache for ${billType} ${billNumber}`);
        continue;
      }
      
      // Populate vote details from cached XML data
      actions = await congressApi.populateRecordedVotes(actions, {
        congress: term,
        billType: billType.toUpperCase(),
        billNumber,
      });
      
      // Read titles if available
      const titlesPath = path.join(billDirPath, 'titles.json');
      let titles = undefined;
      if (fs.existsSync(titlesPath)) {
        const titlesData = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
        titles = titlesData.titles ? { titles: titlesData.titles } : undefined;
      }
      
      const billId = `${term}-${billType.toUpperCase()}-${billNumber}`;
      const { lastActionDate, lastRecordedVoteDate } = computeBillDateFields(actions);
      const fallbackLastActionDate = billInfo.latestAction?.actionDate;
      const first = actions[0];
      const apiLatest = billInfo.latestAction;
      const latestAction =
        first != null && apiLatest?.actionDate != null && apiLatest.actionDate >= first.actionDate
          ? apiLatest
          : first != null
            ? { actionDate: first.actionDate, actionTime: first.actionTime, text: first.text, actionCode: first.actionCode }
            : apiLatest;
      const billWithActions: BillWithActions = {
        ...billInfo,
        id: billId,
        actions: {
          ...billInfo.actions,
          actions,
        },
        titles,
        lastActionDate: lastActionDate ?? fallbackLastActionDate,
        lastRecordedVoteDate,
        ...(latestAction != null && { latestAction }),
      };
      
      // Reduce if requested; ensure id is always set (reduceBill preserves it, but explicit for JSON output)
      const billToWrite = small ? reduceBill(billWithActions) : billWithActions;
      billToWrite.id = billId;
      bills.push(billToWrite);
    } catch (error) {
      console.log(`  Warning: Error reading cache for ${billType} ${billNumber}: ${error}`);
      continue;
    }
  }
  
  return bills;
}

/**
 * Build bill data from cached API responses without making new API calls
 * Writes each bill to an individual file in the output directory
 * Populates vote details from cached XML data
 * 
 * @param options - Configuration options
 * @returns Result object with success status, count of bills written, and any error
 */
export async function buildFromCache(
  options: BuildFromCacheOptions
): Promise<BuildFromCacheResult> {
  const {
    term,
    billType,
    outputDir,
    cacheDir = path.join(process.cwd(), '.cache', 'congress'),
    small,
    CongressApiClass = CongressApi,
  } = options;

  console.log(`Building bills from cache...`);
  console.log(`Congressional term: ${term}`);
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Small: ${small}`);

  try {
    // Initialize CongressApi to populate vote details from cached XML
    const congressApi = new CongressApiClass(term);
    
    const billTypesToProcess = billType 
      ? [billType.toLowerCase()] 
      : BILL_TYPES;
    
    if (billType) {
      console.log(`Bill type: ${billType}`);
    } else {
      console.log(`Bill types: ${billTypesToProcess.join(', ')}`);
    }
    
    const results: { type: string; count: number }[] = [];
    let totalCount = 0;
    
    for (const type of billTypesToProcess) {
      console.log(`\nProcessing ${type.toUpperCase()}...`);
      
      const bills = await buildBillTypeFromCache(term, type, cacheDir, small, congressApi);
      
      if (bills.length === 0) {
        console.log(`  No bills with votes found in cache for ${type}`);
        results.push({ type, count: 0 });
        continue;
      }
      
      // Create output directory: {outputDir}/bills/{congress}/{billType}/
      const billsCongressDir = path.join(outputDir, 'bills', String(term), type.toLowerCase());
      if (!fs.existsSync(billsCongressDir)) {
        fs.mkdirSync(billsCongressDir, { recursive: true });
      }

      const billNumbersThisRun = new Set(
        bills.map((b) => String((b as BillWithActions).number ?? (b as BillSmall).number))
      );
      // Remove stale bill files from previous runs so output dir matches cache
      if (fs.existsSync(billsCongressDir)) {
        for (const file of fs.readdirSync(billsCongressDir)) {
          if (file.endsWith('.json')) {
            const billNumber = file.replace(/\.json$/, '');
            if (!billNumbersThisRun.has(billNumber)) {
              fs.unlinkSync(path.join(billsCongressDir, file));
            }
          }
        }
      }

      // Write each bill to an individual file
      console.log(`  Writing ${bills.length} bills to ${billsCongressDir}/`);
      for (const bill of bills) {
        const billNumber = (bill as BillWithActions).number || (bill as BillSmall).number;
        const filePath = path.join(billsCongressDir, `${billNumber}.json`);
        fs.writeFileSync(filePath, JSON.stringify(bill, null, 2), 'utf8');
      }

      console.log(`  Successfully wrote ${bills.length} ${type} bills`);
      results.push({ type, count: bills.length });
      totalCount += bills.length;
    }

    console.log(`\n=== Summary (bills written from cache this run) ===`);
    for (const result of results) {
      console.log(`${result.type.toUpperCase()}: ${result.count} bills`);
    }
    console.log(`Total: ${totalCount} bills`);
    
    return { success: true, count: totalCount, billTypes: results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error building from cache: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Fetch a single bill from the API (uses cache; refreshes cache on fetch).
 * Optionally write to output directory in the same structure as build-from-cache.
 */
export async function fetchOneBill(options: FetchOneBillOptions): Promise<FetchOneBillResult> {
  const {
    term,
    billType,
    billNumber,
    small = true,
    outputDir,
    cacheDir = path.join(process.cwd(), ".cache", "congress"),
    CongressApiClass = CongressApi,
  } = options;

  try {
    const congressApi = new CongressApiClass(term, fetch, cacheDir);
    await congressApi.initialize();

    const bill = await congressApi.getBill(billType, billNumber, "all", true);
    if (!bill) {
      return { success: false, error: `Bill ${billType} ${billNumber} not found` };
    }

    const billToWrite = small ? reduceBill(bill) : bill;
    (billToWrite as { id?: string }).id =
      (billToWrite as BillWithActions).id ?? `${term}-${billType.toUpperCase()}-${billNumber}`;

    if (outputDir) {
      const dir = path.join(outputDir, "bills", String(term), billType.toLowerCase());
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${billNumber}.json`);
      fs.writeFileSync(filePath, JSON.stringify(billToWrite, null, 2), "utf8");
      console.log(`Wrote ${filePath}`);
    }

    return { success: true, bill: billToWrite };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
