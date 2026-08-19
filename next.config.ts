import type { NextConfig } from "next";

/**
 * Static export, served from GitHub Pages. Everything the game needs runs in
 * the browser: iTunes and both preview CDNs allow cross origin reads, Deezer is
 * read as JSONP, and Spotify allows the page origin.
 */
const repo = "snippet-song-game";
const isPages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  output: "export",
  images: { unoptimized: true },
  basePath: isPages ? `/${repo}` : undefined,
  assetPrefix: isPages ? `/${repo}/` : undefined,
  trailingSlash: true,
};

export default nextConfig;
