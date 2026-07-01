import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attack Surface Checker",
  description: "Check your personal attack surface using Shodan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <div className="scanline-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
