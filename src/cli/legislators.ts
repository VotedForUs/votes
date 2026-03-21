/**
 * CLI utility functions for generating legislator data files
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
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
  /** Congressional term to fetch (defaults to 119). */
  congress?: number;
  /** If set, download legislator images to this directory and update imageUrl to local path. */
  imagesDir?: string;
}

/** Strip `updateDate` recursively so we can detect no-op API refreshes. */
export function legislatorJsonWithoutUpdateDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legislatorJsonWithoutUpdateDates);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'updateDate') continue;
      out[k] = legislatorJsonWithoutUpdateDates(v);
    }
    return out;
  }
  return value;
}

function shouldSkipIdenticalLegislatorFile(
  filePath: string,
  nextJson: string,
  fsModule: typeof fs,
): boolean {
  if (!fsModule.existsSync(filePath)) return false;
  try {
    const prev = fsModule.readFileSync(filePath, 'utf8');
    const a = legislatorJsonWithoutUpdateDates(JSON.parse(prev));
    const b = legislatorJsonWithoutUpdateDates(JSON.parse(nextJson));
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

type HttpGetFn = (url: string, callback: (res: any) => void) => { on: (event: string, cb: (...args: any[]) => void) => void };

/**
 * Downloads a legislator's image to imagesDir/{bioguideId}.{ext}.
 * Skips if the file already exists (acts as permanent cache).
 * Returns the local URL path (e.g. /images/legislators/A000001.jpg) or the original if download fails.
 */
export async function downloadLegislatorImage(
  imageUrl: string,
  bioguideId: string,
  imagesDir: string,
  fsModule: typeof fs = fs,
  httpsGet: HttpGetFn = https.get,
  httpGet: HttpGetFn = http.get,
): Promise<string> {
  const urlObj = new URL(imageUrl);
  const urlExt = path.extname(urlObj.pathname).toLowerCase();
  const ext = urlExt || '.jpg';
  const filename = `${bioguideId}${ext}`;
  const destPath = path.join(imagesDir, filename);

  if (fsModule.existsSync(destPath)) {
    return `/images/legislators/${filename}`;
  }

  return new Promise((resolve) => {
    const requestGet = urlObj.protocol === 'https:' ? httpsGet : httpGet;
    const req = requestGet(imageUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadLegislatorImage(redirectUrl, bioguideId, imagesDir, fsModule, httpsGet, httpGet)
            .then(resolve)
            .catch(() => resolve(imageUrl));
        } else {
          resolve(imageUrl);
        }
        return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        console.warn(`Failed to download image for ${bioguideId}: HTTP ${res.statusCode}`);
        resolve(imageUrl);
        return;
      }
      const fileStream = fsModule.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(`/images/legislators/${filename}`);
      });
      fileStream.on('error', () => {
        console.warn(`Failed to write image for ${bioguideId}`);
        resolve(imageUrl);
      });
    });
    req.on('error', () => {
      console.warn(`Failed to download image for ${bioguideId}`);
      resolve(imageUrl);
    });
  });
}

/**
 * Generates legislators data and writes one JSON file per legislator to outputDir
 * @param outputDir - Directory to write [bioguideid].json files (defaults to .cache/legislators)
 * @param small - Whether to reduce legislator data to small format
 * @param options - Optional. congress: which congressional term to fetch (default 119)
 * @param fsModule - Optional custom fs module (for testing)
 * @param LegislatorsClass - Optional Legislators class (for testing)
 */
export async function getLegislators(
  outputDir?: string,
  small: boolean = false,
  options?: GetLegislatorsOptions,
  fsModule: typeof fs = fs,
  LegislatorsClass: typeof Legislators = Legislators,
  httpsGet?: Parameters<typeof downloadLegislatorImage>[4],
  httpGet?: Parameters<typeof downloadLegislatorImage>[5],
): Promise<void> {
  const finalOutputDir = outputDir ?? path.join(process.cwd(), '.cache', 'legislators');
  const congress = options?.congress ?? 119;
  const imagesDir = options?.imagesDir;
  console.log(`Generating legislators data...`);
  console.log(`Output directory: ${finalOutputDir}`);
  console.log(`Small: ${small}`);
  console.log(`Congress: ${congress}`);
  if (imagesDir) {
    console.log(`Images directory: ${imagesDir}`);
  }
  const legislators = new LegislatorsClass();
  const rawLegislators: Legislator[] = await legislators.getAllLegislators(congress);
  console.log(`Fetched ${rawLegislators.length} legislators`);

  if (imagesDir && !fsModule.existsSync(imagesDir)) {
    fsModule.mkdirSync(imagesDir, { recursive: true });
    console.log(`Created images directory: ${imagesDir}`);
  }

  // Optionally download images and rewrite imageUrl
  let processedLegislators: Legislator[] = rawLegislators;
  if (imagesDir) {
    let imageCount = 0;
    processedLegislators = await Promise.all(
      rawLegislators.map(async (leg) => {
        if (!leg.depiction?.imageUrl) return leg;
        const localUrl = await downloadLegislatorImage(leg.depiction.imageUrl, leg.bioguideId, imagesDir, fsModule, httpsGet, httpGet);
        if (localUrl !== leg.depiction.imageUrl) imageCount++;
        return {
          ...leg,
          depiction: { ...leg.depiction, imageUrl: localUrl },
        };
      })
    );
    console.log(`Downloaded/verified ${imageCount} images`);
  }

  let allLegislators: Legislator[] | LegislatorSmall[] = processedLegislators;
  if (small) {
    allLegislators = allLegislators.map(reduceLegislator) as LegislatorSmall[];
  }
  if (!fsModule.existsSync(finalOutputDir)) {
    fsModule.mkdirSync(finalOutputDir, { recursive: true });
    console.log(`Created output directory: ${finalOutputDir}`);
  }
  for (const leg of allLegislators) {
    const bioguideId = (leg as Legislator).bioguideId ?? (leg as LegislatorSmall).bioguide;
    if (!bioguideId) continue;
    const filePath = path.join(finalOutputDir, `${bioguideId}.json`);
    const nextJson = JSON.stringify(leg, null, 2);
    if (shouldSkipIdenticalLegislatorFile(filePath, nextJson, fsModule)) continue;
    fsModule.writeFileSync(filePath, nextJson, 'utf8');
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
    const filePath = path.join(outputDir, `${bioguideId}.json`);
    const nextJson = JSON.stringify(out, null, 2);
    if (!shouldSkipIdenticalLegislatorFile(filePath, nextJson, fsModule)) {
      fsModule.writeFileSync(filePath, nextJson, 'utf8');
    }
    count++;
  }
  return count;
}

