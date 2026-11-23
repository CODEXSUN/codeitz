import {openLiveStream} from '../../live-stream';
import { appFetch } from '../../platform-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentChatWorkspace, type AgentChatMode } from '@workspace/ui/blocks/agent-chat';
import type { ChatDetail, Conversation } from '../../../../contracts/chat';
import { navigate, setQuery, useLocation } from '../../navigation';
type Setup = { projects:{owner:string;name:string}[]; codex:{ signedIn:boolean; message:string } };
async function request(url:string,body?:object) {
  const response = await appFetch(url,body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {cache:'no-store'});
  const result = await response.json(); if(!response.ok)throw new Error(result.message||`Chat request failed (${response.status}).`); return result;
}
export function AgentChatPage() {
  const location = useLocation(); const id = location.chatId;
  const [setup,setSetup] = useState<Setup|null>(null); const [conversations,setConversations] = useState<Conversation[]>([]); const [detail,setDetail] = useState<ChatDetail|null>(null);
  const [loading,setLoading] = useState(false); const [error,setError] = useState(''); const [streamState,setStreamState] = useState('');
  const selected = useRef(id); selected.current=id; const current = useRef<ChatDetail|null>(null);
  const mounted = useRef(false); const retryRequest = useRef<{chatId:string;content:string;mode:AgentChatMode;requestId:string}|null>(null);
  const receive = useCallback((next:ChatDetail)=>{
    if(!mounted.current||selected.current!==next.conversation.id)return;
    const previous=current.current;
    if(previous?.conversation.id===next.conversation.id&&(previous.activities.at(-1)?.id??0)>(next.activities.at(-1)?.id??0))return;
    current.current=next;setDetail(next);setLoading(false);
  },[]);
  const refreshList = useCallback(async()=>{const data=await request('/api/v1/chats');if(mounted.current)setConversations(data.conversations);},[]);
  useEffect(()=>{mounted.current=true;void request('/api/v1/chats/setup').then(data=>{if(mounted.current)setSetup(data);}).catch(reason=>{if(mounted.current)setError(reason.message);});void refreshList().catch(reason=>{if(mounted.current)setError(reason.message);});return()=>{mounted.current=false;};},[refreshList]);
  useEffect(()=>{
    let alive=true;let stream:ReturnType<typeof openLiveStream>|undefined;current.current=null;setDetail(null);setError('');setLoading(!!id);setStreamState('');
    if(id)void request(`/api/v1/chats/${id}`).then(data=>{
      if(!alive)return;receive(data);stream=openLiveStream(appFetch,`/api/v1/chats/${id}/stream`,{
        onOpen:()=>{if(alive)setStreamState('live');},onError:status=>{if(alive){setStreamState(status===401||status===403?'blocked':'reconnecting');if(status===401||status===403)setError('Live updates paused. Sign in or check your workspace access.');}},
        onMessage:data=>{try{const update=JSON.parse(data);if(update.type==='snapshot')receive(update.data);}catch{if(alive)setError('Could not read the chat stream. Refresh the page.');}},
      });
    }).catch(reason=>{if(alive){setError(reason.message);setLoading(false);}});
    return()=>{alive=false;stream?.close();};
  },[id,receive]);
  useEffect(()=>{if(detail)void refreshList().catch(()=>{});},[detail?.conversation.updatedAt,refreshList]);
  const visibleDetail = detail?.conversation.id === id ? detail : null;
  const owner = visibleDetail?.conversation.owner ?? (setup?.projects.some(project=>project.owner===location.params.get('owner')) ? location.params.get('owner')! : setup?.projects.find(project=>project.owner==='devkit/codeitz')?.owner ?? setup?.projects[0]?.owner ?? '');
  const mode = (location.params.get('mode')??'explore') as AgentChatMode;
  async function send(content:string,mode:AgentChatMode) {
    setError(''); let chatId=id;
    if(!chatId){const conversation=await request('/api/v1/chats',{owner});chatId=conversation.id;navigate(`/agent-chat/${chatId}`+(mode==='explore'?'':`?mode=${mode}`));}
    const previous=retryRequest.current;
    const input=previous&&previous.chatId===chatId&&previous.content===content&&previous.mode===mode?previous:{chatId,content,mode,requestId:crypto.randomUUID()};retryRequest.current=input;
    const next=await request(`/api/v1/chats/${chatId}/messages`,{content,mode,requestId:input.requestId});receive(next);retryRequest.current=null;await refreshList().catch(()=>{});return true;
  }
  const running = !!visibleDetail?.messages.some(message=>message.status==='running');
  return <main className="h-full min-h-0"><AgentChatWorkspace projects={(setup?.projects??[]).map(project=>({id:project.owner,name:project.name}))} project={owner} onProjectChange={owner=>setQuery({owner})}
    conversations={conversations} conversationId={id||undefined} onConversationChange={chatId=>navigate(`/agent-chat/${chatId}`)} onNew={()=>navigate('/agent-chat'+(owner?`?owner=${encodeURIComponent(owner)}`:''))}
    messages={(visibleDetail?.messages??[]).map(message=>{const link=visibleDetail?.taskLinks?.find(link=>link.messageId===message.id);return {...message,...(link?{taskId:link.taskId,taskLinkState:link.state}:{})};})} activities={visibleDetail?.activities??[]} mode={mode} onModeChange={mode=>setQuery({mode:mode==='explore'?undefined:mode})} running={running} loading={loading||!!id&&!visibleDetail&&!error||!setup&&!error}
    connected={!!setup?.codex.signedIn&&!['reconnecting','blocked'].includes(streamState)} connectionLabel={streamState==='blocked'?'Live updates paused':streamState==='reconnecting'?'Live updates reconnecting…':setup?.codex.signedIn?'Local Codex connected':setup?.codex.message??'Checking local Codex…'} error={error}
    onApprovePlan={async messageId=>{if(!id)throw new Error('Open the saved chat plan first.');const result=await request(`/api/v1/chats/${id}/tasks`,{messageId,approvePlan:true});receive(result.conversation);}} onOpenTask={taskId=>navigate(`/tasks/${taskId}`)}
    onSettings={()=>navigate('/settings/codex')} onSend={send} onStop={async()=>{if(id)await request(`/api/v1/chats/${id}/stop`,{});}}/></main>;
}
