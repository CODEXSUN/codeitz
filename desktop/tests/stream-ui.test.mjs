import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { resolve } from "node:path";
const {chromium} = await import(pathToFileURL(process.env.CODEITZ_DESKTOP_PLAYWRIGHT ?? resolve("../.codeitz/browser-tools/node_modules/playwright-core/index.mjs")).href);
const server = await createServer({configFile:false,root:process.cwd(),resolve:{dedupe:["react","react-dom"]},server:{host:"127.0.0.1",port:0}}); await server.listen();
const browser = await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
try {
 for (const mode of ["light","dark"]) {
  const context = await browser.newContext({colorScheme:mode}); const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/stream-fixture/`);
  await page.waitForFunction(() => typeof window.emitFixture === "function");
  await page.evaluate(() => window.emitFixture("**Streamed** ",true));
  await page.getByTestId("web").getByText("Streamed").waitFor();
  assert.equal(await page.getByTestId("desktop").locator("strong").innerText(),"Streamed");
  const content = "**Streamed** " + "progress ".repeat(500) + "final 🚀";
  await page.evaluate(value => window.emitFixture(value,true),content);
  await page.waitForFunction(() => { const text = document.querySelector('[data-testid=web]')?.textContent ?? ''; return text.length > 20 && text.length < 4400; });
  await page.waitForFunction(() => document.querySelector('[data-testid=web]')?.textContent?.includes('final 🚀'));
  assert.match(await page.getByTestId("desktop").innerText(), /final 🚀/);
  await page.evaluate(value => window.emitFixture(value,false),content);
  const more = page.getByRole("button",{name:"Show more"}); await more.waitFor();
  assert.equal(await more.getAttribute("aria-expanded"),"false");
  await more.click(); assert.match(await page.getByTestId("desktop").innerText(),/final 🚀/);
  await page.getByRole("button",{name:"Show less"}).click();
  assert.equal(await page.getByTestId("desktop").getByText("final 🚀").count(),0);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.evaluate(() => window.emitFixture("Short",true));
  await page.getByTestId("web").getByText("Short").waitFor();
  const immediate = "Short " + "reduced motion ".repeat(80);
  await page.evaluate(value => window.emitFixture(value,true),immediate);
  await page.waitForFunction(value => document.querySelector('[data-testid=web]')?.textContent === value.trim(), immediate);
  await context.close();
 }
 console.log("Synthetic SSE to web and desktop presentation: incremental Markdown, Unicode, completion and expansion passed in light/dark.");
} finally {await browser.close();await server.close();}
