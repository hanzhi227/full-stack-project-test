import type { NextConfig } from 'next';
const config: NextConfig = { output: 'standalone', serverExternalPackages: ['@zilliz/milvus2-sdk-node'] };
export default config;
