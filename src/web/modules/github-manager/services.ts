import type {RepositoriesOverview} from '../../../../contracts/github-manager';
export async function loadRepositories():Promise<RepositoriesOverview>{const response=await fetch('/api/v1/github-manager/repositories',{cache:'no-store'});if(!response.ok)throw new Error('Could not load repository status.');return response.json();}
import type {RepositoryReview,FilePreview,GitActionResult} from '../../../../contracts/github-manager';
async function request<T>(id:string,action:string,body?:unknown):Promise<T>{const response=await fetch(`/api/v1/github-manager/repositories/${id}/${action}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.message??'Repository action failed.');return result;}
export const loadReview=(id:string)=>request<RepositoryReview>(id,'review');
export const loadFile=(id:string,path:string)=>request<FilePreview>(id,`file?path=${encodeURIComponent(path)}`);
export const commitFiles=(id:string,message:string,paths:string[],token:string)=>request<GitActionResult>(id,'commit',{message,paths,token});
export const pushCommit=(id:string,head:string)=>request<GitActionResult>(id,'push',{head});
