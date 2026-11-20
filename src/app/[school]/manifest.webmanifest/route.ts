import { connection } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_PRIMARY_COLOR, effectivePrimaryColor } from "@/lib/branding";

/** Per-school web manifest: GET /<slug>/manifest.webmanifest
 *
 *  Installing the portal from a school's path (e.g. /greenfield)
 *  installs that school's app: its name, its logo as the home-screen
 *  icon, and its primary colour as theme/background. The platform
 *  manifest (/manifest.webmanifest) stays for the login and Mother
 *  Board pages. The school pages point at this route via the
 *  SchoolBranding component, which swaps the manifest link.
 *
 *  Branding comes from the public school_by_slug RPC (migration 0004,
 *  colours added in 0010), so it works before anyone signs in. When
 *  the slug is unknown, or Supabase is not configured, the platform
 *  manifest is served instead of a 404, so install never breaks.
 *  Short cache (60s) so a logo or colour change reaches installers
 *  quickly.
 */

const PLATFORM_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

function platformManifest() {
  return {
    name: "Digital SchoolVerse",
    short_name: "SchoolVerse",
    description:
      "One online platform for primary and secondary schools, parents, teachers and students.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: DEFAULT_PRIMARY_COLOR,
    theme_color: DEFAULT_PRIMARY_COLOR,
    icons: PLATFORM_ICONS,
  };
}

function iconType(url: string): string {
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ school: string }> },
) {
  // Branding is per request (a logo or colour change must show up
  // without a redeploy), so this route never prerenders.
  await connection();
  const { school: slug } = await params;
  let manifest: Record<string, unknown> = platformManifest();

  if (isSupabaseConfigured && slug) {
    const { data } = await supabase.rpc("school_by_slug", { p_slug: slug });
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      const school = row as {
        name: string;
        logo_url: string | null;
        primary_color?: string | null;
        logo_color?: string | null;
      };
      const color = effectivePrimaryColor(school);
      const icons = school.logo_url
        ? [
            { src: school.logo_url, sizes: "192x192", type: iconType(school.logo_url), purpose: "any" },
            { src: school.logo_url, sizes: "512x512", type: iconType(school.logo_url), purpose: "any" },
          ]
        : PLATFORM_ICONS;
      manifest = {
        name: `${school.name} - Digital SchoolVerse`,
        short_name: school.name.slice(0, 12),
        description: `${school.name} on Digital SchoolVerse - school portal for parents, teachers and students.`,
        start_url: `/${slug}`,
        scope: `/${slug}/`,
        display: "standalone",
        orientation: "portrait",
        background_color: color,
        theme_color: color,
        icons,
      };
    }
  }

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
