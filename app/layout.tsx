import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App Fleet",
  description: "Every app and site in the portfolio: release state, uptime, TestFlight expiry and what each one needs next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a className="skip-link" href="#content">Skip to content</a>
        <main id="content" tabIndex={-1} className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
