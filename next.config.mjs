/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Reads its lazy city files with Node fs. Keeping it external preserves the
  // package's real __dirname instead of moving it into a Next server chunk.
  serverExternalPackages: ["@countrystatecity/countries"],
  // Prisma Client is generated outside node_modules. Explicitly trace its
  // native query engine so Vercel copies it into every server function that
  // may access the database.
  outputFileTracingIncludes: {
    "/*": [
      "./src/generated/prisma/libquery_engine-*.node",
      // The location package lazy-loads JSON with fs, which static tracing
      // cannot discover. Only the two countries supported by the load form
      // are copied into deployed server functions.
      "./node_modules/@countrystatecity/countries/dist/data/United_States-US/**/*",
      "./node_modules/@countrystatecity/countries/dist/data/Canada-CA/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // The Acceptable Use, Billing & Refund, and Cookie policies were folded
  // into Terms of Service and Privacy Policy as sections (2026-08-31) --
  // these keep any old bookmarks or indexed links from 404ing.
  async redirects() {
    return [
      { source: "/acceptable-use", destination: "/terms#acceptable-use", permanent: true },
      { source: "/billing-policy", destination: "/terms#billing", permanent: true },
      { source: "/cookies", destination: "/privacy#cookies", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stop the browser sniffing a response into a different type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // script-src must be spelled out: without it, scripts fall back to
          // default-src, which blocks Next's inline bootstrap and the theme
          // script in app/layout.tsx -- the page renders but never hydrates.
          //
          // 'unsafe-inline' is therefore required today, so this CSP is not
          // an XSS backstop; the SVG hole it would have covered is closed at
          // the source instead (strict MIME allowlist + a sandboxed,
          // attachment-only document response). Moving to a nonce pipeline
          // would let 'unsafe-inline' go.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // Document bytes go straight to a short-lived Supabase signed
              // upload URL; auth and all application APIs remain same-origin.
              "connect-src 'self' https://*.supabase.co https://auth.onroadbooks.com https://accounts.google.com/gsi/",
              "frame-src https://accounts.google.com/gsi/",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Listed after the site-wide rule so it wins for this path: stored
        // documents are served fully sandboxed, with no origin of their own,
        // so even a mislabelled file cannot reach the app.
        source: "/api/documents/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
