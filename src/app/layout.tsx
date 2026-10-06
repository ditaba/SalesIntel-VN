import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SalesIntel Vietnam", template: "%s · SalesIntel Vietnam" },
  description: "B2B sales intelligence for the Vietnamese market: who to contact, why, and why now.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
