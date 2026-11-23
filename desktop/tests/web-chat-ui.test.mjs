import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.CODEITZ_DESKTOP_PLAYWRIGHT ?? resolve('../.codeitz/browser-tools/node_modules/playwright-core/index.mjs')).href);
const server=await createServer({configFile:false,root:process.cwd(),resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 for(const theme of ['light','dark']){
  const context=await browser.newContext({colorScheme:theme}); const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/web-chat-fixture/`);
  await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
  await page.getByText('Response in progress…').waitFor();
  await page.evaluate(()=>window.sendWebFixture('**First line**\n','running'));
  await page.getByText('First line',{exact:true}).waitFor();
  const long = '**First line**\n' + 'Long response text. '.repeat(60) + 'Final marker';
  await page.evaluate(text=>window.sendWebFixture(text,'running'),long);
  const expand = page.getByRole('button',{name:'Show more'}); await expand.waitFor();
  assert.equal(await expand.getAttribute('aria-expanded'),'false'); await expand.click();
  assert.equal(await page.getByRole('button',{name:'Show less'}).getAttribute('aria-expanded'),'true');
  await page.evaluate(text=>window.sendWebFixture(text,'completed'),long);
  await page.getByText(/Final marker/).waitFor(); assert.equal(await page.getByText('Response in progress…').count(),0);
  await page.getByRole('button',{name:'Show less'}).click(); assert.equal(await page.getByRole('button',{name:'Show more'}).getAttribute('aria-expanded'),'false');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Web chat UI: synthetic SSE, incremental Markdown and completion passed in light and dark.');
} finally {await browser.close();await server.close();}
