import { NexusToolchain } from './pm-core/NexusToolchain';
import { createServer } from './api/server';
import { PrismaDAL } from './db/prisma_dal';

export { NexusToolchain };

/**
 * Nexus Dispatch API Server entry point.
 *
 * Schema initialization is handled by Prisma migrations (`npx prisma migrate deploy`).
 * Production startup uses the V8 PrismaDAL boundary; legacy DAL is retained only as
 * archived reference under src/db/dal.ts and is not opened here.
 */
if (require.main === module) {
    const authToken = process.env.API_AUTH_TOKEN || process.env.PM_API_TOKEN || 'valid-token';
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('DATABASE_URL is required for Nexus Dispatch API Server startup');
    }
    const prismaDal = new PrismaDAL(dbUrl);

    prismaDal.initPragmas()
        .then(() => {
            const app = createServer(authToken, prismaDal);
            const PORT = process.env.PORT || 8000;
            const server = app.listen(PORT, () => {
                console.log(`Nexus Dispatch API Server running on port ${PORT}`);
            });
            const shutdown = async () => {
                server.close();
                await prismaDal.close();
                process.exit(0);
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        })
        .catch(async (error) => {
            console.error('Failed to start Nexus Dispatch API Server', error);
            await prismaDal.close();
            process.exit(1);
        });
}
