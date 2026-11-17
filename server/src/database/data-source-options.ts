import type { DataSourceOptions } from 'typeorm';

// TypeORM expects glob patterns with forward slashes, also on Windows.
const here = import.meta.dirname.replaceAll('\\', '/');

/**
 * Single source of TypeORM settings, used both by the Nest app and by the TypeORM CLI.
 * The schema is changed only through migrations: `synchronize` stays off everywhere.
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [`${here}/../**/*.entity.js`],
    migrations: [`${here}/migrations/*.js`],
    synchronize: false,
    migrationsRun: false,
  };
}
