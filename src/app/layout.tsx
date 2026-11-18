import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Digital SchoolVerse — School Portal",
  description:
    "One online platform for primary and secondary schools, parents, teachers and students.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/setup", label: "School Setup" },
  { href: "/classes", label: "Classes & Arms" },
  { href: "/subjects", label: "Subjects" },
  { href: "/students", label: "Students" },
  { href: "/teachers", label: "Teachers & Staff" },
  { href: "/parents", label: "Parents" },
  { href: "/plan", label: "Plan & Roadmap" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-mist text-ink">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 flex-col bg-royal-deep p-5 text-white md:flex">
            <div className="mb-8">
              <p className="text-xl font-bold leading-tight">
                Digital SchoolVerse
              </p>
              <p className="mt-1 text-xs text-skybrand">
                Primary &amp; Secondary School Portal
              </p>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <p className="mt-auto pt-8 text-xs text-white/50">
              Free pilot build — Supabase + Vercel.
              <br />
              Basics first, Advanced behind the paywall.
            </p>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-line bg-white px-4 py-3 md:hidden">
              <p className="font-bold text-royal">Digital SchoolVerse</p>
              <nav className="mt-2 flex gap-3 overflow-x-auto text-sm">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="whitespace-nowrap font-medium text-slate-600 hover:text-royal"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
