/**
 * CLI utility functions for generating legislator data files
 */

import * as fs from "fs";
import * as path from "path";
import { Legislators } from "../legislators/legislators.js";
import type { Legislator, LegislatorSmall } from "../legislators/legislators.types.js";

export function reduceLegislator(legislator: Legislator): LegislatorSmall {
  let nameTitle = '';
  if (legislator.latest_term?.type === 'sen') {
    nameTitle = `Sen. ${legislator.name?.official_full} (${legislator.latest_term?.state})`;
  } else {
    nameTitle = `Rep. ${legislator.name?.official_full} (${legislator.latest_term?.state}-${legislator.latest_term?.district})`;
  }

  const leg: LegislatorSmall = {
    id: legislator.bioguideId,
    bioguide: legislator.bioguideId,
    name: legislator.name?.official_full,
    lastName: legislator.name?.last,
    state: legislator.latest_term?.state,
    party: legislator.latest_term?.party,
    district: legislator.latest_term?.district,
    nameTitle: nameTitle,
    imageUrl: legislator.depiction?.imageUrl,
    attribution: legislator.depiction?.attribution,
    stateRank: legislator.latest_term?.state_rank,
    type: legislator.latest_term?.type,
    lis_member_id: legislator.lis_member_id,
  };
  return leg;
}

export interface GetLegislatorsOptions {
  /** If set, only include legislators who served in the last N congresses (e.g. 3 = 117th–119th). Reduces file count for site performance. */
  lastNCongresses?: number;
}

/**
 * Generates legislators data and writes one JSON file per legislator to outputDir
 * @param outputDir - Directory to write [bioguideid].json files (defaults to .cache/legislators)
 * @param currentMember - Whether to fetch only current members (defaults to false = all members)
 * @param small - Whether to reduce legislator data to small format
 * @param options - Optional. lastNCongresses: only include legislators who served in the last N congresses
 * @param fsModule - Optional custom fs module (for testing)
 * @param LegislatorsClass - Optional Legislators class (for testing)
 */
export async function getLegislators(
  outputDir?: string,
  currentMember: boolean = false,
  small: boolean = false,
  options?: GetLegislatorsOptions,
  fsModule: typeof fs = fs,
  LegislatorsClass: typeof Legislators = Legislators,
): Promise<void> {
  const finalOutputDir = outputDir ?? path.join(process.cwd(), '.cache', 'legislators');
  console.log(`Generating legislators data...`);
  console.log(`Output directory: ${finalOutputDir}`);
  console.log(`Current members only: ${currentMember}`);
  console.log(`Small: ${small}`);
  if (options?.lastNCongresses) {
    console.log(`Last N congresses filter: ${options.lastNCongresses}`);
  }
  const legislators = new LegislatorsClass();
  console.log(`Fetching ${currentMember ? 'current' : 'all'} legislators...`);
  let allLegislators: Legislator[] | LegislatorSmall[] = await legislators.getAllLegislators(currentMember, {
    lastNCongresses: options?.lastNCongresses,
  });
  if (small) {
    allLegislators = allLegislators.map(reduceLegislator) as LegislatorSmall[];
  }
  console.log(`Fetched ${allLegislators.length} legislators`);
  if (!fsModule.existsSync(finalOutputDir)) {
    fsModule.mkdirSync(finalOutputDir, { recursive: true });
    console.log(`Created output directory: ${finalOutputDir}`);
  }
  for (const leg of allLegislators) {
    const bioguideId = (leg as Legislator).bioguideId ?? (leg as LegislatorSmall).bioguide;
    if (!bioguideId) continue;
    const filePath = path.join(finalOutputDir, `${bioguideId}.json`);
    fsModule.writeFileSync(filePath, JSON.stringify(leg, null, 2), 'utf8');
  }
  console.log(`Successfully wrote ${allLegislators.length} legislators to ${finalOutputDir}`);
}

/**
 * Options for buildLegislatorsFromCache
 */
export interface BuildLegislatorsFromCacheOptions {
  /** Path to cached all-legislators JSON file (array of Legislator or LegislatorSmall) */
  cachePath: string;
  /** Directory to write [bioguideid].json files */
  outputDir: string;
  /** If true, reduce each to LegislatorSmall */
  small?: boolean;
  fsModule?: typeof fs;
}

/**
 * Writes per-legislator JSON files from a cached all-legislators file (no API calls).
 * Mirrors the pattern of buildBillTypeFromCache for bills.
 */
export function buildLegislatorsFromCache(options: BuildLegislatorsFromCacheOptions): number {
  const { cachePath, outputDir, small = false, fsModule = fs } = options;
  if (!fsModule.existsSync(cachePath)) {
    console.warn(`Cache file not found: ${cachePath}`);
    return 0;
  }
  const raw = fsModule.readFileSync(cachePath, 'utf8');
  let data: Legislator[] | LegislatorSmall[];
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.warn(`Invalid JSON in ${cachePath}:`, e);
    return 0;
  }
  if (!Array.isArray(data)) {
    console.warn(`Cache file must be a JSON array`);
    return 0;
  }
  if (!fsModule.existsSync(outputDir)) {
    fsModule.mkdirSync(outputDir, { recursive: true });
  }
  let count = 0;
  for (const leg of data) {
    const bioguideId = (leg as Legislator).bioguideId ?? (leg as LegislatorSmall).bioguide;
    if (!bioguideId) continue;
    const out = small ? reduceLegislator(leg as Legislator) : leg;
    fsModule.writeFileSync(path.join(outputDir, `${bioguideId}.json`), JSON.stringify(out, null, 2), 'utf8');
    count++;
  }
  return count;
}

