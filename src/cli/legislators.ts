/**
 * CLI utility functions for generating legislator data files
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { Legislators } from "../legislators/legislators.js";
import type { Legislator, LegislatorSmall } from "../legislators/legislators.types.js";

/** Site-relative URL prefix written into legislator JSON `imageUrl` / `depiction.imageUrl`. */
export const LOCAL_LEGISLATOR_IMAGE_PREFIX = "/images/legislators";

/**
 * Default Congress.gov API cache directory (`memberUpdateDates` / `memberImageDates` sidecars).
 *
 * @returns `{cwd}/.cache/congress`
 */
export function defaultCongressCacheDir(): string {
  return path.join(process.cwd(), ".cache", "congress");
}

/**
 * Path to the member list `updateDate` sidecar written by {@link Legislators.getAllLegislators}.
 *
 * @param cacheDir - Congress API cache directory
 * @param congress - Congressional term
 */
export function memberUpdateDatesPath(cacheDir: string, congress: number): string {
  return path.join(cacheDir, `memberUpdateDates-${congress}.json`);
}

/**
 * Path to the last-fetched portrait `updateDate` sidecar.
 *
 * @param cacheDir - Congress API cache directory
 * @param congress - Congressional term
 */
export function memberImageDatesPath(cacheDir: string, congress: number): string {
  return path.join(cacheDir, `memberImageDates-${congress}.json`);
}

/**
 * Reads a bioguide → date JSON map from disk.
 *
 * @param filePath - Sidecar JSON path
 * @param fsModule - fs implementation
 * @returns Empty map when the file is missing or invalid
 */
export function readMemberDateSidecar(
  filePath: string,
  fsModule: typeof fs = fs,
): Map<string, string> {
  try {
    const raw = fsModule.readFileSync(filePath, "utf8");
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {
    return new Map();
  }
}

/**
 * Writes a bioguide → date JSON map to disk.
 *
 * @param filePath - Sidecar JSON path
 * @param dates - Map to persist
 * @param fsModule - fs implementation
 */
export function writeMemberDateSidecar(
  filePath: string,
  dates: Map<string, string>,
  fsModule: typeof fs = fs,
): void {
  fsModule.mkdirSync(path.dirname(filePath), { recursive: true });
  fsModule.writeFileSync(filePath, JSON.stringify(Object.fromEntries(dates), null, 2), "utf8");
}

/**
 * Local URL path for a cached legislator image filename.
 *
 * @param filename - `{bioguideId}{ext}`
 */
export function localLegislatorImageUrl(filename: string): string {
  return `${LOCAL_LEGISLATOR_IMAGE_PREFIX}/${filename}`;
}

/**
 * Filename used when saving a legislator portrait (`{bioguideId}{ext}`).
 *
 * @param imageUrl - Remote or local image URL
 * @param bioguideId - Member bioguide id
 */
export function legislatorImageFilename(imageUrl: string, bioguideId: string): string {
  const urlExt = path.extname(new URL(imageUrl).pathname).toLowerCase();
  return `${bioguideId}${urlExt || ".jpg"}`;
}

/**
 * Whether to GET the remote portrait: missing file, or member `updateDate` differs from last image fetch.
 *
 * @param destExists - True if `imagesDir/{bioguide}{ext}` already exists
 * @param currentUpdateDate - Member list `updateDate` (undefined if sidecar missing)
 * @param lastImageUpdateDate - `updateDate` recorded at last successful image fetch
 */
export function legislatorImageNeedsDownload(
  destExists: boolean,
  currentUpdateDate: string | undefined,
  lastImageUpdateDate: string | undefined,
): boolean {
  return !destExists || currentUpdateDate !== lastImageUpdateDate;
}

/**
 * Reduces a full {@link Legislator} to the site-oriented {@link LegislatorSmall} shape.
 *
 * @param legislator - Merged legislator record
 * @returns Compact legislator fields including `imageUrl` from depiction
 */
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
  /**
   * Congress API cache directory for `memberUpdateDates` / `memberImageDates` sidecars.
   * Defaults to {@link defaultCongressCacheDir}.
   */
  congressCacheDir?: string;
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
 * Resolves to a local image URL if the dest file exists; otherwise the original remote URL.
 *
 * @param destPath - On-disk image path
 * @param filename - `{bioguideId}{ext}`
 * @param imageUrl - Original remote URL (fallback when dest is missing)
 * @param fsModule - fs implementation
 */
function localImageUrlOrOriginal(
  destPath: string,
  filename: string,
  imageUrl: string,
  fsModule: typeof fs,
): string {
  return fsModule.existsSync(destPath) ? localLegislatorImageUrl(filename) : imageUrl;
}

/**
 * Downloads a legislator's image to imagesDir/{bioguideId}.{ext}.
 * Skips the HTTP GET when the file exists and `forceRefresh` is false.
 * When `forceRefresh` is true, overwrites an existing file.
 *
 * @param imageUrl - Remote portrait URL
 * @param bioguideId - Member bioguide id
 * @param imagesDir - Destination directory
 * @param fsModule - fs implementation
 * @param httpsGet - HTTPS GET (injectable for tests)
 * @param httpGet - HTTP GET (injectable for tests)
 * @param forceRefresh - When true, re-download even if the dest file exists
 * @returns Local URL path (e.g. /images/legislators/A000001.jpg) or the original if download fails and no dest file remains
 */
export async function downloadLegislatorImage(
  imageUrl: string,
  bioguideId: string,
  imagesDir: string,
  fsModule: typeof fs = fs,
  httpsGet: HttpGetFn = https.get,
  httpGet: HttpGetFn = http.get,
  forceRefresh: boolean = false,
): Promise<string> {
  const filename = legislatorImageFilename(imageUrl, bioguideId);
  const destPath = path.join(imagesDir, filename);
  const localUrl = localLegislatorImageUrl(filename);

  if (fsModule.existsSync(destPath) && !forceRefresh) {
    return localUrl;
  }

  return new Promise((resolve) => {
    const urlObj = new URL(imageUrl);
    const requestGet = urlObj.protocol === 'https:' ? httpsGet : httpGet;
    const req = requestGet(imageUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadLegislatorImage(redirectUrl, bioguideId, imagesDir, fsModule, httpsGet, httpGet, forceRefresh)
            .then(resolve)
            .catch(() => resolve(localImageUrlOrOriginal(destPath, filename, imageUrl, fsModule)));
        } else {
          resolve(localImageUrlOrOriginal(destPath, filename, imageUrl, fsModule));
        }
        return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        console.warn(`Failed to download image for ${bioguideId}: HTTP ${res.statusCode}`);
        resolve(localImageUrlOrOriginal(destPath, filename, imageUrl, fsModule));
        return;
      }
      const fileStream = fsModule.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(localUrl);
      });
      fileStream.on('error', () => {
        console.warn(`Failed to write image for ${bioguideId}`);
        resolve(localImageUrlOrOriginal(destPath, filename, imageUrl, fsModule));
      });
    });
    req.on('error', () => {
      console.warn(`Failed to download image for ${bioguideId}`);
      resolve(localImageUrlOrOriginal(destPath, filename, imageUrl, fsModule));
    });
  });
}

/**
 * Generates legislators data and writes one JSON file per legislator to outputDir.
 * When `imagesDir` is set, downloads portraits when missing or when the member list
 * `updateDate` differs from the last image fetch (see `memberImageDates-{congress}.json`).
 *
 * @param outputDir - Directory to write [bioguideid].json files (defaults to .cache/legislators)
 * @param small - Whether to reduce legislator data to small format
 * @param options - congress, imagesDir, congressCacheDir
 * @param fsModule - Optional custom fs module (for testing)
 * @param LegislatorsClass - Optional Legislators class (for testing)
 * @param httpsGet - Optional HTTPS GET (for testing image downloads)
 * @param httpGet - Optional HTTP GET (for testing image downloads)
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
  const congressCacheDir = options?.congressCacheDir ?? defaultCongressCacheDir();
  console.log(`Generating legislators data...`);
  console.log(`Output directory: ${finalOutputDir}`);
  console.log(`Small: ${small}`);
  console.log(`Congress: ${congress}`);
  if (imagesDir) {
    console.log(`Images directory: ${imagesDir}`);
  }
  const legislators = new LegislatorsClass();
  const rawLegislators: Legislator[] = await legislators.getAllLegislators(congress, {
    legislatorDataDir: finalOutputDir,
  });
  console.log(`Fetched ${rawLegislators.length} legislators`);

  if (imagesDir && !fsModule.existsSync(imagesDir)) {
    fsModule.mkdirSync(imagesDir, { recursive: true });
    console.log(`Created images directory: ${imagesDir}`);
  }

  let processedLegislators: Legislator[] = rawLegislators;
  if (imagesDir) {
    const memberUpdateDates = readMemberDateSidecar(
      memberUpdateDatesPath(congressCacheDir, congress),
      fsModule,
    );
    const imageDatesFile = memberImageDatesPath(congressCacheDir, congress);
    const memberImageDates = readMemberDateSidecar(imageDatesFile, fsModule);
    let imageCount = 0;
    let imageDatesDirty = false;

    processedLegislators = await Promise.all(
      rawLegislators.map(async (leg) => {
        if (!leg.depiction?.imageUrl) return leg;
        const filename = legislatorImageFilename(leg.depiction.imageUrl, leg.bioguideId);
        const destPath = path.join(imagesDir, filename);
        const destExists = fsModule.existsSync(destPath);
        const currentDate = memberUpdateDates.get(leg.bioguideId);
        const lastImageDate = memberImageDates.get(leg.bioguideId);
        const needsDownload = legislatorImageNeedsDownload(destExists, currentDate, lastImageDate);
        const forceRefresh = destExists && needsDownload;
        const localUrl = needsDownload
          ? await downloadLegislatorImage(
              leg.depiction.imageUrl,
              leg.bioguideId,
              imagesDir,
              fsModule,
              httpsGet,
              httpGet,
              forceRefresh,
            )
          : localLegislatorImageUrl(filename);
        if (localUrl !== leg.depiction.imageUrl) imageCount++;
        if (
          currentDate !== undefined &&
          localUrl.startsWith(LOCAL_LEGISLATOR_IMAGE_PREFIX) &&
          lastImageDate !== currentDate
        ) {
          memberImageDates.set(leg.bioguideId, currentDate);
          imageDatesDirty = true;
        }
        return {
          ...leg,
          depiction: { ...leg.depiction, imageUrl: localUrl },
        };
      })
    );
    if (imageDatesDirty) {
      writeMemberDateSidecar(imageDatesFile, memberImageDates, fsModule);
    }
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

