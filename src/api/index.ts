import { createServer } from './server';
import { PrismaDAL } from '../db/prisma_dal';

const authToken = process.env.API_AUTH_TOKEN || process.env.PM_API_TOKEN || 'valid-token';
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL is required for API Server startup');
}
const prismaDal = new PrismaDAL(dbUrl);

async function main() {
  await prismaDal.initPragmas();
  const app = createServer(undefined, authToken, prismaDal);
  const PORT = process.env.PORT || 8000;

  const server = app.listen(PORT, () => {
    console.log(`API Server listening on port ${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await prismaDal.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error('Failed to start API Server', error);
  await prismaDal.close();
  process.exit(1);
});
