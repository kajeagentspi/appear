export type VerificationStatus = "verified" | "unverified";

export type Appearance = {
  id: string;
  title: string;
  type: string | null;
  start: string | null;
  doors: string | null;
  venue: string | null;
  location: string | null;
  status: "scheduled" | "cancelled";
  sourceUrl: string;
  verificationStatus: VerificationStatus;
};

export type RefreshState = "idle" | "checking" | "failed";

export type RefreshResult = {
  events: Appearance[];
  changed: boolean;
  message: string;
};

export type InitializeResult = {
  personId: string;
  displayName: string;
  events: Appearance[];
  sourceUrls: string[];
  verificationStatus: VerificationStatus;
};

export type SearchCandidate = {
  url: string;
  title: string;
  description: string;
};

export type SourceDocument = {
  url: string;
  text: string;
};

export interface ScheduleAdapter {
  load(personId: string): Promise<Appearance[]>;
  refresh(personId: string): Promise<RefreshResult>;
  initialize(personName: string): Promise<Appearance[]>;
}
