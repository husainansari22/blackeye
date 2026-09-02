import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${PLATFORM_NAME} — ${PLATFORM_TAGLINE}`,
  description:
    "Nigeria's all-in-one escrow app. Pay safe for WhatsApp & IG goods, services, rent, cars, events, import, and B2B deals.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: PLATFORM_NAME,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#060608",
};

/* Critical CSS — ensures dark app shell loads even if external stylesheet is delayed */
const criticalCss = `
  html, body {
    margin: 0;
    padding: 0;
    background: #060608 !important;
    color: #f4f4f5 !important;
    font-family: system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .app-viewport { min-height: 100dvh; background: #060608; }
  .app-frame { width: 100%; max-width: 430px; margin: 0 auto; min-height: 100dvh; background: #060608; }
  .glass {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
  }
  .btn-primary {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 16px; border-radius: 16px; border: none;
    font-weight: 600; font-size: 15px; color: #060608;
    background: linear-gradient(135deg, #00e5b5, #3b9eff);
  }
  .text-gradient {
    background: linear-gradient(135deg, #00e5b5, #3b9eff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
      </head>
      <body className="min-h-full bg-[#060608] text-[#f4f4f5]">{children}</body>
    </html>
  );
}
