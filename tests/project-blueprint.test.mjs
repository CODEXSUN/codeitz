import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildBlueprint} from '../src/api/modules/projects/application/blueprint.ts';
import {emptyModuleSpec} from '../contracts/modules.ts';
const project={owner:'apps/demo',name:'demo',purpose:'Manage contacts',active:true};
function module(){return {id:randomUUID(),title:'Contact',content:'Contact definitions',status:'draft',revision:1,createdAt:'2026-11-17T00:00:00.000Z',updatedAt:'2026-11-17T00:00:00.000Z',spec:{...emptyModuleSpec(),code:'contact',owner:'apps/demo',version:'0.1.0',responsibility:'Maintain contacts',dataScope:'app',databaseSchema:'public',apiRoutes:[{id:randomUUID(),method:'GET',path:'/api/v1/contacts',summary:'List contacts',permission:'contact.read',requestSchema:'{}',responseSchema:'{"type":"array","items":{"type":"object"}}'}],tables:[{id:randomUUID(),name:'contacts',description:'Contact records',fields:[{id:randomUUID(),name:'id',type:'INTEGER',sqlType:'INTEGER',generation:'identity',indexed:false,required:true,primary:true,unique:true,defaultValue:'',reference:'',description:'Internal key'}]}]}};}
test('complete blueprints export exact definitions, revisions and stable fingerprints',()=>{const record=module(),one=buildBlueprint(project,[record]),two=buildBlueprint(project,[record]);assert.equal(one.readyForCoding,true);assert.deepEqual(one.modules,[record]);assert.equal(one.fingerprint,two.fingerprint);const changed=structuredClone(record);changed.revision++;assert.notEqual(buildBlueprint(project,[changed]).fingerprint,one.fingerprint);assert.equal(one.version,1);});
test('missing and malformed agent inputs are reported without rewriting drafts',()=>{const record=module();record.spec.responsibility='';record.spec.apiRoutes[0].requestSchema='invalid';delete record.spec.tables[0].fields[0].sqlType;delete record.spec.tables[0].fields[0].generation;const before=structuredClone(record);const result=buildBlueprint(project,[record]);assert.equal(result.readyForCoding,false);for(const path of ['responsibility','apiRoutes[0].requestSchema','tables[0].fields[0].sqlType','tables[0].fields[0].generation'])assert.ok(result.issues.some(i=>i.path===path),path);assert.deepEqual(record,before);});
test('route conflicts, unresolved references and incompatible SQL types block completeness',()=>{const one=module(),two=module();two.spec.code='other';two.spec.tables[0].name='other_contacts';one.spec.apiRoutes[0].path='/api/v1/contacts/:id';two.spec.apiRoutes[0].path='/api/v1/contacts/{contactId}';one.spec.tables[0].fields[0].reference='missing.id';one.spec.tables[0].fields[0].sqlType='TEXT';const result=buildBlueprint(project,[one,two]);assert.ok(result.issues.some(i=>i.message.includes('conflicts')));assert.ok(result.issues.some(i=>i.path.endsWith('.reference')));assert.ok(result.issues.some(i=>i.path.endsWith('.sqlType')));});
test('inactive and empty projects cannot claim coding completeness',()=>{assert.equal(buildBlueprint({...project,active:false},[module()]).readyForCoding,false);assert.equal(buildBlueprint(project,[]).readyForCoding,false);});


test('field automation gaps report sizing, indexing, purpose and reference behavior',()=>{
 const record=module();const field=record.spec.tables[0].fields[0];
 field.type='VARCHAR';field.sqlType='VARCHAR';field.generation='none';field.description='';delete field.indexed;
 field.reference='contacts.id';
 const result=buildBlueprint(project,[record]);
 for(const suffix of ['.description','.indexed','.onDelete','.sqlType'])assert.ok(result.issues.some(i=>i.path.endsWith(suffix)),suffix);
 assert.equal(result.readyForCoding,false);
});
