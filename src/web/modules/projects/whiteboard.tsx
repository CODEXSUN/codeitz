import '@excalidraw/excalidraw/index.css';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { useDesignSystem } from '@workspace/ui';
export type WhiteboardHandle = { serialize: ()=>string };
export default forwardRef<WhiteboardHandle,{content:string;onDirty:()=>void}>(function Whiteboard({content,onDirty},ref) {
  const api=useRef<ExcalidrawImperativeAPI|null>(null); const last=useRef('');
  const [initial]=useState<ExcalidrawInitialDataState>(()=>JSON.parse(content));
  const {preferences}=useDesignSystem();
  useImperativeHandle(ref,()=>({serialize:()=>api.current?serializeAsJSON(api.current.getSceneElements(),api.current.getAppState(),api.current.getFiles(),'local'):content}),[content]);
  return <div className="h-[600px] overflow-hidden rounded-lg border"><Excalidraw initialData={initial} excalidrawAPI={value=>{api.current=value;}} theme={preferences.mode==='dark'||(preferences.mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}
    onChange={(elements,_state,files)=>{const signature=JSON.stringify([elements.map(e=>[e.id,e.version,e.isDeleted]),Object.keys(files)]);if(last.current&&signature!==last.current)onDirty();last.current=signature;}}
    UIOptions={{canvasActions:{loadScene:false,saveToActiveFile:false,export:false}}}/></div>;
});
