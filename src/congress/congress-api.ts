import * as fs from "fs";
import * as path from "path";
import { Legislators } from "../legislators/legislators.js";
import { Legislator } from "../legislators/legislators.types.js";
import { YamlUtils } from "../utils/yaml-utils.js";
import { XmlUtils } from "../utils/xml-utils.js";
import { getCacheFilePath, readCacheFile } from "../utils/fetchUtils.js";
import type { SenateRollCallVoteXml, SenateRollCallVoteMember } from "./congress-raw-files.types.js";
import type { HouseVotePartyTotal } from "../api-congress-gov/abstract-api.types.js";
import { BillWithActions, ChamberVote, BillActionWithVotes, SenateVoteData, HouseVoteData, PopulateRecordedVotesParams, RecordedVoteWithVotes, VoteResult, BillState } from "./congress-api.types.js";
import { ACTION_CODES } from "./constants.js";
import { BillAction, BillLatestAction, RecordedVote, BaseBillSummary, ExtendedBillSummary, BillTitle, BillListResponse } from "../api-congress-gov/abstract-api.types.js";

/**
 * Compute lastActionDate and lastRecordedVoteDate from a bill's actions.
 * Exported for use by build-from-cache in bills CLI.
 */
export function computeBillDateFields(actions: BillActionWithVotes[]): { lastActionDate?: string; lastRecordedVoteDate?: string } {
  let lastActionDate: string | undefined;
  let lastRecordedVoteDate: string | undefined;
  for (const action of actions) {
    if (action.actionDate) {
      if (!lastActionDate || action.actionDate > lastActionDate) {
        lastActionDate = action.actionDate;
      }
    }
    for (const vote of action.recordedVotes ?? []) {
      const d = vote.date ?? action.actionDate;
      if (d && (!lastRecordedVoteDate || d > lastRecordedVoteDate)) {
        lastRecordedVoteDate = d;
      }
    }
  }
  return { lastActionDate, lastRecordedVoteDate };
}

/**
 * Returns true if the action should be kept when filtering out Library of Congress actions.
 * Keep all non-LoC actions; keep LoC actions only when type is President or BecameLaw.
 */
export function shouldKeepAction(
  action: { sourceSystem?: { name?: string }; type?: string }
): boolean {
  if (action.sourceSystem?.name !== "Library of Congress") return true;
  const t = action.type?.toLowerCase();
  return t === "president" || t === "becamelaw";
}

/** Substrings in latestAction.text that indicate the bill became law (excludes "Presented to President" etc.). */
const BECAME_LAW_PATTERNS = /became public law|signed by president\.?/i;

/** Substrings in latestAction.text that indicate the bill is rejected or dead (no longer in progress). */
const REJECTED_OR_DEAD_PATTERNS = [
  "failed of passage",
  "not agreed to in house",
  "not agreed to in senate",
  "vetoed by president",
  "pocket vetoed by president",
  "override attempt failed",
  "motion to proceed to consideration of measure rejected",
  "motion to proceed rejected",
  "cloture motion rejected",
] as const;

/**
 * Returns the current state of the bill from its latest action (and related data).
 * Single source of truth for becameLaw vs inProgress vs rejected.
 * Compatible with BillWithActions and any object with latestAction?: { text?: string }.
 */
export function getBillState(bill: { latestAction?: { text?: string } }): BillState {
  const text = (bill.latestAction?.text ?? "").trim();
  if (!text) return "inProgress";
  const lower = text.toLowerCase();
  if (BECAME_LAW_PATTERNS.test(text)) return "becameLaw";
  if (REJECTED_OR_DEAD_PATTERNS.some((pattern) => lower.includes(pattern))) return "rejected";
  if (lower.includes("motion to discharge") && lower.includes("rejected")) return "rejected";
  return "inProgress";
}

/**
 * Returns true if the bill's latest action indicates it was rejected or is dead (no longer in progress).
 * Convenience for getBillState(bill) === "rejected".
 */
export function isBillRejectedOrDead(bill: { latestAction?: { text?: string } }): boolean {
  return getBillState(bill) === "rejected";
}

/**
 * Returns true if the vote result indicates the measure passed.
 * Accepts normalized VoteResult ("passed" | "rejected") or raw API result strings.
 */
export function isVotePassed(result: VoteResult | string | undefined): boolean {
  if (result == null || String(result).trim() === "") return false;
  const r = String(result).toLowerCase();
  if (r === "passed") return true;
  if (r === "rejected") return false;
  return /pass|agree|yea|adopted|approved/.test(r) && !/reject|fail|nay|disagree/.test(r);
}

/**
 * CongressApi class that combines Congress.gov API functionality with legislator data
 * Extends Legislators which provides both API access and legislator management
 */
export class CongressApi extends Legislators {
  private fsModule: typeof fs;

  constructor(
    congressionalTerm: number = 119,
    fetchFunction: typeof fetch = fetch,
    cacheDir?: string,
    yamlUtils: typeof YamlUtils = YamlUtils,
    fsModule: typeof fs = fs,
    xmlUtils: typeof XmlUtils = XmlUtils,
    skipCache: boolean = false,
  ) {
    super(congressionalTerm, fetchFunction, cacheDir, yamlUtils, fsModule, xmlUtils, skipCache);
    this.fsModule = fsModule;
  }

  /**
   * Normalize raw party string to canonical voteParty: Republican, Democrat, or Independent.
   */
  private normalizeVoteParty(party: string): "Republican" | "Democrat" | "Independent" {
    const p = (party ?? "").trim().toLowerCase();
    if (p === "republican" || p === "r") return "Republican";
    if (p === "democrat" || p === "d") return "Democrat";
    if (p === "independent" || p === "id" || p === "i") return "Independent";
    return "Independent";
  }

  /**
   * Normalize raw API vote result text to "passed" or "rejected" using regex.
   * Matches "pass" (e.g. Passed, Passed by Unanimous Consent, Agreed to) -> "passed"; otherwise "rejected".
   */
  normalizeVoteResult(rawResult: string): VoteResult {
    const s = (rawResult ?? "").trim();
    return /pass|agreed|confirmed/i.test(s) ? "passed" : "rejected";
  }

  /**
   * Returns true if the action text indicates a Senate pass by unanimous consent without amendment.
   * Such actions have no roll call but are treated as recorded votes with all senators as UC.
   */
  private isSenateUnanimousConsentPass(action: BillAction): boolean {
    if (!shouldKeepAction(action) || !action.text) return false;
    const t = action.text.toLowerCase();
    const hasUnanimousConsent = t.includes("without amendment by unanimous consent");
    const hasSenatePass =
      t.includes("passed senate") ||
      (t.includes("passed") && action.sourceSystem?.name === "Senate");
    return hasUnanimousConsent && !!hasSenatePass;
  }

  /** Phrases that indicate a voice vote was superseded by a demand for a recorded vote (exclude these). */
  private static readonly VOICE_VOTE_DEMANDED_PHRASES = [
    "demanded the yeas and nays",
    "demanded a recorded vote",
    "demanded yeas and nays",
  ] as const;

  /**
   * Returns true if the action is a floor action where a voice vote was used to pass or reject
   * (and no recorded vote was demanded). Such actions get a synthetic recorded vote with each
   * legislator marked as 'vv' (voice vote).
   */
  private isVoiceVoteChamberVote(action: BillAction): boolean {
    if (!shouldKeepAction(action) || !action.text) return false;
    const t = action.text.toLowerCase();
    const typeFloor = (action.type ?? "").toLowerCase() === "floor";
    if (!typeFloor || !t.includes("voice vote")) return false;
    const hasDemand = CongressApi.VOICE_VOTE_DEMANDED_PHRASES.some((phrase) =>
      t.includes(phrase.toLowerCase())
    );
    if (hasDemand) return false;
    const hasOutcome =
      t.includes("passed") ||
      t.includes("rejected") ||
      t.includes("agreed") ||
      t.includes("prevailed");
    return !!hasOutcome;
  }

  /**
   * Derive passed/rejected from voice vote action text (e.g. "noes had prevailed" -> rejected).
   */
  private voiceVoteResultFromText(text: string): VoteResult {
    const t = (text ?? "").toLowerCase();
    if (t.includes("rejected") || t.includes("noes had prevailed") || t.includes("noes prevailed")) {
      return "rejected";
    }
    return "passed";
  }

  /**
   * Check if an action has recorded votes
   * @param action - The bill action to check
   * @returns true if the action has recorded votes (excluding Library of Congress source)
   */
  private hasRecordedVotes(action: BillAction): boolean {
    if (!shouldKeepAction(action)) return false;
    if (this.isSenateUnanimousConsentPass(action)) return true;
    if (this.isVoiceVoteChamberVote(action)) return true;
    return Array.isArray(action.recordedVotes) && action.recordedVotes.length > 0;
  }

  /**
   * Build votePartyTotal array from Senate roll call members (same shape as House).
   * Groups by party and counts vote_cast (Yea, Nay, Present, Not Voting).
   */
  private buildSenateVotePartyTotals(members: SenateRollCallVoteMember[]): HouseVotePartyTotal[] {
    const byParty = new Map<string, { yea: number; nay: number; present: number; notVoting: number }>();
    for (const m of members) {
      const party = m.party ?? 'Unknown';
      if (!byParty.has(party)) {
        byParty.set(party, { yea: 0, nay: 0, present: 0, notVoting: 0 });
      }
      const totals = byParty.get(party)!;
      const v = (m.vote_cast ?? '').toLowerCase();
      if (v === 'yea') totals.yea += 1;
      else if (v === 'nay') totals.nay += 1;
      else if (v === 'present') totals.present += 1;
      else totals.notVoting += 1;
    }
    return Array.from(byParty.entries()).map(([voteParty, totals]) => ({
      voteParty,
      yeaTotal: totals.yea,
      nayTotal: totals.nay,
      presentTotal: totals.present,
      notVotingTotal: totals.notVoting,
    }));
  }

  /**
   * Build a BillWithActions object from bill response, actions, and titles
   * @param billResponse - The bill info response
   * @param actions - Array of bill actions (already filtered/populated as needed)
   * @param titlesResponse - Optional titles response
   * @returns BillWithActions object
   */
  private buildBillWithActions(
    billResponse: { bill: ExtendedBillSummary },
    actions: BillActionWithVotes[],
    titlesResponse?: { titles: BillTitle[] }
  ): BillWithActions {
    const billId = `${billResponse.bill.congress}-${billResponse.bill.type}-${billResponse.bill.number}`;
    const { lastActionDate, lastRecordedVoteDate } = computeBillDateFields(actions);
    const fallbackLastActionDate = billResponse.bill.latestAction?.actionDate;
    const first = actions[0];
    const apiLatest = billResponse.bill.latestAction;
    const latestAction =
      first != null && apiLatest?.actionDate != null && apiLatest.actionDate >= first.actionDate
        ? apiLatest
        : first != null
          ? { actionDate: first.actionDate, actionTime: first.actionTime, text: first.text, actionCode: first.actionCode }
          : apiLatest;
    return {
      ...billResponse.bill,
      id: billId,
      actions: {
        ...billResponse.bill.actions,
        actions,
      },
      titles: titlesResponse?.titles ? { titles: titlesResponse.titles } : undefined,
      lastActionDate: lastActionDate ?? fallbackLastActionDate,
      lastRecordedVoteDate,
      ...(latestAction != null && { latestAction }),
    };
  }

  /**
   * Pre-filter bills by latestAction.text to skip those unlikely to have votes
   * @param bills - Array of bills to filter
   * @returns Filtered array excluding bills with committee referral actions
   */
  private preFilterBillsByLatestAction(bills: BaseBillSummary[]): BaseBillSummary[] {
    return bills.filter(bill => {
      const latestActionText = bill.latestAction?.text || '';
      const shouldFilter = CongressApi.FILTER_LATEST_ACTION_STRINGS.some(
        filterString => latestActionText.startsWith(filterString)
      );
      return !shouldFilter;
    });
  }

  /**
   * Fetch house votes for a recorded vote
   * @param recordedVote - The recorded vote information
   * @returns Promise resolving to HouseVoteData object or undefined
   */
  private async fetchHouseVotesForRecordedVote(recordedVote: RecordedVote): Promise<HouseVoteData | undefined> {
    try {
      if (recordedVote.chamber.toLowerCase() !== 'house') {
        return undefined;
      }

      // Fetch both members and vote details
      const [members, houseRollCallVote] = await Promise.all([
        this.fetchHouseVoteMembers(
          recordedVote.congress,
          recordedVote.sessionNumber,
          recordedVote.rollNumber
        ),
        this.fetchHouseVoteDetails(
          recordedVote.congress,
          recordedVote.sessionNumber,
          recordedVote.rollNumber
        )
      ]);

      // Convert to ChamberVote format (bioguideId -> vote)
      const chamberVote: ChamberVote = {};
      for (const member of members) {
        chamberVote[member.bioguideID] = member.voteCast;
      }

      return {
        votes: chamberVote,
        result: this.normalizeVoteResult(houseRollCallVote.result),
        votePartyTotal: houseRollCallVote.votePartyTotal,
        voteUrl: houseRollCallVote.sourceDataURL,
        question: houseRollCallVote.voteQuestion
      };
    } catch (error) {
      console.warn(`Error fetching house votes for roll ${recordedVote.rollNumber}:`, error);
      return undefined;
    }
  }

  /**
   * Fetch senate votes for a recorded vote from senate.gov XML
   * @param recordedVote - The recorded vote information
   * @returns Promise resolving to SenateVoteData object or undefined
   */
  private async fetchSenateVotesForRecordedVote(recordedVote: RecordedVote): Promise<SenateVoteData | undefined> {
    try {
      if (recordedVote.chamber.toLowerCase() !== 'senate') {
        return undefined;
      }

      // Parse URL to extract cache path components
      // Example URL: https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00372.xml
      const url = recordedVote.url;
      const match = url.match(/roll_call_votes\/(.+)$/);
      if (!match) {
        console.warn(`Could not parse senate vote URL: ${url}`);
        return undefined;
      }

      // Extract path after roll_call_votes/ (e.g., "vote1191/vote_119_1_00372.xml")
      const pathAfterRollCallVotes = match[1];
      const pathParts = pathAfterRollCallVotes.split('/');
      
      // Extract vote directory (e.g., "vote1191") and filename (e.g., "vote_119_1_00372.xml")
      const voteDirectory = pathParts.length > 1 ? pathParts[0] : '';
      const filename = pathParts[pathParts.length - 1];

      // Construct cache directory path
      const cacheDir = path.join(this.getCacheDir(), 'senate', 'roll_call_votes', voteDirectory);

      // Download and parse XML
      const xmlResult = await this.xmlUtils.downloadXml<SenateRollCallVoteXml>({
        url,
        cacheDir,
        cacheFilename: filename,
        parseXml: true,
        useCache: true,
      });

      // Extract members from XML structure
      const rollCallVote = xmlResult.data.roll_call_vote;
      if (!rollCallVote?.members?.member) {
        console.warn(`No members found in senate vote XML for roll ${recordedVote.rollNumber}`);
        return undefined;
      }

      const members = rollCallVote.members.member;

      // Convert to ChamberVote format (bioguideId -> vote)
      const chamberVote: ChamberVote = {};
      
      for (const member of members) {
        if (member.lis_member_id && member.vote_cast) {
          const lisMemberId = member.lis_member_id;
          const bioguideId = this.bioguideIdFromLisMemberId(lisMemberId);
          
          if (bioguideId) {
            chamberVote[bioguideId] = member.vote_cast;
          } else {
            // This should not happen if legislators data is complete
            console.error(`ERROR: Could not find bioguide ID for LIS member ID: ${lisMemberId} in roll ${recordedVote.rollNumber}`);
          }
        }
      }

      const votePartyTotal = this.buildSenateVotePartyTotals(members);
      // Return extended vote data
      // Note: fast-xml-parser represents the actual XML structure without wrapping in arrays
      return {
        votes: chamberVote,
        result: this.normalizeVoteResult(rollCallVote.vote_result || ''),
        senateCount: rollCallVote.count || { yeas: '', nays: '', present: '', absent: '' },
        votePartyTotal,
        voteUrl: recordedVote.url,
        question: rollCallVote.vote_question_text || ''
      };
    } catch (error) {
      console.warn(`Error fetching senate votes for roll ${recordedVote.rollNumber}:`, error);
      return undefined;
    }
  }

  /**
   * Build SenateVoteData for a Senate unanimous consent pass (no roll call).
   * Uses current senators with vote 'UC', result from action.text, and synthetic counts as if all 100 voted Yea.
   * Uses raw legislator data only (getSenateBioguideIdsWithParty) so build-from-cache never calls getLegislator/API.
   */
  private async buildSenateUnanimousConsentVoteData(
    action: BillAction,
    params: PopulateRecordedVotesParams
  ): Promise<SenateVoteData> {
    await this.ensureInitialized();
    const asOfDate = action.actionDate ?? new Date().toISOString().slice(0, 10);
    const senators = this.getSenateBioguideIdsWithParty(asOfDate);
    const votes: ChamberVote = {};
    const byParty = new Map<string, { yea: number; nay: number; present: number; notVoting: number }>();
    for (const { bioguideId, party } of senators) {
      votes[bioguideId] = "UC";
      const voteParty = this.normalizeVoteParty(party);
      if (!byParty.has(voteParty)) byParty.set(voteParty, { yea: 0, nay: 0, present: 0, notVoting: 0 });
      byParty.get(voteParty)!.yea += 1;
    }
    const votePartyTotal: HouseVotePartyTotal[] = Array.from(byParty.entries()).map(
      ([voteParty, totals]) => ({
        voteParty,
        yeaTotal: totals.yea,
        nayTotal: totals.nay,
        presentTotal: totals.present,
        notVotingTotal: totals.notVoting,
      })
    );
    const voteUrl = `https://www.congress.gov/bill/${params.congress}th-congress/${params.billType.toLowerCase()}/${params.billNumber}`;
    const n = senators.length;
    return {
      votes,
      result: this.normalizeVoteResult("Passed by Unanimous Consent"),
      senateCount: { yeas: n, nays: 0, present: 0, absent: 0 },
      votePartyTotal,
      voteUrl,
      question: "Pass with Unanimous Consent",
    };
  }

  /**
   * Build vote data for a voice-vote chamber vote (House or Senate).
   * Uses legislators in that chamber at action date; each gets vote 'vv'.
   * Uses raw legislator data only so build-from-cache never calls getLegislator/API.
   */
  private async buildVoiceVoteVoteData(
    action: BillAction,
    params: PopulateRecordedVotesParams
  ): Promise<SenateVoteData | HouseVoteData> {
    await this.ensureInitialized();
    const asOfDate = action.actionDate ?? new Date().toISOString().slice(0, 10);
    const chamberName = (action.sourceSystem?.name ?? "").toLowerCase();
    const isSenate = chamberName === "senate";
    const members = isSenate
      ? this.getSenateBioguideIdsWithParty(asOfDate)
      : this.getHouseBioguideIdsWithParty(asOfDate);

    const votes: ChamberVote = {};
    const result = this.voiceVoteResultFromText(action.text ?? "");
    const byParty = new Map<string, { yea: number; nay: number; present: number; notVoting: number }>();
    for (const { bioguideId, party } of members) {
      votes[bioguideId] = "vv";
      const voteParty = this.normalizeVoteParty(party);
      if (!byParty.has(voteParty)) byParty.set(voteParty, { yea: 0, nay: 0, present: 0, notVoting: 0 });
      const totals = byParty.get(voteParty)!;
      if (result === "passed") totals.yea += 1;
      else totals.nay += 1;
    }
    const votePartyTotal: HouseVotePartyTotal[] = Array.from(byParty.entries()).map(
      ([voteParty, totals]) => ({
        voteParty,
        yeaTotal: totals.yea,
        nayTotal: totals.nay,
        presentTotal: totals.present,
        notVotingTotal: totals.notVoting,
      })
    );
    const voteUrl = `https://www.congress.gov/bill/${params.congress}th-congress/${params.billType.toLowerCase()}/${params.billNumber}`;

    if (isSenate) {
      const n = members.length;
      return {
        votes,
        result,
        senateCount: result === "passed" ? { yeas: n, nays: 0, present: 0, absent: 0 } : { yeas: 0, nays: n, present: 0, absent: 0 },
        votePartyTotal,
        voteUrl,
        question: "Voice Vote",
      };
    }
    return {
      votes,
      result,
      votePartyTotal,
      voteUrl,
      question: "Voice Vote",
    };
  }

  /**
   * Find the latest chamber vote action from a list of actions
   * @param actions - Array of bill actions
   * @returns The latest chamber vote action or undefined
   */
  private findLatestChamberVoteAction(actions: BillAction[]): BillAction | undefined {
    const chamberVoteActions = actions.filter(action => 
      this.hasRecordedVotes(action)
    );

    if (chamberVoteActions.length === 0) {
      return undefined;
    }

    // Sort by date (newest first) and return the latest
    return chamberVoteActions.sort((a, b) => 
      new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime()
    )[0];
  }

  /**
   * Get complete bill information including all actions
   * Combines bill data with all actions from Congress.gov API
   * @param billType - The type of bill (e.g., "HR", "S", "HJRES", "SJRES")
   * @param billNumber - The bill number
   * @param includeActions - 'all' to include all actions, 'votes' to include only actions with recorded votes, 'none' to return BaseBillSummary (default: 'all')
   * @param includeVotes - When true, include the votes for each action (default: false)
   * @returns Promise resolving to bill data with actions array or undefined if not found
   */
  async getBill(
    billType: string,
    billNumber: string,
    includeActions: 'all' | 'votes' | 'none' = 'all',
    includeVotes: boolean = false,
  ): Promise<BillWithActions | undefined> {
    await this.ensureInitialized();

    
    // If includeActions is 'none', just return basic bill info without actions
    if (includeActions === 'none') {
      try {
        const [billResponse, titlesResponse] = await Promise.all([
          this.fetchBillInfo(billType, billNumber),
          this.fetchBillTitles(billType, billNumber),
        ]);
        if (!billResponse?.bill) {
          return undefined;
        }
        // Return as BaseBillSummary with titles
        return {
          ...billResponse.bill,
          titles: titlesResponse?.titles ? { titles: titlesResponse.titles } : undefined,
        } as any;
      } catch (error) {
        console.warn(
          `Error fetching bill data for ${billType} ${billNumber}:`,
          error,
        );
        return undefined;
      }
    }

    try {
      // Fetch bill info, actions, and titles in parallel
      const [billResponse, actionsResponse, titlesResponse] = await Promise.all([
        this.fetchBillInfo(billType, billNumber),
        this.fetchBillActions(billType, billNumber),
        this.fetchBillTitles(billType, billNumber),
      ]);

      if (!billResponse?.bill) {
        return undefined;
      }

      // Get all actions: exclude Library of Congress except President/BecameLaw, then filter by includeActions
      const allActions = actionsResponse?.actions || [];
      const nonLoCActions = allActions.filter(
        (a): a is BillActionWithVotes => shouldKeepAction(a)
      );
      let actions: BillActionWithVotes[] = includeActions === 'votes'
        ? nonLoCActions.filter(action => this.hasRecordedVotes(action))
        : nonLoCActions;

      // Populate vote details if requested
      if (includeVotes) {
        actions = await this.populateRecordedVotes(actions, {
          congress: this.congressionalTerm,
          billType,
          billNumber,
        });
      }

      return this.buildBillWithActions(billResponse, actions, titlesResponse);
    } catch (error) {
      console.warn(
        `Error fetching complete bill data for ${billType} ${billNumber}:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Populates vote details (House and Senate) for all recorded votes in the given actions
   * Also assigns unique IDs to each recorded vote in reverse chronological order
   * (index 0 is oldest, so new actions added later won't change existing IDs)
   * @param actions - Array of bill actions with potential recorded votes
   * @param params - Optional bill identification for generating vote IDs
   * @returns Promise resolving to the same actions array with vote details populated
   */
  async populateRecordedVotes(
    actions: BillActionWithVotes[],
    params?: PopulateRecordedVotesParams
  ): Promise<BillActionWithVotes[]> {
    await this.ensureInitialized();

    // Exclude Library of Congress actions except President/BecameLaw (callers may pass raw API/cache data)
    const filteredActions = actions.filter(
      (a): a is BillActionWithVotes => shouldKeepAction(a)
    );

    const congress = params?.congress ?? this.congressionalTerm;

    // Inject synthetic recorded votes for unanimous consent (Senate) and voice vote (House or Senate)
    if (params) {
      for (const action of filteredActions) {
        if (this.isSenateUnanimousConsentPass(action) && (!action.recordedVotes || action.recordedVotes.length === 0)) {
          (action as BillActionWithVotes).recordedVotes = [
            {
              chamber: "Senate",
              congress,
              date: action.actionDate,
              rollNumber: 0,
              sessionNumber: 0,
              url: "",
            } as RecordedVoteWithVotes,
          ];
        } else if (
          this.isVoiceVoteChamberVote(action) &&
          (!action.recordedVotes || action.recordedVotes.length === 0)
        ) {
          const sourceName = (action.sourceSystem?.name ?? "").toLowerCase();
          const chamber = sourceName.startsWith("house") ? "House" : "Senate";
          (action as BillActionWithVotes).recordedVotes = [
            {
              chamber,
              congress,
              date: action.actionDate,
              rollNumber: 0,
              sessionNumber: 0,
              url: "",
            } as RecordedVoteWithVotes,
          ];
        }
      }
    }

    // Collect all recorded votes with their action context for ID assignment
    const allRecordedVotes: { action: BillActionWithVotes; vote: RecordedVoteWithVotes }[] = [];

    for (const action of filteredActions) {
      if (action.recordedVotes) {
        for (const recordedVote of action.recordedVotes) {
          allRecordedVotes.push({ action, vote: recordedVote });

          if (recordedVote.chamber.toLowerCase() === "house") {
            const isVoiceVote = !recordedVote.url && params && this.isVoiceVoteChamberVote(action);
            const houseVoteData = isVoiceVote
              ? (await this.buildVoiceVoteVoteData(action, params!)) as HouseVoteData
              : await this.fetchHouseVotesForRecordedVote(recordedVote);
            if (houseVoteData) {
              recordedVote.votes = houseVoteData.votes;
              recordedVote.result = houseVoteData.result;
              recordedVote.votePartyTotal = houseVoteData.votePartyTotal;
              recordedVote.voteUrl = houseVoteData.voteUrl;
              recordedVote.question = houseVoteData.question;
            }
          } else if (recordedVote.chamber.toLowerCase() === "senate") {
            const isUnanimousConsent =
              !recordedVote.url && params && this.isSenateUnanimousConsentPass(action);
            const isVoiceVote = !recordedVote.url && params && this.isVoiceVoteChamberVote(action);
            const senateVoteData = isUnanimousConsent
              ? await this.buildSenateUnanimousConsentVoteData(action, params)
              : isVoiceVote
                ? (await this.buildVoiceVoteVoteData(action, params)) as SenateVoteData
                : await this.fetchSenateVotesForRecordedVote(recordedVote);
            if (senateVoteData) {
              recordedVote.votes = senateVoteData.votes;
              recordedVote.result = senateVoteData.result;
              recordedVote.senateCount = senateVoteData.senateCount;
              recordedVote.votePartyTotal = senateVoteData.votePartyTotal;
              recordedVote.voteUrl = senateVoteData.voteUrl;
              recordedVote.question = senateVoteData.question;
            }
          }
        }
      }
    }
    
    // Assign IDs if params provided
    if (params) {
      // Reverse the array: API returns newest-first, so reverse gives oldest-first
      // Index 0 = oldest vote (last in original array from API)
      // This ensures new actions added later won't change existing IDs
      const reversedVotes = [...allRecordedVotes].reverse();
      
      // Assign IDs: 1-based, index 0 = oldest vote → id suffix 1
      reversedVotes.forEach((item, index) => {
        item.vote.id = `${params.congress}-${params.billType.toUpperCase()}-${params.billNumber}-${index + 1}`;
      });
    }

    return filteredActions;
  }

  /**
   * Creates a map of bill numbers to their updateDate values
   * @param bills - Array of bills to process
   * @returns Map of bill number to updateDate
   */
  private getBillUpdateDates(bills: BaseBillSummary[]): Map<string, string | undefined> {
    const updateDates = new Map<string, string | undefined>();
    for (const bill of bills) {
      updateDates.set(bill.number, bill.updateDate);
    }
    return updateDates;
  }

  /**
   * Reads the cached bill list for a specific endpoint
   * @param billType - Bill type (e.g., "HR", "S")
   * @param params - Query parameters used for the cache key
   * @returns Array of cached bills or null if no cache exists
   */
  private readCachedBillList(
    billType: string,
    params: Record<string, any>
  ): BaseBillSummary[] | null {
    const endpoint = `/bill/${this.congressionalTerm}/${billType.toLowerCase()}`;
    const cacheFilePath = getCacheFilePath(this.apiConfig.cacheDir, endpoint, params);
    const cached = readCacheFile<BillListResponse>(cacheFilePath, this.fsModule);
    return cached?.bills || null;
  }

  /**
   * Reads ALL cached bill list files for a bill type (across all pagination pages)
   * This is used for incremental updates to compare updateDates across all bills
   * @param billType - Bill type (e.g., "HR", "S")
   * @returns Array of all cached bills from all pages, or null if no cache exists
   */
  private readAllCachedBillLists(billType: string): BaseBillSummary[] | null {
    const cacheDir = path.join(this.apiConfig.cacheDir, 'bill', String(this.congressionalTerm));
    
    if (!this.fsModule.existsSync(cacheDir)) {
      return null;
    }

    const allBills: BaseBillSummary[] = [];
    const billTypePrefix = `${billType.toLowerCase()}_`;
    
    // Read all cached bill list files for this bill type
    const files = this.fsModule.readdirSync(cacheDir);
    for (const file of files) {
      if (file.startsWith(billTypePrefix) && file.endsWith('.json')) {
        const filePath = path.join(cacheDir, file);
        try {
          const content = this.fsModule.readFileSync(filePath, 'utf8');
          const cached = JSON.parse(content) as BillListResponse;
          if (cached?.bills && Array.isArray(cached.bills)) {
            allBills.push(...cached.bills);
          }
        } catch {
          // Skip invalid cache files
        }
      }
    }
    
    return allBills.length > 0 ? allBills : null;
  }

  /**
   * Fetches the list of all bills, handling pagination automatically
   * @param billType - Optional bill type to filter (e.g., "HR", "S")
   * @param params - Optional pagination parameters
   * @param forceRefresh - When true, bypass cache read but still write to cache (default: false)
   * @returns Promise resolving to array of BaseBillSummary
   */
  private async fetchAllBillsList(
    billType?: string,
    params?: {
      offset?: number;
      limit?: number;
      fromDateTime?: string;
      toDateTime?: string;
    },
    forceRefresh: boolean = false
  ): Promise<BaseBillSummary[]> {
    const {
      offset,
      limit,
      fromDateTime,
      toDateTime,
    } = params || {};

    // Temporarily set forceRefresh to bypass cache read but still write to cache
    const originalForceRefresh = this.apiConfig.forceRefresh;
    if (forceRefresh) {
      this.apiConfig.forceRefresh = true;
    }

    try {
      // Determine if we should fetch all pages (no offset/limit specified)
      const fetchAllPages = offset === undefined && limit === undefined;
      
      let allBills: BaseBillSummary[] = [];
      let currentOffset = offset || 0;
      const pageLimit = limit || 250; // Congress API default limit

      if (fetchAllPages) {
        // Fetch all pages
        let hasMore = true;
        while (hasMore) {
          const fetchParams = {
            offset: currentOffset,
            limit: pageLimit,
            fromDateTime,
            toDateTime,
          };

          const bills = billType
            ? await this.fetchBillsByType(this.congressionalTerm, billType, fetchParams)
            : await this.fetchBills(this.congressionalTerm, fetchParams);

          allBills = allBills.concat(bills);


          // Check if there are more pages
          // If we got fewer bills than the page limit, we've reached the end
          if (bills.length < pageLimit) {
            hasMore = false;
          } else {
            currentOffset += pageLimit;
          }
        }
      } else {
        // Fetch single page with specified pagination
        const fetchParams = {
          offset,
          limit,
          fromDateTime,
          toDateTime,
        };
        allBills = billType
          ? await this.fetchBillsByType(this.congressionalTerm, billType, fetchParams)
          : await this.fetchBills(this.congressionalTerm, fetchParams);
      }

      return allBills;
    } finally {
      // Restore original forceRefresh setting
      this.apiConfig.forceRefresh = originalForceRefresh;
    }
  }

  /**
   * Get all bills for the congressional term
   * @param billType - Optional bill type to filter bills (e.g., "HR", "S", "HJRES", "SJRES")
   * @param includeActions - 'all' to include all actions, 'votes' to include only actions with recorded votes, 'none' to return basic summaries (default: 'none')
   * @param includeVotes - When true, expand each bill with votes taken (default: false)
   * @param params - Optional parameters for pagination and filtering
   * @param params.offset - Pagination offset
   * @param params.limit - Pagination limit
   * @param params.fromDateTime - Filter bills from this date/time
   * @param params.toDateTime - Filter bills to this date/time
   * @returns Promise resolving to array of bill summaries or full bill details
   */
  async getBills(
    billType?: string,
    includeActions: 'all' | 'votes' | 'none' = 'none',
    includeVotes: boolean = false,
    params?: {
      offset?: number;
      limit?: number;
      fromDateTime?: string;
      toDateTime?: string;
    }
  ): Promise<(BaseBillSummary | BillWithActions)[]> {
    await this.ensureInitialized();

    try {
      const allBills = await this.fetchAllBillsList(billType, params);

      // If includeActions is not 'none', fetch full details for each bill
      if (includeActions !== 'none' || includeVotes) {
        const billsWithActions: BillWithActions[] = [];
        
        // Optimization: When only wanting bills with recorded votes,
        // fetch actions first to filter before fetching bill info + titles
        if (includeActions === 'votes') {
          
          for (const bill of allBills) {
            // Step 1: Fetch only actions for this bill
            const actionsResponse = await this.fetchBillActions(bill.type, bill.number);
            
            if (!actionsResponse?.actions) continue;
            
            // Step 2: Check if any actions have recorded votes
            const actionsWithVotes = actionsResponse.actions.filter(action => this.hasRecordedVotes(action));
            
            if (actionsWithVotes.length === 0) {
              // No recorded votes - skip this bill entirely (saves 2 API calls: bill info + titles)
              continue;
            }
            
            // Step 3: This bill has recorded votes - now fetch bill info and titles
            const [billResponse, titlesResponse] = await Promise.all([
              this.fetchBillInfo(bill.type, bill.number),
              this.fetchBillTitles(bill.type, bill.number),
            ]);
            
            if (!billResponse?.bill) continue;
            
            // Step 4: If includeVotes, fetch vote details for each recorded vote
            const actions = includeVotes 
              ? await this.populateRecordedVotes(actionsWithVotes, {
                  congress: this.congressionalTerm,
                  billType: bill.type,
                  billNumber: bill.number,
                })
              : actionsWithVotes;
            
            billsWithActions.push(this.buildBillWithActions(billResponse, actions, titlesResponse));
          }
        } else {
          // Standard fetch: get full bill details for all bills
          for (const bill of allBills) {
            const billWithActions = await this.getBill(bill.type, bill.number, includeActions, includeVotes);
            
            if (billWithActions) {
              billsWithActions.push(billWithActions);
            }
          }
        }
        
        return billsWithActions;
      }

      return allBills;
    } catch (error) {
      console.warn(
        `Error fetching bills${billType ? ` for type ${billType}` : ''}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Strings in latestAction.text that indicate a bill has no recorded votes yet
   * Bills with these exact strings will be filtered out before fetching actions
   */
  private static readonly FILTER_LATEST_ACTION_STRINGS = [
    'Received in the Senate and Read twice and referred to the Committee',
    'Referred to the House Committee',
    'Referred to the Subcommittee',
    'Referred to the Committee',
  ];

  /**
   * Get bills that have recorded votes, optimized to minimize API calls
   * Uses incremental updates to only process bills that have changed since last call
   * 
   * Optimization strategy:
   * 1. Read cached bill list to get previous updateDates
   * 2. Fetch fresh bill list (updates cache)
   * 3. Filter to bills with changed updateDate
   * 4. Pre-filter by latestAction.text to skip bills clearly without votes
   * 5. For remaining bills, fetch actions (1 call per bill)
   * 6. Only if actions have recorded votes, fetch bill info + titles (2 calls)
   * 
   * Note: When a bill has votes, ALL actions are returned (not just actions with votes),
   * but only actions with recorded votes will have vote details populated.
   *
   * **Source of truth for incrementals** is the **last Congress.gov bill list** cached under
   * `.cache/congress` (run-to-run), not committed `main` JSON. Optional `ensureOutputCoverage`
   * unions in any list bill whose output file is **missing** under `{outputDir}/bills/{term}/{type}/`
   * so a PR that never merged does not leave gaps on disk.
   *
   * @param billType - Bill type to filter (e.g., "HR", "S")
   * @param params - Optional pagination parameters
   * @param options - Optional `ensureOutputCoverage` to backfill missing JSON files on disk
   * @returns Promise resolving to array of bills with recorded votes (includes all actions)
   */
  async getBillsWithVotes(
    billType: string,
    params?: {
      offset?: number;
      limit?: number;
      fromDateTime?: string;
      toDateTime?: string;
    },
    options?: {
      /** When set, every bill on the fresh API list without a matching `.json` here is also processed */
      ensureOutputCoverage?: { outputDir: string; term: number };
    },
  ): Promise<BillWithActions[]> {
    await this.ensureInitialized();

    try {
      // Step 1: Read ALL cached bill list pages to get previous updateDates (API cache = prior run)
      const cachedBills = this.readAllCachedBillLists(billType);
      const previousUpdateDates = cachedBills ? this.getBillUpdateDates(cachedBills) : null;

      if (cachedBills) {
        console.log(`Reading cached bill list...`);
        console.log(`Found ${cachedBills.length} bills in previous cache (all pages)`);
      }

      // Step 2: Fetch fresh bills list from API (forceRefresh=true bypasses cache read but writes to cache)
      // This ensures subsequent calls will have the new updateDates to compare against
      console.log(`Fetching fresh bill list from API...`);
      const allBills = await this.fetchAllBillsList(billType, params, true);

      // Step 3: Filter to bills that have changed (incremental updates)
      let billsToProcess: BaseBillSummary[];
      if (previousUpdateDates) {
        billsToProcess = allBills.filter(bill => {
          const previousUpdateDate = previousUpdateDates.get(bill.number);
          // Process if: new bill OR updateDate changed
          return previousUpdateDate === undefined || previousUpdateDate !== bill.updateDate;
        });
        console.log(`Found ${allBills.length} bills, ${billsToProcess.length} updated since last check`);
      } else {
        billsToProcess = allBills;
        console.log(`Found ${allBills.length} bills (no previous cache)`);
      }

      const cov = options?.ensureOutputCoverage;
      if (cov) {
        const typeLower = billType.toLowerCase();
        const billRoot = path.join(cov.outputDir, "bills", String(cov.term), typeLower);
        const missingOnDisk = allBills.filter(
          (b) => !this.fsModule.existsSync(path.join(billRoot, `${b.number}.json`)),
        );
        if (missingOnDisk.length > 0) {
          const byNumber = new Map(billsToProcess.map((b) => [b.number, b]));
          for (const b of missingOnDisk) {
            byNumber.set(b.number, b);
          }
          billsToProcess = Array.from(byNumber.values());
          console.log(
            `ensureOutputCoverage: added ${missingOnDisk.length} bills missing under ${billRoot}`,
          );
        }
      }

      if (billsToProcess.length === 0) {
        console.log(`No bills to process`);
        return [];
      }

      console.log(`Processing ${billsToProcess.length} updated bills...`);

      // Step 4: Pre-filter by latestAction.text (saves API calls)
      const preFilteredBills = this.preFilterBillsByLatestAction(billsToProcess);

      // Step 5: For changed bills, fetch actions with forceRefresh to get latest data
      // We need to force-refresh because the individual bill cache may be stale even though
      // the bill list shows it has been updated
      const originalForceRefresh = this.apiConfig.forceRefresh;
      this.apiConfig.forceRefresh = true;
      
      const billsWithVotes: BillWithActions[] = [];

      try {
        for (const bill of preFilteredBills) {
          const actionsResponse = await this.fetchBillActions(bill.type, bill.number);
          if (!actionsResponse?.actions) continue;

          const allActions = actionsResponse.actions;
          const hasAnyVotes = allActions.some(action => this.hasRecordedVotes(action));
          if (!hasAnyVotes) continue;

          // Step 6: This bill has recorded votes - fetch bill info, titles, and populate vote details
          // All actions are returned, but only actions with recordedVotes get vote details populated
          const [billResponse, titlesResponse, populatedActions] = await Promise.all([
            this.fetchBillInfo(bill.type, bill.number),
            this.fetchBillTitles(bill.type, bill.number),
            this.populateRecordedVotes(allActions, {
              congress: this.congressionalTerm,
              billType: bill.type,
              billNumber: bill.number,
            }),
          ]);

          if (!billResponse?.bill) continue;

          billsWithVotes.push(this.buildBillWithActions(billResponse, populatedActions, titlesResponse));
        }
      } finally {
        // Restore original forceRefresh setting
        this.apiConfig.forceRefresh = originalForceRefresh;
      }

      return billsWithVotes;
    } catch (error) {
      console.warn(
        `Error fetching bills with votes for type ${billType}:`,
        error,
      );
      return [];
    }
  }

}
