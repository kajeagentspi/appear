import type { Appearance } from "@/contracts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toJstStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}


function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function generateIcs(event: Appearance): string {
  const description = [
    event.type,
    event.status === "cancelled" ? "Cancelled" : "Officially announced appearance",
    `Source: ${event.sourceUrl}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const location = [event.venue, event.location].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//APPEAR//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Asia/Tokyo",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "X-LIC-LOCATION:Asia/Tokyo",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.id)}@appear`,
    "DTSTAMP:19700101T000000Z",
    `SUMMARY:${escapeText(event.title)}`,
    `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
  ];

  if (event.start && DATE_ONLY.test(event.start)) {
    lines.push(`DTSTART;VALUE=DATE:${event.start.replaceAll("-", "")}`);
    lines.push(`DTEND;VALUE=DATE:${nextDate(event.start).replaceAll("-", "")}`);
  } else if (event.start) {
    const start = new Date(event.start);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    lines.push(`DTSTART;TZID=Asia/Tokyo:${toJstStamp(start)}`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${toJstStamp(end)}`);
  }

  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(`URL:${event.sourceUrl}`);
  lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
