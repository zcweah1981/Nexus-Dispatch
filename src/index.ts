import { NexusToolchain } from './pm-core/NexusToolchain';
import { createServer } from './api/server';
import DAL from './db/dal';

export { NexusToolchain };

/**
 * Nexus Dispatch API Server entry point.
 *
 * Schema initialization is handled by Prisma migrations (`npx prisma migrate deploy`).
 * The inline CREATE TABLE SQL that was previously here has been removed —
 * it was a V1-era artifact that bypassed the migration system.
 *
 * To initialize a fresh database:
 *   1. Set DATABASE_URL in .env to point to your SQLite file
 *   2. Run: npx prisma migrate deploy
 *   3. Start this server: npm start
 */
if (require.main === module) {
    const dal = new DAL();

    const app = createServer(dal);
    const PORT = process.env.PORT || 8000;

    app.listen(PORT, () => {
        console.log(`Nexus Dispatch API Server running on port ${PORT}`);
    });
}
