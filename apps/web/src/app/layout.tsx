import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Milaserv CRM360",
  description: "Telesales Leads Distributor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
