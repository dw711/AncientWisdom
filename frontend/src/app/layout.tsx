import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Historical Figure · 以古为鉴",
  description: "Think through a present decision with sourced historical decision cases: what they share with yours, where they differ, and what would change the advice.",
};

export const viewport: Viewport = {
  themeColor: "#ebebeb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
