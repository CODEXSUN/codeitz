import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

test('real pinned SDK sends each tab selector on task/chat fetch streams and never in URLs', {timeout:20000}, async()=>{
  const requests=[];
  const server=createServer((request,response)=>{
    const tab=request.headers['x-platform-tab'];
    requests.push({path:request.url,tab,authorization:request.headers.authorization});
    if(!/^[ab]{32}$/.test(tab??'')){response.writeHead(401);response.end();return;}
    response.writeHead(200,{'content-type':'text/event-stream'});
    response.write(`data: ${JSON.stringify({tab,path:request.url})}\n\n`);
    request.on('close',()=>response.end());
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const streamUrl=new URL('../src/web/live-stream.ts',import.meta.url).href;
  const children=[];
  async function tabClient(tab){
    const source=`
      Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(name,options,callback)=>callback({name})}},configurable:true});
      const values=new Map([['codebiz.platform.tab',${JSON.stringify(tab)}]]);
      globalThis.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
      globalThis.window=new EventTarget();
      const nativeFetch=globalThis.fetch;
      globalThis.fetch=(path,options)=>nativeFetch(new URL(path,${JSON.stringify(origin)}),options);
      const {createPlatformDirectBrowserClient}=await import('@workspace/sdk/platform-direct-browser');
      const {openLiveStream}=await import(${JSON.stringify(streamUrl)});
      const client=createPlatformDirectBrowserClient('codeitz');
      const messages=[];
      for(const path of ['/api/v1/tasks/stream','/api/v1/chats/fixture/stream']){
        let stream;
        stream=openLiveStream(client.fetch,path,{onOpen(){},onMessage(data){messages.push(JSON.parse(data));stream.close();},onError(){throw Error('SDK stream failed');}});
        await stream.done;
      }
      window.dispatchEvent(new Event('pagehide'));
      console.log(JSON.stringify(messages));
    `;
    const child=spawn(process.execPath,['--input-type=module','--eval',source],{cwd:new URL('../',import.meta.url),windowsHide:true,stdio:['ignore','pipe','pipe']});
    children.push(child);let output='',error='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{error+=data;});
    const timer=setTimeout(()=>child.kill(),10000);
    try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,error);return JSON.parse(output);}finally{clearTimeout(timer);}
  }
  try{
    const [a,b]=await Promise.all([tabClient('a'.repeat(32)),tabClient('b'.repeat(32))]);
    assert.equal(a.length,2);assert.equal(b.length,2);
    assert.ok(a.every(message=>message.tab==='a'.repeat(32)));
    assert.ok(b.every(message=>message.tab==='b'.repeat(32)));
    assert.equal(requests.length,4);
    assert.ok(requests.every(request=>!request.path.includes('?')&&!request.authorization));
  }finally{
    for(const child of children)if(child.exitCode===null)child.kill();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
