import { defineConfig } from 'prisma/config';

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

// Not `env('DATABASE_URL')` from prisma/config: that helper throws when the
// variable is unset, and `prisma generate` runs during the Docker build, where
// no database exists yet. Migration commands fail with a clear error instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    // Spread rather than a default: Prisma 7 removed the --shadow-database-url
    // flag, so `migrate diff --from-migrations` (the hygiene workflow) reads
    // this instead, but every other command VALIDATES the key when present and
    // rejects an empty string with P1013. Absent is the only safe "unset".
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
