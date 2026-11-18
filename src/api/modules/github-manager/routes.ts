import {requireLocalRequest,type createHttpServer} from '@workspace/framework';
import {z} from 'zod';
import {GitHubManager} from './service.ts';
import {GitOperations,GitActionError} from './operations.ts';
export function registerGitHubManagerRoutes(app:ReturnType<typeof createHttpServer>,manager:GitHubManager){
 const operations=new GitOperations(manager);const idSchema=z.object({id:z.string().regex(/^[a-f0-9]{24}$/)});
 app.get('/api/v1/github-manager/repositories',{preHandler:requireLocalRequest},async(_request,reply)=>{reply.header('Cache-Control','no-store');try{return await manager.list();}catch{return reply.code(503).send({message:'Repository status unavailable.'});}});
 for(const action of ['review','file','commit','push'] as const)app.route({method:action==='review'||action==='file'?'GET':'POST',url:`/api/v1/github-manager/repositories/:id/${action}`,preHandler:requireLocalRequest,handler:async(request,reply)=>{reply.header('Cache-Control','no-store');const params=idSchema.safeParse(request.params);if(!params.success)return reply.code(400).send({message:'Invalid repository.'});try{
 if(action==='review')return await operations.review(params.data.id);
 if(action==='file'){const input=z.object({path:z.string().min(1).max(2000)}).strict().parse(request.query);return await operations.preview(params.data.id,input.path);}
 if(action==='commit'){const input=z.object({message:z.string().trim().min(1).max(2000),paths:z.array(z.string().min(1).max(2000)).min(1).max(200),token:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(request.body);return await operations.commit(params.data.id,input.message,input.paths,input.token);}
 const input=z.object({head:z.string().regex(/^[a-f0-9]{40,64}$/)}).strict().parse(request.body);return await operations.push(params.data.id,input.head);
 }catch(error){return reply.code(error instanceof z.ZodError?400:error instanceof GitActionError?error.status:503).send({message:error instanceof GitActionError?error.message:error instanceof z.ZodError?'Enter valid action details.':'Repository action unavailable.'});}}});
}
