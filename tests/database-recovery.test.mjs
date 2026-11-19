import test from 'node:test';import assert from 'node:assert/strict';import net from 'node:net';import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {openDatabase,databaseSettings} from '../src/api/database.ts';
test('idle PostgreSQL loss does not kill the worker and reconnect preserves committed fixture records',{skip:process.env.CODEITZ_TEST_POSTGRES!=='1',timeout:30000},async()=>{
 const base=openDatabase(),schema='recovery_test_'+randomBytes(8).toString('hex'),db=base.withSchema(schema),sockets=new Set();let child,server;const upstream=databaseSettings().connection;
 const proxy=()=>net.createServer(socket=>{const target=net.connect({host:upstream.host,port:upstream.port});for(const s of [socket,target]){sockets.add(s);s.on('error',()=>{});s.once('close',()=>sockets.delete(s));}socket.pipe(target);target.pipe(socket);socket.once('close',()=>target.destroy());target.once('close',()=>socket.destroy());});
 try{
  await base.schema.createSchema(schema).execute();await db.schema.createTable('audit_fixture_records').addColumn('id','integer',c=>c.primaryKey()).execute();
  server=proxy();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const source=`import {openDatabase} from './src/api/database.ts';const db=openDatabase();process.on('message',async action=>{try{if(action==='quit'){await db.destroy();process.disconnect();return;}if(action==='write')await db.transaction().execute(tx=>tx.insertInto('audit_fixture_records').values({id:1}).execute());const rows=await db.selectFrom('audit_fixture_records').selectAll().execute();process.send({ok:true,ids:rows.map(r=>r.id)});}catch{process.send({ok:false});}});process.send({started:true});`;
  child=spawn(process.execPath,['--input-type=module','-e',source],{cwd:new URL('../',import.meta.url),env:{...process.env,PGHOST:'127.0.0.1',PGPORT:String(port),PGSSLMODE:'disable',CODEITZ_PG_SCHEMA:schema},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  const receive=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Fixture child timed out')),8000);const exit=()=>finish(Error('Database worker exited on idle connection loss'));const message=value=>finish(null,value);function finish(error,value){clearTimeout(timer);child.off('message',message);child.off('exit',exit);error?reject(error):resolve(value);}child.once('message',message);child.once('exit',exit);});
  await receive();let response=receive();child.send('write');assert.deepEqual(await response,{ok:true,ids:[1]});
  for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,50));assert.equal(child.exitCode,null);
  response=receive();child.send('read');assert.equal((await response).ok,false);server=proxy();await new Promise(r=>server.listen(port,'127.0.0.1',r));
  const started=performance.now();response=receive();child.send('read');assert.deepEqual(await response,{ok:true,ids:[1]});console.log('Fixture reconnect transaction preserved in '+Math.round(performance.now()-started)+' ms');
  child.send('quit');await new Promise(r=>child.once('exit',r));child=undefined;
 }finally{child?.kill();for(const socket of sockets)socket.destroy();if(server?.listening)await new Promise(r=>server.close(r));await base.schema.dropSchema(schema).ifExists().cascade().execute();await base.destroy();}
});
