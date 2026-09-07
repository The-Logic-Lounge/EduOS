import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const body = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Edu OS — Free IT Training Institute Operating System", template: "%s | Edu OS" },
  description:
    "Edu OS runs free IT training institutes end-to-end: admissions, attendance, assessments, skill passports, AI copilots, and career pathways.",
  keywords: ["free IT training", "education management system", " LMS", "AI copilot", "skill passport", "Pakistan"],
  openGraph: {
    type: "website",
    title: "Edu OS — Free IT Training Institute Operating System",
    description: "Admissions to employability, powered by one intelligence layer.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
