import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    dedupe: ['yjs', 'y-protocols', 'lib0'],
    alias: {
      yjs: path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
    },
  },
  test: {
    include: ['../tests/**/*.test.js'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
    server: {
      deps: {
        external: ['mongodb-memory-server', 'mongoose', 'ws', 'supertest'],
      },
    },
  },
});
