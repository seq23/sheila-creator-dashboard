export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function fmtTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
}

export function fmtDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 2) return "yesterday";
  return `${Math.floor(s / 86400)} days ago`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
