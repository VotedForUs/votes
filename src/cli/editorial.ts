/**
 * CLI utility for generating editorial content files from source bill data
 * 
 * Editorial files contain:
 * - title?: user-defined custom title (never overwritten)
 * - defaultTitle: best title from source (always updated)
 * - billTitles: all titles from source (always updated)
 * - questions?: user-defined question overrides (never overwritten)
 * - defaultQuestions: questions from recorded votes (always updated)
 */

import * as fs from "fs";
import * as path from "path";
import type { BillWithActions, BillActionWithVotes, RecordedVoteWithVotes } from "../congress/congress-api.types.js";
import type { BillTitle } from "../api-congress-gov/abstract-api.types.js";
import type { 
  EditorialBill, 
  GenerateEditorialOptions, 
  GenerateEditorialResult 
} from "./editorial.types.js";
import { BILL_TYPES } from "../api-congress-gov/abstract-api.types.js";

// Re-export types
export type { EditorialBill, GenerateEditorialOptions, GenerateEditorialResult } from "./editorial.types.js";

/**
 * Priority order for selecting the best bill title
 * Lower index = higher priority
 */
const TITLE_TYPE_PRIORITY = [
  "Popular Titles",
  "Short Title(s) as Passed House",
  "Short Title(s) as Passed Senate",
  "Short Titles as Enacted",
  "Short Titles as Enacted for portions of this bill",
  "Short Title(s) as Reported to House",
  "Short Title(s) as Reported to Senate",
  "Display Title",
  "Official Title as Enacted",
  "Official Title as Introduced",
];

/**
 * Get the best title from a bill's titles array
 * Prioritizes popular/short titles over official titles
 */
export function getBestBillTitle(bill: BillWithActions): string {
  const titles = bill.titles?.titles;
  
  if (!titles || titles.length === 0) {
    return bill.title || "";
  }
  
  // Try to find title by priority order
  for (const priorityType of TITLE_TYPE_PRIORITY) {
    const match = titles.find(t => t.titleType === priorityType);
    if (match?.title) {
      return match.title;
    }
  }
  
  // Fallback to first title or bill.title
  return titles[0]?.title || bill.title || "";
}

/**
 * Extract unique titles from bill.titles.titles
 */
export function extractBillTitles(bill: BillWithActions): string[] {
  const titles = bill.titles?.titles;
  
  if (!titles || titles.length === 0) {
    return bill.title ? [bill.title] : [];
  }
  
  const uniqueTitles = new Set<string>();
  for (const t of titles) {
    if (t.title) {
      uniqueTitles.add(t.title);
    }
  }
  
  // Add main title if not already included
  if (bill.title && !uniqueTitles.has(bill.title)) {
    uniqueTitles.add(bill.title);
  }
  
  return Array.from(uniqueTitles);
}

/**
 * Extract default questions from recorded votes
 * Returns a map of recorded-vote-id -> question text
 */
export function extractDefaultQuestions(bill: BillWithActions): Record<string, string> {
  const questions: Record<string, string> = {};
  const actions = bill.actions?.actions;
  
  if (!actions) {
    return questions;
  }
  
  for (const action of actions) {
    const recordedVotes = (action as BillActionWithVotes).recordedVotes;
    if (!recordedVotes) continue;
    
    for (const vote of recordedVotes) {
      if (vote.id && vote.question) {
        questions[vote.id] = vote.question;
      }
    }
  }
  
  return questions;
}

/**
 * Read an existing editorial file if it exists
 */
function readExistingEditorial(filePath: string): Partial<EditorialBill> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.warn(`  Warning: Could not parse existing editorial file: ${filePath}`);
    return null;
  }
}

/**
 * Generate or update an editorial file for a bill
 * Preserves user-defined title and questions, updates defaults from source
 */
export function generateEditorialFile(
  bill: BillWithActions,
  outputPath: string
): { created: boolean; updated: boolean } {
  const existing = readExistingEditorial(outputPath);
  const billId = `${bill.congress}-${bill.type}-${bill.number}`;
  // Build new editorial content
  const editorial: EditorialBill = {
    // Preserve user-defined title if exists
    ...(existing?.title ? { title: existing.title } : {}),
    // Always update defaults from source
    defaultTitle: getBestBillTitle(bill),
    billTitles: extractBillTitles(bill),
    // Preserve user-defined questions if exist
    ...(existing?.questions && Object.keys(existing.questions).length > 0 
      ? { questions: existing.questions } 
      : {}),
    // Always update default questions from source
    defaultQuestions: extractDefaultQuestions(bill),
    id: billId,
    bill: billId,
  };
  
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const newContent = JSON.stringify(editorial, null, 2) + "\n";
  const contentChanged =
    existing === null
      ? true
      : newContent !== fs.readFileSync(outputPath, "utf8");

  if (contentChanged) {
    fs.writeFileSync(outputPath, newContent, "utf8");
  }

  return {
    created: existing === null && contentChanged,
    updated: existing !== null && contentChanged,
  };
}

/**
 * Process a single bill type directory
 * Output structure: outputDir/{congress}/{billType}/{number}.json (matches src/data/bills/)
 */
function processBillType(
  billType: string,
  sourceDir: string,
  outputDir: string,
  term: number
): { created: number; updated: number } {
  // Bills are at sourceDir/bills/{congress}/{billType}/
  const sourceBillDir = path.join(sourceDir, "bills", String(term), billType.toLowerCase());
  const outputBillDir = path.join(outputDir, String(term), billType.toLowerCase());

  if (!fs.existsSync(sourceBillDir)) {
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;
  const processedFiles = new Set<string>();

  const files = fs.readdirSync(sourceBillDir);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const sourcePath = path.join(sourceBillDir, file);
    const outputPath = path.join(outputBillDir, file);

    try {
      const content = fs.readFileSync(sourcePath, "utf8");
      const bill: BillWithActions = JSON.parse(content);

      const result = generateEditorialFile(bill, outputPath);
      processedFiles.add(file);

      if (result.created) {
        created++;
      } else if (result.updated) {
        updated++;
      }
    } catch (error) {
      console.warn(`  Warning: Error processing ${sourcePath}: ${error}`);
    }
  }

  // Remove stale editorial files that no longer have a bill in source
  if (fs.existsSync(outputBillDir)) {
    for (const file of fs.readdirSync(outputBillDir)) {
      if (file.endsWith(".json") && !processedFiles.has(file)) {
        fs.unlinkSync(path.join(outputBillDir, file));
      }
    }
  }

  return { created, updated };
}

/**
 * Generate editorial files from source bill data
 * 
 * @param options - Configuration options
 * @returns Result with counts of created/updated files
 */
export async function generateEditorial(
  options: GenerateEditorialOptions
): Promise<GenerateEditorialResult> {
  const { term = 119, billType, sourceDir, outputDir } = options;
  
  console.log(`\nGenerating editorial files...`);
  console.log(`Source directory: ${sourceDir}`);
  console.log(`Output directory: ${outputDir}`);
  
  try {
    const billTypesToProcess = billType 
      ? [billType.toLowerCase()] 
      : BILL_TYPES;
    
    if (billType) {
      console.log(`Bill type: ${billType}`);
    } else {
      console.log(`Bill types: ${billTypesToProcess.join(", ")}`);
    }
    
    let totalCreated = 0;
    let totalUpdated = 0;
    
    for (const type of billTypesToProcess) {
      const { created, updated } = processBillType(type, sourceDir, outputDir, term);

      if (created > 0 || updated > 0) {
        console.log(`  ${type.toUpperCase()}: ${created} created, ${updated} updated`);
      }

      totalCreated += created;
      totalUpdated += updated;
    }

    console.log(`\n=== Editorial Summary ===`);
    console.log(`(created = new editorial file; updated = existing file refreshed from bill data)`);
    console.log(`Created: ${totalCreated}`);
    console.log(`Updated: ${totalUpdated}`);
    console.log(`Total: ${totalCreated + totalUpdated}`);
    
    return { success: true, created: totalCreated, updated: totalUpdated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error generating editorial files: ${errorMessage}`);
    return { success: false, created: 0, updated: 0, error: errorMessage };
  }
}
