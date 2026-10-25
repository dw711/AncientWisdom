import type { Metadata, Viewport } from "next";
import { Fragment_Mono, Playfair_Display, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/* Headlines use Editorial New when it is installed locally (it is a licensed
   font, not on Google Fonts) and fall back to Playfair Display. */
const display = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "700", "900"],
});

const body = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const mono = Fragment_Mono({
  variable: "--font-fragment",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "The Precedent · 以古为鉴",
  description: "Think through a present decision with sourced historical decision cases: what they share with yours, where they differ, and what would change the advice.",
};

export const viewport: Viewport = {
  themeColor: "#edeae2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="grain min-h-full flex flex-col">{children}</body>
    </html>
  );
}
