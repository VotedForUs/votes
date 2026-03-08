/**
 * Congress.gov Action Codes
 * @see https://www.congress.gov/help/field-values/action-codes
 */

export interface ActionCode {
  code: string;
  action: string;
  chamberVote: boolean;
}

export const ACTION_CODES: ActionCode[] = [
  // Chamber vote action codes (full chamber votes)
  { code: "8000", action: "Passed/agreed to in House", chamberVote: true },
  { code: "9000", action: "Passed/agreed to in Senate", chamberVote: true },
  { code: "17000", action: "Failed of passage/not agreed to in House", chamberVote: true },
  { code: "18000", action: "Failed of passage/not agreed to in Senate", chamberVote: true },
  { code: "21000", action: "House agreed to Senate amendment", chamberVote: true },
  { code: "22000", action: "House disagreed to Senate amendment", chamberVote: true },
  { code: "23000", action: "Senate agreed to House amendment", chamberVote: true },
  { code: "24000", action: "Senate disagreed to House amendment", chamberVote: true },
  { code: "25000", action: "House agreed to conference report", chamberVote: true },
  { code: "26000", action: "Senate agreed to conference report", chamberVote: true },
  { code: "32000", action: "Motion to recommit agreed to in House", chamberVote: true },
  { code: "33000", action: "Motion to recommit rejected in House", chamberVote: true },
  { code: "34000", action: "Motion to table agreed to in House", chamberVote: true },
  { code: "35000", action: "Motion to table agreed to in Senate", chamberVote: true },
  { code: "37300", action: "On passage Passed/agreed to in House", chamberVote: true },
  { code: "75000", action: "Cloture motion agreed to in Senate", chamberVote: true },
  { code: "97000", action: "Override of presidential veto attempted", chamberVote: true },

  // Other action codes (not full-chamber votes)
  { code: "1000", action: "Introduced in House", chamberVote: false },
  { code: "2000", action: "Introduced in Senate", chamberVote: false },
  { code: "3000", action: "Referred to House committee", chamberVote: false },
  { code: "4000", action: "Referred to Senate committee", chamberVote: false },
  { code: "5000", action: "Reported by House committee", chamberVote: false },
  { code: "6000", action: "Reported by Senate committee", chamberVote: false },
  { code: "7000", action: "Placed on House calendar", chamberVote: false },
  { code: "10000", action: "Placed on Senate calendar", chamberVote: false },
  { code: "11000", action: "Committee markup in House", chamberVote: false },
  { code: "12000", action: "Committee markup in Senate", chamberVote: false },
  { code: "13000", action: "Subcommittee hearings held", chamberVote: false },
  { code: "14000", action: "Committee hearings held", chamberVote: false },
  { code: "15000", action: "Committee consideration", chamberVote: false },
  { code: "16000", action: "Subcommittee consideration", chamberVote: false },
  { code: "19000", action: "Resolving differences", chamberVote: false },
  { code: "20000", action: "Conference committee formed", chamberVote: false },
  { code: "27000", action: "Conference report filed", chamberVote: false },
  { code: "28000", action: "Presented to President", chamberVote: false },
  { code: "29000", action: "Signed by President", chamberVote: false },
  { code: "30000", action: "Vetoed by President", chamberVote: false },
  { code: "31000", action: "Pocket vetoed by President", chamberVote: false },
  { code: "36000", action: "Motion to discharge committee", chamberVote: false },
  { code: "37000", action: "Motion to proceed agreed to", chamberVote: false },
  { code: "38000", action: "Motion to proceed rejected", chamberVote: false },
  { code: "40000", action: "Amendment offered", chamberVote: false },
  { code: "41000", action: "Amendment agreed to", chamberVote: false },
  { code: "42000", action: "Amendment rejected", chamberVote: false },
  { code: "43000", action: "Amendment withdrawn", chamberVote: false },
  { code: "50000", action: "Rule granted by House Rules Committee", chamberVote: false },
  { code: "60000", action: "Unanimous consent request", chamberVote: false },
  { code: "70000", action: "Cloture motion filed", chamberVote: false },
  { code: "76000", action: "Cloture motion rejected", chamberVote: false },
  { code: "80000", action: "Became Public Law", chamberVote: false },
  { code: "90000", action: "Withdrawn from calendar", chamberVote: false },
  { code: "95000", action: "Motion to suspend rules", chamberVote: false },
  { code: "98000", action: "Override attempt failed", chamberVote: false },
  { code: "99000", action: "Override attempt succeeded", chamberVote: false }
];
