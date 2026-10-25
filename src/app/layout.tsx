import type { Metadata } from "next";
import { Geist, Literata } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The document face: everything that reads like a paper page, including
// the whole landing, is set in Literata. Dense app surfaces keep the sans.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Needed so og/twitter meta emit absolute URLs for crawlers.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Sever: one profile, a CV for every job",
    template: "%s · Sever",
  },
  description:
    "Paste a job description and Sever builds a one-page, ATS-readable CV from what you've actually recorded. Nothing invented; every edit reversible.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The landing's pre-paint inline script adds a `js` class to <html>
      // before hydration; React must not fight it.
      suppressHydrationWarning
      className={`${geistSans.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
