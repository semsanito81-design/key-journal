import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import carrierRoutes from './routes/carriers.js';
import userRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger:true });
await app.register(cookie);
await app.register(cors, { origin:true, credentials:true });
await app.register(fastifyStatic, {
  root: path.join(__dirname,'..','public'),
  prefix: '/',
});

app.register(authRoutes,  { prefix:'/api/auth' });
app.register(carrierRoutes,{ prefix:'/api/carriers' });
app.register(userRoutes,  { prefix:'/api/users' });
app.register(auditRoutes, { prefix:'/api/audit' });

app.setErrorHandler((err,req,reply)=>{
  app.log.error(err);
  reply.code(err.statusCode||500).send({ error:err.message });
});

const port = +(process.env.PORT||3000);
app.listen({ port, host:'127.0.0.1' }, err=>{
  if(err){ app.log.error(err); process.exit(1); }
  console.log(`🚀 http://key-journal.local → http://127.0.0.1:${port}`);
});