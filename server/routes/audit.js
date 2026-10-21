import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);
  app.addHook('preHandler', requireRole('admin','auditor'));

  app.get('/', async (req)=>{
    const limit = Math.min(+(req.query.limit||200), 2000);
    const { rows } = await q(
      `SELECT * FROM audit ORDER BY ts DESC LIMIT $1`,[limit]);
    return rows;
  });
}