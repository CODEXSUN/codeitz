import {z} from 'zod';
import {requireLocalRequest,type createHttpServer} from '@workspace/framework';
import {transferSchema} from '../../../../contracts/sync.ts';
import {SyncService} from './service.ts';
export function registerSyncRoutes(app:ReturnType<typeof createHttpServer>,sync:SyncService,scheduling=true){
 const base='/api/v1/sync',id=z.object({id:z.string().uuid()});
 const handle=(fn:(request:any)=>Promise<unknown>,local=true)=>({preHandler:local?requireLocalRequest:undefined,handler:async(request:any,reply:any)=>{reply.header('Cache-Control','no-store');try{return await fn(request);}catch(error){return reply.code(local?409:403).send({message:error instanceof z.ZodError?'Invalid sync request.':error instanceof Error?error.message:'Sync request failed.'});}}});
 app.get(base,handle(()=>sync.overview()));
 app.post(base+'/connections',handle(request=>sync.connect(request.body)));
 app.patch(base+'/connections/:id',handle(async request=>sync.configure(id.parse(request.params).id,request.body).then(()=>({saved:true}))));
 app.post(base+'/connections/:id/initial',handle(request=>{z.object({confirmed:z.literal(true)}).passthrough().parse(request.body);return sync.initial(id.parse(request.params).id);}));
 app.post(base+'/queue/:id/retry',handle(async request=>{await sync.retry(id.parse(request.params).id);await sync.dispatch();return {processed:true};}));
 app.post(base+'/connections/:id/preview',handle(request=>sync.preview(id.parse(request.params).id,request.body)));
 app.post(base+'/connections/:id/pull',handle(request=>sync.pull(id.parse(request.params).id,request.body)));
 app.post(base+'/connections/:id/send',handle(request=>{const body=z.object({selection:transferSchema,confirmed:z.literal(true),expected:z.array(z.object({kind:z.string(),id:z.string(),fingerprint:z.string().nullable()}))}).strict().parse(request.body);return sync.initial(id.parse(request.params).id,body.selection,body.expected);}));
 app.post(base+'/queue/:id/send',handle(request=>{z.object({confirmed:z.literal(true)}).strict().parse(request.body);return sync.release(id.parse(request.params).id);}));
 app.post(base+'/exchange/pull',handle(async request=>sync.exportForPull(await sync.authenticate(request.headers.authorization),request.body),false));
 app.post(base+'/dispatch',handle(async()=>{await sync.dispatch();return {processed:true};}));
 app.post(base+'/inbox/:id/review',handle(request=>{const body=z.object({decision:z.enum(['confirm','reject']),expected:z.string().nullable(),resolve:z.boolean().default(false)}).strict().parse(request.body);return sync.review(id.parse(request.params).id,body.decision,body.expected,body.resolve);}));
 app.post(base+'/exchange',{bodyLimit:12*1024*1024,...handle(async request=>sync.receive(await sync.authenticate(request.headers.authorization),request.body),false)});
 app.get(base+'/exchange/:id',handle(async request=>sync.receipt(await sync.authenticate(request.headers.authorization),id.parse(request.params).id),false));
 let running:Promise<void>|undefined;const timer=scheduling?setInterval(()=>{if(!running)running=sync.dispatch().catch(()=>{}).finally(()=>{running=undefined;});},15000):undefined;timer?.unref();app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await running;});
}
