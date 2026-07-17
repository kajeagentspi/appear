export function createId(event: {
  title: string;
  start: string | null;
  venue: string | null;
}): string {
  const date = event.start?.slice(0, 10) ?? "";
  const input = `${event.title}\x00${date}\x00${event.venue ?? ""}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
