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
};

export type RefreshState = "idle" | "checking" | "failed";

export type RefreshResult = {
  events: Appearance[];
  changed: boolean;
  message: string;
};

export interface ScheduleAdapter {
  load(personId: string): Promise<Appearance[]>;
  refresh(personId: string): Promise<RefreshResult>;
}
