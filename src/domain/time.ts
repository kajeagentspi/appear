export function formatRelativeTime(
  date: Date | string,
  relativeTo: Date = new Date()
): string {
  const target = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(target.getTime()) || Number.isNaN(relativeTo.getTime())) return "";

  const elapsedMs = Math.max(0, relativeTo.getTime() - target.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return target.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
