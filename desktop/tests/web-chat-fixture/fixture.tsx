import { createRoot } from "react-dom/client";
import { AgentChatPage } from "../../../src/web/modules/agent-chat/page";
import "@workspace/ui/styles.css";
const chat = "11111111-1111-4111-8111-111111111111";
const now = "2026-01-01T00:00:00.000Z";
const conversation = {id:chat,owner:"devkit/codeitz",title:"Fixture chat",createdAt:now,updatedAt:now};
const detail = {conversation,messages:[{id:"u",role:"user",content:"Explain",status:"completed",mode:"explore",createdAt:now,updatedAt:now},{id:"a",role:"assistant",content:"",status:"running",mode:"explore",createdAt:now,updatedAt:now}],activities:[],taskLinks:[]};
let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
const encoder = new TextEncoder();
declare global { interface Window { sendWebFixture: (text:string,status:string) => void; } }
window.sendWebFixture = (text,status) => { detail.messages[1].content=text; detail.messages[1].status=status; streamController?.enqueue(encoder.encode(`data: ${JSON.stringify({type:"snapshot",data:detail})}\n\n`)); };
window.fetch = async (input) => {
 const url=typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
 if(url.endsWith('/api/v1/chats/setup')) return Response.json({projects:[{owner:'devkit/codeitz',name:'Codeitz'}],codex:{signedIn:true,message:''}});
 if(url.endsWith('/api/v1/chats')) return Response.json({conversations:[conversation]});
 if(url.endsWith(`/api/v1/chats/${chat}/stream`)) return new Response(new ReadableStream({start(c){streamController=c;}}),{headers:{'Content-Type':'text/event-stream'}});
 if(url.endsWith(`/api/v1/chats/${chat}`)) return Response.json(detail);
 return new Response(null,{status:404});
};
window.history.replaceState({},"",`/agent-chat/${chat}`);
createRoot(document.getElementById('root')!).render(<AgentChatPage />);
