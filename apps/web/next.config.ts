import path from 'node:path';
import type { NextConfig } from 'next';

// Next compiles this file to CommonJS today, so __dirname exists. `typeof`
// keeps the lookup from throwing outright if that ever changes.
const configDir = typeof __dirname === 'string' ? __dirname : process.cwd();
const workspaceRoot = path.resolve(configDir, '..', '..');

const nextConfig: NextConfig = {
  // The prod Docker stage ships .next/standalone and nothing else.
  output: 'standalone',
  // pnpm workspace: tracing has to start at the repo root, or the symlinked
  // dependencies never make it into the standalone bundle.
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
