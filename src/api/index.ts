import { createServer } from './server';
import DAL from '../db/dal';
import * as path from 'path';

const dbPath = path.resolve(__dirname, '../../data/nexus.db');
const dal = new DAL(dbPath);

const app = createServer(dal);
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`API Server listening on port ${PORT}`);
});
