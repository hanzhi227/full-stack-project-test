import type { NextConfig } from 'next';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
try { loadEnvFile(resolve(__dirname, '../../.env')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const backend = new URL(process.env.BACKEND_URL ?? 'http://localhost:4000');
if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw new Error('BACKEND_URL must be an HTTP(S) origin without credentials or a path.');
const config: NextConfig = {
 output: 'standalone', outputFileTracingRoot: resolve(__dirname, '../..'),
 transpilePackages: ['@document-qa/contracts'],
 experimental: { proxyTimeout: 120_000, proxyClientMaxBodySize: '51mb' },
 async rewrites() { return [{ source: '/api/:path*', destination: `${backend.origin}/api/:path*` }]; },
 async headers() { return [{ source: '/:path*', headers: [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
 ] }]; }
};
export default config;
