import { appFetch } from '../../platform-client';
import type { ProjectModule, ModuleInput } from '../../../../contracts/modules';
const base=(owner:string)=>`/api/v1/projects/${owner}/modules`;
async function request(url:string,method='GET',body?:unknown):Promise<ProjectModule>{const response=await appFetch(url,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.message??'Module request failed.');return result;}
export const loadModule=(owner:string,id:string)=>request(`${base(owner)}/${id}`);
export const createModule=(owner:string,input:ModuleInput)=>request(base(owner),'POST',input);
export const updateModule=(owner:string,record:ProjectModule)=>{const {id,createdAt,updatedAt,approval,...input}=record;return request(`${base(owner)}/${id}`,'PATCH',input);};

export async function reviewModule(owner:string,id:string):Promise<import('../../../../contracts/modules').ModuleReview>{const response=await appFetch(`${base(owner)}/${id}/review`,{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.message??'Review failed.');return result;}
export const approveModule=(owner:string,id:string,revision:number,ownerKey:string)=>request(`${base(owner)}/${id}/approve`,'POST',{revision,ownerKey,confirmed:true});
