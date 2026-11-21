import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openLiveStream} from '../src/web/live-stream.ts';

const encode = value => new TextEncoder().encode(value);
const response = stream => new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8'}});
const deferred = () => {let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('uses the supplied authenticated client with a clean path and abort signal',async()=>{
 const opened=deferred();let calls=0;
 const stream=openLiveStream(async(path,options)=>{calls++;assert.equal(path,'/api/v1/tasks/stream');assert.equal(options.headers.Accept,'text/event-stream');assert.equal(options.cache,'no-store');assert.ok(options.signal);return response(new ReadableStream());},'/api/v1/tasks/stream',{onOpen(){opened.resolve();},onMessage(){assert.fail();},onError(){assert.fail();}});
 await opened.promise;stream.close();await stream.done;assert.equal(calls,1);
});

test('parses split SSE events and cancels an active response on close',async()=>{
 const values=[],received=deferred();let controller,cancelled=0;
 const stream=openLiveStream(async()=>response(new ReadableStream({start(c){controller=c;},cancel(){cancelled++;}})),'/api/v1/tasks/stream',{
  onOpen(){const bytes=encode(': heartbeat\r\ndata: café\r\n\r\ndata: one\ndata: two\n\n');for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));},
  onMessage(data){values.push(data);if(values.length===2)received.resolve();},onError(){},retryMs:1,
 });
 await received.promise;stream.close();await stream.done;assert.deepEqual(values,['café','one\ntwo']);assert.equal(cancelled,1);
});

test('reconnect invokes the app client again and obtains fresh selector context',async()=>{
 let identity='tab-a',calls=0,stream;const identities=[];const seen=deferred();
 const client=async(path)=>{assert.equal(path,'/api/v1/chats/chat-id/stream');identities.push(identity);calls++;
  return response(new ReadableStream({start(c){c.enqueue(encode(`data: ${identity}\n\n`));if(calls===1)c.close();}}));};
 stream=openLiveStream(client,'/api/v1/chats/chat-id/stream',{onOpen(){},onMessage(value){if(value==='tab-a')identity='tab-b';else seen.resolve();},onError(){},retryMs:1});
 await seen.promise;stream.close();await stream.done;assert.deepEqual(identities,['tab-a','tab-b']);
});

test('401 and tenant/permission 403 stop without reconnecting or emitting data',async()=>{
 for(const status of [401,403]){let calls=0;const errors=[];const stream=openLiveStream(async()=>{calls++;return new Response('denied',{status});},'/api/v1/tasks/stream',{onOpen(){assert.fail('opened');},onMessage(){assert.fail('data');},onError(s){errors.push(s);},retryMs:1});await stream.done;assert.equal(calls,1);assert.deepEqual(errors,[status]);}
});

test('closing one tab stream leaves a sibling stream connected and receiving only its own data',async()=>{
 const received=deferred();const signals=[],controllers=[],values=[[],[]];
 const streams=[0,1].map(index=>openLiveStream(async(_path,options)=>{signals[index]=options.signal;return response(new ReadableStream({start(c){controllers[index]=c;}}));},'/api/v1/tasks/stream',{
  onOpen(){if(index===1)received.resolve();},onMessage(data){values[index].push(data);},onError(){assert.fail('sibling error');},
 }));
 await received.promise;streams[0].close();await streams[0].done;assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
 controllers[1].enqueue(encode('data: sibling-account\n\n'));await new Promise(resolve=>setTimeout(resolve,0));streams[1].close();await streams[1].done;
 assert.deepEqual(values,[[],['sibling-account']]);
});

test('aborted old identity never emits late response data or reconnects',async()=>{
 const ready=deferred();let resolveRequest,cancelled=0;
 const stream=openLiveStream(()=>{ready.resolve();return new Promise(resolve=>{resolveRequest=resolve;});},'/api/v1/tasks/stream',{onOpen(){assert.fail('stale open');},onMessage(){assert.fail('stale event');},onError(){assert.fail('stale error');}});
 await ready.promise;stream.close();resolveRequest(response(new ReadableStream({start(c){c.enqueue(encode('data: previous-account\n\n'));},cancel(){cancelled++;}})));await stream.done;assert.equal(cancelled,1);
});

test('unexpected response type fails closed and oversized event is cancelled',async()=>{
 let failures=0;const invalid=openLiveStream(async()=>new Response('{}',{headers:{'content-type':'application/json'}}),'/api/v1/tasks/stream',{onOpen(){assert.fail('json accepted');},onMessage(){assert.fail();},onError(){failures++;}});await invalid.done;assert.equal(failures,1);
 let stream;const failed=deferred();stream=openLiveStream(async()=>response(new ReadableStream({start(c){c.enqueue(encode('data: '+'x'.repeat(1024*1024+1)+'\n\n'));}})),'/api/v1/tasks/stream',{onOpen(){},onMessage(){assert.fail('oversized');},onError(){failed.resolve();},retryMs:10000});await failed.promise;stream.close();await stream.done;
});
