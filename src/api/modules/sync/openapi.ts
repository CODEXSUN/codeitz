import {z} from 'zod';
import {connectionSchema,syncEventSchema,transferSchema} from '../../../../contracts/sync.ts';
const json=(schema:object)=>({description:'Successful sync operation',content:{'application/json':{schema}}});
const response={type:'object',additionalProperties:true},error={description:'Credentials, scope, validation or revision conflict',content:{'application/json':{schema:{type:'object',properties:{message:{type:'string'}}}}}};
export const syncOperations=Object.fromEntries([
 ['GET','', 'readSync','Read connected apps, incoming drafts, deliveries, activities and table save modes'],
 ['POST','/connections','connectSyncApp','Create connected app; incoming token and secret returned once',z.toJSONSchema(connectionSchema)],
 ['PATCH','/connections/{id}','configureSyncApp','Configure or disable a connected app',z.toJSONSchema(connectionSchema)],
 ['POST','/connections/{id}/initial','initialSync','Manually queue existing snapshots when sending is explicitly enabled',z.toJSONSchema(z.object({confirmed:z.literal(true)}))],
 ['POST','/connections/{id}/preview','previewSyncSelection','Preview exactly the local project/module records selected for sending',z.toJSONSchema(transferSchema)],
 ['POST','/connections/{id}/pull','pullDevelopmentData','Get remote project/module data as local drafts without changing remote records',z.toJSONSchema(transferSchema)],
 ['POST','/connections/{id}/send','sendSyncSelection','Explicitly send a reviewed selection as remote drafts',z.toJSONSchema(z.object({selection:transferSchema,confirmed:z.literal(true),expected:z.array(z.object({kind:z.string(),id:z.string(),fingerprint:z.string().nullable()}))}).strict())],
 ['POST','/queue/{id}/send','releaseHeldSync','Explicitly approve a held local change for sending',z.toJSONSchema(z.object({confirmed:z.literal(true)}).strict())],
 ['POST','/exchange/pull','exportDevelopmentData','Return scoped project/module snapshots for a peer-requested development copy',z.toJSONSchema(transferSchema)],
 ['POST','/queue/{id}/retry','retrySync','Retry delivery or poll its receipt'],
 ['POST','/dispatch','dispatchSync','Process due deliveries and receipts'],
 ['POST','/inbox/{id}/review','reviewSyncDraft','Manually confirm, reject or resolve an incoming draft',z.toJSONSchema(z.object({decision:z.enum(['confirm','reject']),expected:z.string().nullable(),resolve:z.boolean().optional()}).strict())],
 ['POST','/exchange','receiveSyncDraft','Receive an authenticated incoming draft without applying it',z.toJSONSchema(syncEventSchema)],
 ['GET','/exchange/{id}','syncReceipt','Read the confirmation receipt for a sent event'],
].map(([method,path,operationId,summary,body])=>[`${method} /api/v1/sync${path}`,{operationId,summary,response,specification:{operationId,summary,tags:['Sync'],description:String(path).startsWith('/exchange')?'Connected-app authentication required: Authorization: token APP_TOKEN:APP_SECRET. Project scope is enforced. Incoming records use draft → confirmed.':'Local/same-origin manual operation. Does not grant coding or module approval.',...(String(path).startsWith('/exchange')?{security:[{ConnectedApp:[]}]}:{}),parameters:String(path).includes('{id}')?[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}]:[],...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),responses:{'200':json(response),'403':error,'409':error}}}]));
