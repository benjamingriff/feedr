import { db, migrate } from './db.ts';

const applied = await migrate();
await db.destroy();
console.log(applied.length ? `Applied ${applied.join(', ')}` : 'Database schema up to date.');
