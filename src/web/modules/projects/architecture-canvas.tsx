import { useState } from 'react';
import { Button, Input, NativeSelect, NativeSelectOption, Textarea } from '@workspace/ui';
import type { ArchitectureDocument, ArchitectureBlock } from '../../../../contracts/workspace';
export function ArchitectureCanvas({ value, onChange }: { value: ArchitectureDocument; onChange: (value: ArchitectureDocument) => void }) {
  const [selected, setSelected] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const block = value.blocks.find(item => item.id === selected);
  const update = (patch: Partial<ArchitectureBlock>) => onChange({ ...value, blocks: value.blocks.map(item => item.id === selected ? { ...item, ...patch } : item) });
  return <div className="grid overflow-hidden rounded-lg border lg:grid-cols-[minmax(0,1fr)_16rem]">
    <div className="overflow-auto bg-muted/20"><div className="relative h-[560px] min-w-[680px] bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[20px_20px]">
      <svg className="pointer-events-none absolute inset-0 h-full w-full"><defs><marker id="architecture-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>{value.connections.map((edge, index) => {
        const a=value.blocks.find(item => item.id===edge.from), b=value.blocks.find(item => item.id===edge.to);
        return a && b ? <line key={index} x1={a.x+150} y1={a.y+32} x2={b.x} y2={b.y+32} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#architecture-arrow)"/> : null;
      })}</svg>
      {value.blocks.map(item => <button type="button" key={item.id} aria-pressed={item.id===selected} className={`absolute w-[150px] touch-none rounded-lg border bg-card p-4 text-left text-sm shadow-sm ${item.id===selected ? 'ring-2 ring-primary' : ''}`} style={{left:item.x,top:item.y}}
        onPointerDown={event => { setSelected(item.id); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (event.buttons!==1) return; const area=event.currentTarget.parentElement!.getBoundingClientRect(); onChange({...value,blocks:value.blocks.map(b=>b.id===item.id?{...b,x:Math.max(0,Math.min(530,event.clientX-area.left-75)),y:Math.max(0,Math.min(490,event.clientY-area.top-25))}:b)}); }}>
        <span className="block font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.type}</span>
      </button>)}
    </div></div>
    <aside className="space-y-4 border-t bg-card p-4 lg:border-t-0 lg:border-l"><Button type="button" variant="outline" onClick={() => { const id=crypto.randomUUID(); onChange({...value,blocks:[...value.blocks,{id,name:'New block',type:'Process',description:'',x:40+value.blocks.length*25%400,y:50+value.blocks.length*55%400}]});setSelected(id); }}>Add block</Button>
      {block && <><label className="grid gap-1 text-sm">Name<Input value={block.name} onChange={e=>update({name:e.target.value})}/></label><label className="grid gap-1 text-sm">Type<NativeSelect value={block.type} onChange={e=>update({type:e.target.value})}>{['Input','Process','Service','Database','Output'].map(t=><NativeSelectOption key={t}>{t}</NativeSelectOption>)}</NativeSelect></label><label className="grid gap-1 text-sm">Description<Textarea value={block.description} onChange={e=>update({description:e.target.value})}/></label><div className="grid grid-cols-2 gap-2">{(['x','y'] as const).map(axis=><label key={axis} className="text-sm">{axis.toUpperCase()}<Input type="number" min={0} max={axis==='x'?530:490} value={block[axis]} onChange={e=>update({[axis]:Math.max(0,Math.min(axis==='x'?530:490,Number(e.target.value)))})}/></label>)}</div><Button type="button" variant="outline" onClick={()=>{onChange({blocks:value.blocks.filter(b=>b.id!==selected),connections:value.connections.filter(e=>e.from!==selected&&e.to!==selected)});setSelected('');}}>Remove block</Button></>}
      <h3 className="text-sm font-medium">Connections</h3>{[['From',from,setFrom],['To',to,setTo]].map(([label,val,setter])=><label key={String(label)} className="grid gap-1 text-sm">{String(label)}<NativeSelect value={String(val)} onChange={e=>(setter as (v:string)=>void)(e.target.value)}><NativeSelectOption value="">Select block</NativeSelectOption>{value.blocks.map(b=><NativeSelectOption key={b.id} value={b.id}>{b.name}</NativeSelectOption>)}</NativeSelect></label>)}<Button type="button" variant="outline" disabled={!from||!to||from===to} onClick={()=>{if(!value.connections.some(e=>e.from===from&&e.to===to))onChange({...value,connections:[...value.connections,{from,to}]});}}>Connect blocks</Button>
      {value.connections.map((edge,index)=><div key={index} className="flex items-center justify-between gap-2 text-xs"><span>{value.blocks.find(b=>b.id===edge.from)?.name} → {value.blocks.find(b=>b.id===edge.to)?.name}</span><Button type="button" size="sm" variant="ghost" aria-label="Remove connection" onClick={()=>onChange({...value,connections:value.connections.filter((_,i)=>i!==index)})}>×</Button></div>)}
    </aside>
  </div>;
}
