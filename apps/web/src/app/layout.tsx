import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BATIA OS",
  description: "AI Live Operating System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body className="bg-gray-950 text-white">{children}</body>
    </html>
  );
}
