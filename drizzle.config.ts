import { defineConfig } from 'drizzle-kit';

// Generate only: migrations are committed SQL and applied by the app at boot.
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './src/lib/server/db/migrations',
	casing: 'snake_case'
});
