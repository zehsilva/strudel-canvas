"""Browser test: mute affects the selected lane only, arpeggiation preserves piano-roll chords.
Requires Python Playwright + Chromium. Uses a mocked Strudel audio engine.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
STUB="""<script>
window.__mixes=[];
window.__ctx={state:'running',async suspend(){this.state='suspended'},async resume(){this.state='running'}};
window.getAudioContext=()=>window.__ctx;
window.initStrudel=async({prebake})=>{
 window.samples=()=>Promise.resolve();await prebake();
 window.evaluate=async x=>{window.__mixes.push(x)};
 window.hush=async()=>{};
};
</script>"""

async def test():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page()
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'index.html').read_text().replace('</head>',STUB+'</head>'))
  await page.locator('#playButton').click()
  await page.wait_for_function('window.__mixes.length>0')
  await page.locator('#autoApply').uncheck()
  before=await page.evaluate('window.__mixes.length')
  await page.locator('.lane-mute').nth(1).click()
  await page.wait_for_function('(n)=>window.__mixes.length>n',arg=before)
  code=await page.evaluate('window.__mixes.at(-1)')
  assert '// Caixa (muted)\n  silence' in code and '// Surdo\n  s("bd' in code
  assert '// Chocalho\n  s("hh' in code
  assert await page.locator('.lane-mute').nth(1).get_attribute('aria-pressed')=='true'
  await page.locator('.lane-name').nth(1).click()
  assert await page.locator('#muted').is_checked()
  await page.locator('#muted').uncheck()
  assert await page.locator('.lane-mute').nth(1).get_attribute('aria-pressed')=='false'
  await page.locator('#addKeysLane').click()
  await page.locator('.piano-cell[data-pitch="c4"][data-step="1"]').click()
  await page.locator('.piano-cell[data-pitch="g4"][data-step="1"]').click()
  await page.locator('#arpMode').select_option('up')
  await page.locator('#arpOctaves').select_option('2')
  assert '[c4 g4 c5 g5]' in await page.locator('#codeEditor').input_value()
  assert '[c4,g4]' in await page.locator('#miniInput').input_value()
  await page.locator('#arpMode').select_option('off')
  assert '[c4,g4]' in await page.locator('#codeEditor').input_value()
  await page.locator('#playButton').click()
  await page.wait_for_function('window.__ctx.state==="suspended"')
  assert not errors,errors
  await browser.close()
  print('PASS: mute isolation, live mute, inspector, chord arpeggiator, Stop')

if __name__=='__main__':asyncio.run(test())
