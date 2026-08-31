import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function check(label) {
  const p = await b.newPage();
  for (const r of ['**/health','**/validate/**','**/reflect/**'])
    await p.route(r, x => x.fulfill({status:200,contentType:'application/json',body:'{"status":"ok","valid":true,"errors":[],"allowed":false,"results":{}}'}));
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(1400);
  await p.locator('#spotify-btn').click(); await p.waitForTimeout(300);
  const btn = (await p.locator('#spotify-connect-btn').textContent()).trim();
  const fieldVisible = await p.locator('#spotify-client-id').isVisible();
  const toggle = await p.locator('#spotify-advanced-toggle').count();
  const disabled = await p.locator('#spotify-connect-btn').isDisabled();
  console.log(`\n  ${label}`);
  console.log('    button        :', JSON.stringify(btn));
  console.log('    ID field shown:', fieldVisible);
  console.log('    advanced link :', toggle ? 'present' : 'absent');
  console.log('    button gated  :', disabled);
  if (toggle) {
    await p.locator('#spotify-advanced-toggle').click(); await p.waitForTimeout(200);
    console.log('    after clicking advanced, field shown:', await p.locator('#spotify-client-id').isVisible());
  }
  await p.close();
}
await check(process.argv[2]);
await b.close();
