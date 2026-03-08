/**
 * Senate roll call vote member from XML
 * Structure from senate.gov roll call vote XML files
 */
export type SenateRollCallVoteMember = {
    member_full: string;
    last_name: string;
    first_name: string;
    party: string;
    state: string;
    vote_cast: string;
    lis_member_id: string;
  }
  
  /**
   * Count of votes by type
   * Structure from senate.gov roll call vote XML files
   */
  export interface SenateRollCallVoteCount {
    yeas?: string | number;
    nays?: string | number;
    present?: string | number;
    absent?: string | number;
  }
  
  /**
   * Senate roll call vote XML structure
   * Structure from senate.gov roll call vote XML files
   * Based on actual XML structure from https://www.senate.gov/legislative/LIS/roll_call_votes/
   * Parsed with fast-xml-parser which accurately represents the XML structure
   */
  export interface SenateRollCallVoteXml {
    roll_call_vote: {
      congress: string;
      session: string;
      congress_year: string;
      vote_number: string;
      vote_date: string;
      modify_date?: string;
      vote_question_text: string;
      vote_document_text?: string;
      vote_result_text: string;
      question?: string;
      vote_title?: string;
      majority_requirement?: string;
      vote_result: string;
      document?: {
        document_congress?: string;
        document_type?: string;
        document_number?: string;
        document_name?: string;
        document_title?: string;
      };
      amendment?: {
        amendment_number?: string;
        amendment_to_document_number?: string;
        amendment_to_amendment_number?: string;
      };
      count: SenateRollCallVoteCount;
      tie_breaker?: {
        by_whom?: string;
        vote_cast?: string;
      };
      members: {
        member: SenateRollCallVoteMember[];
      };
    };
  }