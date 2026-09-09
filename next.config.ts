import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit (F23 PDF export) reads its built-in font .afm files from disk at
  // runtime — the file tracer doesn't always catch that dynamic require, so
  // the serverless bundle for this one route needs it spelled out.
  outputFileTracingIncludes: {
    "/api/tiktok/export/pdf": ["./node_modules/pdfkit/js/data/**"],
  },
  // /dashboard and /portfolio moved under /facebook/* (to sit alongside
  // /tiktok/* now that the app has two platforms) — old bookmarked/shared
  // links keep working instead of 404ing.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/facebook/dashboard", permanent: true },
      { source: "/portfolio", destination: "/facebook/portfolio", permanent: true },
    ];
  },
};

export default nextConfig;
