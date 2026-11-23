export class CodexClient {
  constructor(binary: string, workspace: string);
  start(): Promise<void>;
  ensureSandbox(): Promise<void>;
  thread(options: { workspace: string; threadId?:string; worker?: boolean; ephemeral?: boolean; internal?:boolean; displayName?:string; referenceRepository?:string|null }): Promise<{thread: {id:string}}>;
  turn(threadId:string, text:string, onStarted:(id:string)=>void | Promise<void>, onEvent:(event:{method:string;params?:{delta?:unknown;item?:{type?:string}}})=>void, options:{workspace:string;worker?:boolean}):Promise<{status:string;items?:{type:string;text?:string}[]}>;
  interrupt(threadId:string,turnId:string):Promise<unknown>;
  parkThread(threadId:string):Promise<void>;
  close():Promise<void>;
}
