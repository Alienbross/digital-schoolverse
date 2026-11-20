/** Logo-driven school branding: the portal primary colour comes from
 *  a school's logo (read automatically at upload time), with a manual
 *  override in School Setup. Schools with no logo - and the Mother
 *  Board and platform pages - keep Royal Blue #1D4ED8. Sky #38BDF8
 *  stays the accent for every school.
 *
 *  Effective colour for a school:
 *    primary_color (manual pick, or the last logo colour) ->
 *    logo_color (last colour read from the logo) ->
 *    DEFAULT_PRIMARY_COLOR.
 */

export const DEFAULT_PRIMARY_COLOR = "#1D4ED8";
export const DEFAULT_PRIMARY_DARK = "#1E40AF";
export const ACCENT_COLOR = "#38BDF8";

export type PrimaryColorSource = "logo" | "manual" | null;

export type SchoolColourFields = {
  primary_color?: string | null;
  logo_color?: string | null;
  primary_color_source?: PrimaryColorSource;
};

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#[0-9a-fA-F]{3}$/;

/** "#1d4ed8", "#1D4ED8" and "#15d" all become "#1D4ED8". Anything else
 *  (including null, white-only input is valid hex but rejected later
 *  by the extractor, not here) returns null. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (HEX6_RE.test(v)) return v.toUpperCase();
  if (HEX3_RE.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  }
  return null;
}

export function isValidHexColor(value: string): boolean {
  return normalizeHexColor(value) !== null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeHexColor(hex) ?? DEFAULT_PRIMARY_COLOR;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Relative luminance (0-1) per WCAG, for the white-text check. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** A darker shade of a colour, for hover states (e.g. hover:bg-royal-dark).
 *  `factor` 0.82 darkens by about the same step as Royal #1D4ED8 to
 *  Royal Dark #1E40AF. */
export function darkenHex(hex: string, factor = 0.82): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

/** The portal primary colour for a school, always a usable hex. */
export function effectivePrimaryColor(
  school: SchoolColourFields | null | undefined,
): string {
  if (!school) return DEFAULT_PRIMARY_COLOR;
  return (
    normalizeHexColor(school.primary_color) ??
    normalizeHexColor(school.logo_color) ??
    DEFAULT_PRIMARY_COLOR
  );
}

/** Human-readable source of the school's current portal colour. */
export function primaryColorLabel(
  school: SchoolColourFields | null | undefined,
): string {
  if (!school) return "Default Royal Blue";
  if (normalizeHexColor(school.primary_color)) {
    return school.primary_color_source === "manual"
      ? "Your chosen colour"
      : "From your logo";
  }
  if (normalizeHexColor(school.logo_color)) return "From your logo";
  return "Default Royal Blue";
}

// ---------------------------------------------------------------- extraction
// Client-side colour extraction from a logo image (canvas sampling).
// Robustness rules, in order:
//   - Transparent pixels (alpha < 140) are ignored, so a transparent
//     logo never yields "transparent" as a colour.
//   - Near-white pixels (all channels > 238) are ignored, so a logo
//     that is dark text on a white background never yields white.
//   - Saturated colours win over greys: pixels with saturation >= 40
//     are considered first, so a black wordmark with one red emblem
//     yields the red, not the black. Only when a logo has no saturated
//     pixel at all (a pure grey/black/white mark) does the most common
//     non-white colour win.
//   - Colours are bucketed (16 steps per channel) and the most common
//     bucket wins, so a busy multi-colour logo yields its strongest
//     colour rather than an average muddle.
//   - A colour too light for white button text is darkened until its
//     luminance is at most 0.55, so a pale-yellow logo still gives
//     readable buttons instead of falling back.
//   - Any failure (unreadable file, tainted canvas because the logo
//     host blocks cross-origin reads, no usable pixel at all) returns
//     null and the caller falls back to Royal Blue.

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the image."));
    img.src = src;
  });
}

function extractFromImage(img: HTMLImageElement): string | null {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    // Tainted canvas (logo host refused cross-origin reads).
    return null;
  }

  type Bucket = { count: number; r: number; g: number; b: number };
  const buckets = new Map<string, Bucket>();
  const saturated = new Map<string, Bucket>();
  const add = (
    map: Map<string, Bucket>,
    r: number,
    g: number,
    b: number,
  ) => {
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const cur = map.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    cur.count += 1;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    map.set(key, cur);
  };

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 140) continue; // transparent
    if (r > 238 && g > 238 && b > 238) continue; // near-white background
    add(buckets, r, g, b);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn >= 40) add(saturated, r, g, b);
  }

  // Saturated colours first; fall back to any non-white colour.
  const pool = saturated.size > 0 ? saturated : buckets;
  if (pool.size === 0) return null;
  let best: Bucket | null = null;
  for (const bucket of pool.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  let hex = rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);

  // Too light for white text on a button: darken until readable.
  let guard = 0;
  while (luminance(hex) > 0.55 && guard < 12) {
    hex = darkenHex(hex, 0.85);
    guard += 1;
  }
  // A near-white average slipping through is not a brand colour.
  if (luminance(hex) > 0.85) return null;
  return hex;
}

/** Read the dominant colour from an uploaded logo file. Returns null
 *  when no sensible colour can be read - the caller keeps Royal Blue
 *  and says so. Runs in the browser only. */
export async function extractPrimaryColorFromFile(
  file: File,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url, false);
    return extractFromImage(img);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read the dominant colour from a logo already stored at a URL
 *  (used by "Use logo colour" for logos uploaded before migration
 *  0010, which have no logo_color saved yet). Returns null on any
 *  failure, including a tainted canvas. Runs in the browser only. */
export async function extractPrimaryColorFromUrl(
  url: string,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = await loadImage(url, true);
    return extractFromImage(img);
  } catch {
    return null;
  }
}

/** Event fired on window after a logo or portal colour changes, so
 *  the shell re-reads the school's branding without a page reload. */
export const BRANDING_CHANGED_EVENT = "dsv-branding-changed";

export function notifyBrandingChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BRANDING_CHANGED_EVENT));
}
