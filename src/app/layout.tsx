import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AppShell from "@/components/app-shell";
import SchoolBranding from "@/components/school-branding";
import { ThemeScript } from "@/components/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Digital SchoolVerse - School Portal",
  description:
    "One online platform for primary and secondary schools, parents, teachers and students.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SchoolVerse",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#1D4ED8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full bg-mist text-ink">
        {/* Per-school branding (migration 0010): on a /<slug> path the
            portal takes that school's logo colour, favicon and
            manifest; platform pages keep Royal Blue. Suspense because
            it reads the path, which is only known at runtime. */}
        <Suspense fallback={null}>
          <SchoolBranding />
        </Suspense>
        <AuthProvider>
          <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-12"><p className="text-sm text-slate-500">Loading…</p></main>}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
