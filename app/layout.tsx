import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/nav/TopNav";

export const metadata: Metadata = {
  title: "Agency OS — Leads Workflow Automation",
  description:
    "A self-running lead force for Indian local business: schools, restaurants, cafés, gyms and salons. One active category at a time, WhatsApp-first outreach, complete exportable lead data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-black text-white">
        <TopNav />
        {children}
      </body>
    </html>
  );
}