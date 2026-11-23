import { createRoot } from 'react-dom/client';
import { AgentChatPage } from '../../../src/web/modules/agent-chat/page';
import '@workspace/ui/styles.css';
const id = new URLSearchParams(location.search).get('id');
if (!id) throw new Error('Missing fixture conversation');
history.replaceState({},'',`/agent-chat/${id}`);
createRoot(document.getElementById('root')!).render(<AgentChatPage/>);
