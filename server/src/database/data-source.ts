import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options.js';

/**
 * DataSource for the TypeORM CLI (migrations). The Nest app does not use this file.
 * Run the CLI against the compiled output: `npm run migration:run -w @leakguard/server`.
 */
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource(buildDataSourceOptions(databaseUrl));
