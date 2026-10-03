// G9 Centres: reads a centre's GPS point from what the Guru pastes: "17.3850, 78.4867" as Google
// Maps shows it when a place is long-pressed, or a full Google Maps link (…/place/…/@17.38,78.48,17z,
// …!3d17.385!4d78.4867, ?q=17.38,78.48, ?query=…, ?ll=…). A short share link (maps.app.goo.gl)
// hides the point until it is opened, and the app does not follow links for that, so it is
// reported as such: open it, then copy the long link or the numbers.

/** A point in degrees. */
export type Point = { lat: number; lng: number };

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^\s*(${NUMBER})\s*[,\s]\s*(${NUMBER})\s*$`);

function point(lat: string, lng: string): Point | null {
  const p = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || (p.lat === 0 && p.lng === 0)) return null;
  return p;
}

/**
 * The point in `text`, 'short_link' for a link that does not show it, or null when there is none.
 * In a place link the marker (!3d…!4d…) wins over the map's centre (@…).
 */
export function readPoint(text: string): Point | 'short_link' | null {
  const value = text.trim();
  if (!value) return null;
  const pair = PAIR.exec(value);
  if (pair) return point(pair[1], pair[2]);

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A link with a stray % stays as it is.
  }
  const marker = new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`).exec(decoded);
  if (marker) return point(marker[1], marker[2]);
  const param = new RegExp(String.raw`[?&](?:q|query|ll|center|destination)=(${NUMBER}),\s*(${NUMBER})`).exec(decoded);
  if (param) return point(param[1], param[2]);
  const at = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`).exec(decoded);
  if (at) return point(at[1], at[2]);
  if (/^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(value)) return 'short_link';
  return null;
}

/** A Google Maps address that shows the point, to check it on a map. */
export function mapUrl(p: Point): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}
