import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldProblems,sqlParts,fieldFamily} from '../contracts/field-definition.ts';
import {moduleFieldSchema} from '../contracts/modules.ts';
const field={id:'7f9d6e09-031c-4fe7-95fc-52a645c2725f',name:'amount',type:'DECIMAL',sqlType:'NUMERIC(12,2)',generation:'none',indexed:true,required:false,primary:false,unique:false,defaultValue:'',reference:'',description:'Charge amount'};
test('SQL sizing and PostgreSQL aliases round trip without separate conflicting metadata',()=>{
 assert.deepEqual(sqlParts('numeric(12, 2)'),{base:'NUMERIC',length:'12',scale:'2'});
 for(const [base,family]of [['BYTEA','BLOB'],['JSONB','JSON'],['TIMESTAMPTZ','TIMESTAMP'],['NUMERIC','DECIMAL']])assert.equal(fieldFamily(base),family);
 assert.deepEqual(fieldProblems(field),[]);assert.deepEqual(moduleFieldSchema.parse(field),field);
});
test('invalid lengths, scale, identity and nullable references are rejected',()=>{
 for(const patch of [{sqlType:'NUMERIC(2,3)'},{type:'VARCHAR',sqlType:'VARCHAR'},{type:'VARCHAR',sqlType:'VARCHAR(0)'},{type:'TEXT',sqlType:'TEXT(2)'},{generation:'identity'},{primary:true},{onDelete:'CASCADE'},{reference:'parent.id',onDelete:'SET NULL',required:true}])assert.ok(fieldProblems({...field,...patch}).length,JSON.stringify(patch));
 assert.deepEqual(fieldProblems({...field,type:'VARCHAR',sqlType:'VARCHAR(120)'}),[]);
 assert.deepEqual(fieldProblems({...field,reference:'parent.id',onDelete:'SET NULL'}),[]);
});
test('legacy field definitions remain readable and new relation metadata is preserved',()=>{
 const {indexed,...legacy}=field;assert.equal(moduleFieldSchema.parse(legacy).indexed,undefined);
 const relational={...field,reference:'parent.id',onDelete:'RESTRICT'};assert.deepEqual(moduleFieldSchema.parse(relational),relational);
});
