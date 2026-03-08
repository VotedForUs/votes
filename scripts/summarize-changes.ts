/**
 * Generates a human-readable markdown summary of content/ changes for PR bodies.
 *
 * Usage: tsx scripts/summarize-changes.ts
 *
 * Output:
 *  - .github/pr-body.md  (read by peter-evans/create-pull-request)
 *  - $GITHUB_STEP_SUMMARY (visible in GitHub Actions job summary)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const PR_BODY_PATH = path.join(process.cwd(), '.github', 'pr-body.md');

interface BillSummaryItem {
  id: string;
  title: string;
  type: string;
  number: string;
  congress: number;
}

interface LegislatorSummaryItem {
  bioguideId: string;
}

interface ChangeSummary {
  newBills: BillSummaryItem[];
  updatedBills: BillSummaryItem[];
  deletedBills: string[];
  updatedLegislators: LegislatorSummaryItem[];
  noChangeBillTypes: string[];
}

function runGit(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: process.cwd() }).trim();
  } catch {
    return '';
  }
}

/** Parse JSON safely; returns null on failure. */
function safeJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function getBillTitle(filePath: string): string {
  const data = safeJson<{ title?: string; titles?: { titles?: Array<{ title?: string; titleType?: string }> } }>(filePath);
  if (!data) return 'Unknown';
  const shortTitle = data.titles?.titles?.find(t => t.titleType?.startsWith('Short Title'))?.title;
  return shortTitle ?? data.title ?? 'Unknown';
}

function parseBillPath(relativePath: string): { congress: number; billType: string; number: string } | null {
  // content/bills/{congress}/{billType}/{number}.json
  const parts = relativePath.replace(/\\/g, '/').split('/');
  if (parts.length < 5 || parts[0] !== 'content' || parts[1] !== 'bills') return null;
  const congress = parseInt(parts[2]);
  const billType = parts[3];
  const number = path.basename(parts[4], '.json');
  if (isNaN(congress)) return null;
  return { congress, billType, number };
}

function parseLegislatorPath(relativePath: string): string | null {
  // content/legislators/{bioguideId}.json
  const parts = relativePath.replace(/\\/g, '/').split('/');
  if (parts.length < 3 || parts[0] !== 'content' || parts[1] !== 'legislators') return null;
  return path.basename(parts[2], '.json');
}

function collectChanges(): ChangeSummary {
  // Get diff between HEAD~1 and HEAD (for committed changes) or against index (for uncommitted)
  let diffOutput = runGit('git diff HEAD~1 HEAD --name-status -- content/');
  if (!diffOutput) {
    // Fallback: diff against index (first commit or no prior commit)
    diffOutput = runGit('git diff --cached --name-status -- content/');
  }
  if (!diffOutput) {
    diffOutput = runGit('git status --porcelain -- content/');
  }

  const newBills: BillSummaryItem[] = [];
  const updatedBills: BillSummaryItem[] = [];
  const deletedBills: string[] = [];
  const updatedLegislators: LegislatorSummaryItem[] = [];
  const changedBillTypes = new Set<string>();

  const lines = diffOutput.split('\n').filter(Boolean);

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const status = parts[0];
    const filePath = parts[1] ?? '';
    const normalizedPath = filePath.replace(/\\/g, '/');

    const billParsed = parseBillPath(normalizedPath);
    if (billParsed) {
      changedBillTypes.add(billParsed.billType);
      const absPath = path.join(process.cwd(), filePath);
      const title = fs.existsSync(absPath) ? getBillTitle(absPath) : 'Deleted';
      const item: BillSummaryItem = {
        id: `${billParsed.congress}-${billParsed.billType.toUpperCase()}-${billParsed.number}`,
        title,
        type: billParsed.billType.toUpperCase(),
        number: billParsed.number,
        congress: billParsed.congress,
      };

      if (status === 'A') {
        newBills.push(item);
      } else if (status === 'D') {
        deletedBills.push(item.id);
      } else {
        updatedBills.push(item);
      }
      continue;
    }

    const bioguideId = parseLegislatorPath(normalizedPath);
    if (bioguideId) {
      updatedLegislators.push({ bioguideId });
    }
  }

  const ALL_BILL_TYPES = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
  const noChangeBillTypes = ALL_BILL_TYPES.filter(t => !changedBillTypes.has(t));

  return { newBills, updatedBills, deletedBills, updatedLegislators, noChangeBillTypes };
}

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}

function buildMarkdown(summary: ChangeSummary): string {
  const lines: string[] = [`## Congressional Data Update — ${formatDate()}`, ''];

  if (summary.newBills.length > 0) {
    lines.push(`### New bills (${summary.newBills.length})`);
    for (const b of summary.newBills) {
      lines.push(`- **${b.type} ${b.number}** — ${b.title} *(${b.type.toLowerCase()})*`);
    }
    lines.push('');
  }

  if (summary.updatedBills.length > 0) {
    const DISPLAY_LIMIT = 50;
    lines.push(`### Updated bills (${summary.updatedBills.length})`);
    const displayed = summary.updatedBills.slice(0, DISPLAY_LIMIT);
    for (const b of displayed) {
      lines.push(`- **${b.type} ${b.number}** — ${b.title}`);
    }
    if (summary.updatedBills.length > DISPLAY_LIMIT) {
      lines.push(`- *(and ${summary.updatedBills.length - DISPLAY_LIMIT} more)*`);
    }
    lines.push('');
  }

  if (summary.deletedBills.length > 0) {
    lines.push(`### Deleted bills (${summary.deletedBills.length})`);
    for (const id of summary.deletedBills) {
      lines.push(`- ${id}`);
    }
    lines.push('');
  }

  if (summary.updatedLegislators.length > 0) {
    lines.push(`### Legislators (${summary.updatedLegislators.length} updated)`);
    lines.push(summary.updatedLegislators.map(l => l.bioguideId).join(', '));
    lines.push('');
  }

  if (summary.noChangeBillTypes.length > 0) {
    lines.push('### No changes');
    lines.push(`- ${summary.noChangeBillTypes.join(', ')}`);
    lines.push('');
  }

  if (
    summary.newBills.length === 0 &&
    summary.updatedBills.length === 0 &&
    summary.deletedBills.length === 0 &&
    summary.updatedLegislators.length === 0
  ) {
    lines.push('_No content changes detected._');
  }

  return lines.join('\n');
}

function main(): void {
  const summary = collectChanges();
  const markdown = buildMarkdown(summary);

  // Write PR body
  const prBodyDir = path.dirname(PR_BODY_PATH);
  if (!fs.existsSync(prBodyDir)) {
    fs.mkdirSync(prBodyDir, { recursive: true });
  }
  fs.writeFileSync(PR_BODY_PATH, markdown, 'utf8');
  console.log(`Written: ${PR_BODY_PATH}`);

  // Write to GitHub Actions step summary
  const stepSummaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (stepSummaryPath) {
    fs.appendFileSync(stepSummaryPath, markdown + '\n', 'utf8');
    console.log('Written to GITHUB_STEP_SUMMARY');
  }

  console.log('\n--- Summary ---\n' + markdown);
}

main();
