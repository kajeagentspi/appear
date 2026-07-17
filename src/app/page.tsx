import { ScheduleApp } from "@/components/ScheduleApp";
import { getDefaultStoredSchedule } from "@/server/database";

export const runtime = "nodejs";

export default function Home() {
  const initialSchedule = getDefaultStoredSchedule();
  return <ScheduleApp initialPersonId={initialSchedule?.displayName ?? null} />;
}
