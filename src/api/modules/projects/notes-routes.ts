import { requireLocalRequest, type createHttpServer } from '@workspace/framework';
import { z } from 'zod';
import { noteFieldsSchema } from '../../../../contracts/notes.ts';
import type { Projects } from './application/service.ts';
export function registerNoteRoutes(app: ReturnType<typeof createHttpServer>, projects: Projects) {
  const scope=z.object({area:z.enum(['apps','devkit']),name:z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(63)});
  const recordScope=scope.extend({id:z.string().uuid()});
  const base='/api/v1/projects/:area/:name/notes';
  app.get(base,{preHandler:requireLocalRequest},async(request,reply)=>{
    const params=scope.safeParse(request.params);if(!params.success)return reply.code(400).send({message:'Invalid project.'});
    reply.header('Cache-Control','no-store');
    try{return {notes:await projects.notes(`${params.data.area}/${params.data.name}`)};}catch{return reply.code(404).send({message:'Project not found.'});}
  });
  app.get(`${base}/options`,{preHandler:requireLocalRequest},async(request,reply)=>{
    const params=scope.safeParse(request.params);if(!params.success)return reply.code(400).send({message:'Invalid project.'});
    reply.header('Cache-Control','no-store');try{return await projects.noteOptions(`${params.data.area}/${params.data.name}`);}catch{return reply.code(404).send({message:'Project not found.'});}
  });
  app.post(`${base}/options/:kind`,{preHandler:requireLocalRequest},async(request,reply)=>{
    const params=scope.extend({kind:z.enum(['category','status'])}).safeParse(request.params),input=z.object({label:z.string().trim().min(1).max(100)}).strict().safeParse(request.body);
    if(!params.success||!input.success)return reply.code(400).send({message:'Enter a name of 1–100 characters.'});
    try{return reply.code(201).send(await projects.createNoteOption(`${params.data.area}/${params.data.name}`,params.data.kind,input.data.label));}catch(error){return reply.code(404).send({message:error instanceof Error?error.message:'Project not found.'});}
  });
  app.get(`${base}/:id`,{preHandler:requireLocalRequest},async(request,reply)=>{
    const params=recordScope.safeParse(request.params);if(!params.success)return reply.code(400).send({message:'Invalid note.'});
    reply.header('Cache-Control','no-store');
    try{return await projects.note(`${params.data.area}/${params.data.name}`,params.data.id);}catch{return reply.code(404).send({message:'Note not found in this project.'});}
  });
  app.post(base,{preHandler:requireLocalRequest,bodyLimit:12*1024*1024},async(request,reply)=>{
    const params=scope.safeParse(request.params),input=noteFieldsSchema.safeParse(request.body);
    if(!params.success||!input.success)return reply.code(400).send({message:'Check the note fields.',...(!input.success?{issues:input.error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message}))}:{})});
    try{await projects.notes(`${params.data.area}/${params.data.name}`);return reply.code(201).send(await projects.saveWorkspace(`${params.data.area}/${params.data.name}`,'notes',input.data));}catch(error){const message=error instanceof Error?error.message:'Save failed.';return reply.code(message==='Project not found.'?404:409).send({message});}
  });
  app.patch(`${base}/:id`,{preHandler:requireLocalRequest,bodyLimit:12*1024*1024},async(request,reply)=>{
    const params=recordScope.safeParse(request.params),input=noteFieldsSchema.extend({revision:z.number().int().positive()}).safeParse(request.body);
    if(!params.success||!input.success)return reply.code(400).send({message:'Check the note fields and revision.'});
    try{
      await projects.note(`${params.data.area}/${params.data.name}`,params.data.id);
      return await projects.saveWorkspace(`${params.data.area}/${params.data.name}`,'notes',{...input.data,id:params.data.id});
    }catch(error){const message=error instanceof Error?error.message:'Update failed.';return reply.code(message==='Note not found.'?404:409).send({message});}
  });
}
