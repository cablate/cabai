import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_TC, Space_Grotesk } from "next/font/google";
import { getAppBaseUrl } from "@/lib/app-url";
import { BRAND_NAME } from "@/lib/constants";
import { organizationSchema, websiteSchema, serializeJsonLd } from "@/lib/seo/json-ld";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = BRAND_NAME;
const siteDescription = PUBLIC_BRANDING.description;
const defaultOgImage = PUBLIC_BRANDING.socialImage;

function getPublicAssetOrigin() {
  const value = process.env.NEXT_PUBLIC_ASSET_HOST || process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

const publicAssetOrigin = getPublicAssetOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  applicationName: siteName,
  title: {
    default: `${siteName} — AI Agent 課程、Skills 與 Agent API`,
    template: `%s — ${siteName}`,
  },
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: PUBLIC_BRANDING.logo },
    ],
    shortcut: [PUBLIC_BRANDING.logo],
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    siteName,
    locale: "zh_TW",
    type: "website",
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: [defaultOgImage],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const orgSchema = organizationSchema({
    logo: PUBLIC_BRANDING.logo,
    description: siteDescription,
  });
  const siteSchema = websiteSchema({
    description: siteDescription,
    enableSearch: false,
  });

  return (
    <html
      lang="zh-TW"
      data-scroll-behavior="smooth"
      className={`${notoSansTc.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}
    >
      <head>
        {publicAssetOrigin ? (
          <link rel="preconnect" href={publicAssetOrigin} crossOrigin="anonymous" />
        ) : null}
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="dns-prefetch" href="https://portaly.ai" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteSchema) }}
        />
      </head>
      <body className="min-h-[100dvh] bg-canvas text-text-primary antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
