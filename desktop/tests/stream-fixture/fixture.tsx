import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownContent } from "@workspace/ui";
import { CompactText } from "../../src/chat-ui/compact-text";
import { useSmoothStreams } from "../../../src/web/components/use-smooth-streams";
import { openLiveStream } from "../../../src/web/live-stream";
import "@workspace/ui/styles.css";

declare global { interface Window { emitFixture: (content: string, streaming: boolean) => void; } }
function Fixture() {
 const [entry, setEntry] = useState({id:"reply",content:"",streaming:true});
 const shown = useSmoothStreams([entry], "fixture");
 useEffect(() => {
   let controller: ReadableStreamDefaultController<Uint8Array>;
   const encoder = new TextEncoder();
   const request: typeof fetch = async () => new Response(new ReadableStream({ start(value) { controller = value; } }), {headers:{"Content-Type":"text/event-stream"}});
   const stream = openLiveStream(request,"/fixture",{onOpen:()=>{},onError:()=>{},onMessage:data=>setEntry(JSON.parse(data))});
   window.emitFixture = (content, streaming) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({id:"reply",content,streaming})}\n\n`));
   return () => stream.close();
 }, []);
 return <><div data-testid="desktop"><CompactText text={shown.reply ?? ""} markdown streaming={entry.streaming}/></div><div data-testid="web"><MarkdownContent content={shown.reply ?? ""}/></div></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
