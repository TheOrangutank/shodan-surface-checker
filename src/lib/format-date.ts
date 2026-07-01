export function formatLastQueried(iso: string | null) {
  if (!iso) return "Never queried";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never queried";

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const day = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  return `Last queried at ${time} on ${day}`;
}
