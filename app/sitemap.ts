import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { SYMBOLS } from "@/lib/symbols";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const stockPages = SYMBOLS.map((s) => ({
    url: `${SITE_URL}/stock/${s.ticker}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/guide`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...stockPages,
  ];
}
