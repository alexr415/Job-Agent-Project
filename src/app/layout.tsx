import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "SWE Job Market Agent",
  description: "Entry-level SWE postings, in-demand skills, and resume gap analysis.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-5 px-4 py-3 text-sm sm:px-6">
            <Link href="/" className="font-semibold">
              SWE Job Market Agent
            </Link>
            <Link href="/" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
              Dashboard
            </Link>
            <Link href="/jobs" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
              Open roles
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
