import type { Metadata, Viewport } from "next";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Air Equivalent — Current PM2.5, in human terms",
  description:
    "Explore current North American PM2.5 monitor readings and a carefully framed cigarette-equivalent air-pollution analogy.",
  applicationName: "Air Equivalent",
  keywords: ["AQI", "PM2.5", "air quality", "AirNow", "smoke"],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eee9da",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
