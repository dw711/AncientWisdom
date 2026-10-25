import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const serif = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "以古为鉴 / Mirror of the Past",
  description: "Think through a present decision with sourced historical decision cases: what they share with yours, where they differ, and what would change the advice.",
};

export const viewport: Viewport = {
  themeColor: "#f2ede4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
