import type {ModuleSpec} from './modules.ts';
type Field=ModuleSpec['tables'][number]['fields'][number];
export const sqlFieldTypes=['TEXT','VARCHAR','INTEGER','REAL','DECIMAL','NUMERIC','BOOLEAN','DATE','TIMESTAMP','TIMESTAMPTZ','UUID','JSON','JSONB','BYTEA'];
export function sqlParts(sql:string){const match=/^([A-Z]+)(?:\((\d+)(?:,\s*(\d+))?\))?$/i.exec(sql);return {base:match?.[1]?.toUpperCase()??sql.toUpperCase(),length:match?.[2]??'',scale:match?.[3]??''};}
export function fieldFamily(base:string):Field['type']{return (base==='BYTEA'?'BLOB':base==='TIMESTAMPTZ'?'TIMESTAMP':base==='JSONB'?'JSON':base==='NUMERIC'?'DECIMAL':base) as Field['type'];}
export function fieldProblems(field:Field){
 const errors:string[]=[];const {base,length,scale}=sqlParts(field.sqlType??'');
 if(!/^[a-z][a-z0-9_]*$/.test(field.name))errors.push('Use a lowercase SQL column name.');
 if(!sqlFieldTypes.includes(base))errors.push('Choose a supported PostgreSQL type.');
 if(fieldFamily(base)!==field.type)errors.push('SQL type must match the field type.');
 if(base==='VARCHAR'&&(!length||Number(length)<1||Number(length)>10485760))errors.push('Enter a VARCHAR length from 1 to 10485760.');
 if(['DECIMAL','NUMERIC'].includes(base)&&(!length||Number(length)<1||Number(length)>1000||scale===''||Number(scale)>Number(length)))errors.push('Enter precision from 1 to 1000 and scale from 0 to precision.');
 if(length&&!['VARCHAR','DECIMAL','NUMERIC'].includes(base))errors.push('Length or precision is not supported for this type.');
 if(scale!==''&&base==='VARCHAR')errors.push('VARCHAR accepts length only.');
 if(field.generation==='identity'&&(field.type!=='INTEGER'||field.defaultValue))errors.push('Identity requires INTEGER with no default.');
 if(field.primary&&!field.required)errors.push('Primary key fields must be required.');
 if(field.onDelete&&!field.reference)errors.push('Delete behavior needs a reference.');
 if(field.onDelete==='SET NULL'&&(field.required||field.primary))errors.push('SET NULL requires a nullable field.');
 return errors;
}
