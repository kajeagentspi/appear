import type { Appearance } from "@/contracts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function buildGoogleCalendarUrl(event: Appearance): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("ctz", "Asia/Tokyo");
  url.searchParams.set(
    "details",
    [
      event.type,
      event.status === "cancelled" ? "Cancelled" : null,
      event.verificationStatus === "unverified"
        ? "Unverified agent-discovered information; confirm details with the source."
        : "Verified appearance",
      `Source: ${event.sourceUrl}`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  const location = [event.venue, event.location].filter(Boolean).join(", ");
  if (location) url.searchParams.set("location", location);

  if (event.start && DATE_ONLY.test(event.start)) {
    const next = new Date(`${event.start}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    url.searchParams.set(
      "dates",
      `${event.start.replaceAll("-", "")}/${next.toISOString().slice(0, 10).replaceAll("-", "")}`
    );
  } else if (event.start) {
    const start = new Date(event.start);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const dates = [start, end]
        .map((date) => date.toISOString().replace(/[-:]/g, "").replace(".000", ""))
        .join("/");
      url.searchParams.set("dates", dates);
    }
  }

  return url.toString();
}
