import { useMemo, useSyncExternalStore } from 'react';
import { navigate } from '../../navigation';
import { parseLocation } from '../../../../contracts/project-navigation';
export * from '../../../../contracts/project-navigation';
export const go = navigate;
function snapshot(){return window.location.pathname+window.location.search;}
function subscribe(listener:()=>void){window.addEventListener('popstate',listener);window.addEventListener('codeitz:navigate',listener);return()=>{window.removeEventListener('popstate',listener);window.removeEventListener('codeitz:navigate',listener);};}
export function useProjectLocation(){const value=useSyncExternalStore(subscribe,snapshot);return useMemo(()=>parseLocation(value),[value]);}
