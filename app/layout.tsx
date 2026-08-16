import type { Metadata } from "next";
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

export const metadata: Metadata = (() => {
  const image = "https://prashilthegreat.github.io/penny-expense-tracker/og.png";
  const title = "Penny — Expense Tracker";
  const description = "Track everyday spending, understand your habits, and export clear expense reports.";
  return { title, description, manifest: "/penny-expense-tracker/manifest.webmanifest", icons: { icon: "/penny-expense-tracker/favicon.svg", shortcut: "/penny-expense-tracker/favicon.svg" }, openGraph: { title, description, images: [{ url: image, width: 1731, height: 909, alt: "Penny — Your money, made clear." }] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
})();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
