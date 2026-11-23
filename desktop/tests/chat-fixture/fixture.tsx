import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Composer } from "../../src/chat-ui/composer";
import { StreamingStatus } from "../../../src/web/components/streaming-status";
import { MessageList } from "../../src/chat-ui/message-list";
import "@workspace/ui/styles.css";
import "../../src/chat-ui/chat-ui.css";
function Fixture() {
 const [value, setValue] = useState(""); const [count, setCount] = useState(0); const attempts = useRef(0);
 return <><StreamingStatus label="Working" /><MessageList messages={[{id:"a",role:"agent",content:"Hello"},{id:"b",role:"user",content:"Hi"}]} /><output data-testid="count">{count}</output><Composer compact={location.search.includes("compact")} attachmentsDisabled={location.search.includes("noattachments")} modeSlot={<span>Mode</span>} coworkerSlot={<span>Coworker</span>} optionsSlot={<span>Options</span>} value={value} onChange={setValue} canSend={!!value.trim()} onSend={async () => { setCount(n => n + 1); await new Promise(resolve => setTimeout(resolve, 200)); setValue(""); }} onUpload={async (_file, {onProgress}) => { attempts.current++; onProgress(30); await new Promise(resolve => setTimeout(resolve, 100)); if (attempts.current === 1) throw Error("fixture"); return {id:"fixture"}; }} onFilesChange={() => {}} ocrResults={[{id:"fixture",name:"fixture.png",status:"ready",text:"CODEITZ TEST 4829"}]} /></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
