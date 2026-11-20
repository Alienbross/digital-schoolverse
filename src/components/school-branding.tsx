"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { firstSegment, fetchSchoolBySlug } from "@/lib/slug";
import {
  BRANDING_CHANGED_EVENT,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_PRIMARY_DARK,
  darkenHex,
  effectivePrimaryColor,
} from "@/lib/branding";

/** Logo-driven school branding, applied live in the browser.
 *
 *  On a school path (/<slug>/…) this component:
 *    - reads the school's branding (public RPC, works signed out) and
 *      sets --brand / --brand-dark on <html>, so every bg-royal,
 *      text-royal and hover:bg-royal-dark in the portal takes the
 *      school's primary colour (buttons, links, active menu highlight,
 *      focus rings). Sky #38BDF8 stays the accent.
 *    - swaps the tab favicon and the iOS home-screen icon to the
 *      school's logo, and the theme-color meta to the school colour.
 *    - swaps the manifest link to /<slug>/manifest.webmanifest, so
 *      installing from that school's portal installs with the school's
 *      logo and colours.
 *  On platform pages (Mother Board, login without a school, plain
 *  routes) and for schools with no logo/colour, everything is reset
 *  to the Digital SchoolVerse defaults - the Mother Board never takes
 *  a school's colour.
 *
 *  It re-reads branding when the path changes and when a logo upload
 *  or colour save fires the dsv-branding-changed event, so a change in
 *  School Setup recolours the portal without a reload.
 */

// Platform defaults, captured once from the links Next renders from
// the root layout metadata - never re-captured after a school swap,
// or a reset would restore the school's own logo as the "default".
let savedDefaults: { icon: string; appleIcon: string; manifest: string } | null = null;

function platformDefaults(): { icon: string; appleIcon: string; manifest: string } {
  if (!savedDefaults) {
    savedDefaults = {
      icon:
        document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ??
        "/favicon.ico",
      appleIcon:
        document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ??
        "/icons/apple-touch-icon.png",
      manifest:
        document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ??
        "/manifest.webmanifest",
    };
  }
  return savedDefaults;
}

function setLink(rel: string, href: string): void {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

function setThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

export default function SchoolBranding() {
  const pathname = usePathname();
  const slug = firstSegment(pathname);
  const isMotherBoard = pathname.startsWith("/mother-board");

  useEffect(() => {
    const root = document.documentElement;
    const defaults = platformDefaults();

    const applyDefaults = () => {
      root.style.removeProperty("--brand");
      root.style.removeProperty("--brand-dark");
      setLink("icon", defaults.icon);
      setLink("apple-touch-icon", defaults.appleIcon);
      setLink("manifest", defaults.manifest);
      setThemeColor(DEFAULT_PRIMARY_COLOR);
    };

    const applySchool = async () => {
      if (!slug || isMotherBoard) {
        applyDefaults();
        return;
      }
      const school = await fetchSchoolBySlug(slug);
      if (!school) {
        applyDefaults();
        return;
      }
      const color = effectivePrimaryColor(school);
      root.style.setProperty("--brand", color);
      root.style.setProperty(
        "--brand-dark",
        color === DEFAULT_PRIMARY_COLOR ? DEFAULT_PRIMARY_DARK : darkenHex(color),
      );
      setThemeColor(color);
      if (school.logo_url) {
        setLink("icon", school.logo_url);
        setLink("apple-touch-icon", school.logo_url);
      } else {
        setLink("icon", defaults.icon);
        setLink("apple-touch-icon", defaults.appleIcon);
      }
      // Per-school manifest even without a logo: it carries the
      // school's theme colour (and the platform icons as fallback).
      setLink("manifest", `/${slug}/manifest.webmanifest`);
    };

    void applySchool();
    const onChanged = () => void applySchool();
    window.addEventListener(BRANDING_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(BRANDING_CHANGED_EVENT, onChanged);
    };
  }, [slug, isMotherBoard]);

  return null;
}
