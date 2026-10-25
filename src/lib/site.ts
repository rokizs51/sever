// Canonical absolute origin, used wherever the crawler-facing routes need to
// emit absolute URLs (sitemap, robots, metadataBase). Must be set in prod.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
