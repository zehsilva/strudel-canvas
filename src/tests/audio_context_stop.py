"""Regression for Strudel Stop: an active voice must be inaudible after Stop.

Run after installing playwright and Chromium:
    python src/tests/audio_context_stop.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]

def html():
    page = (ROOT / "index.html").read_text(encoding="utf-8")
    stub = """<script>
window.__audio={
  voices:0,hushes:0,delay:false,pending:null,
  ctx:{state:'running',suspends:0,resumes:0,
    async suspend(){this.state='suspended';this.suspends++},
    async resume(){this.state='running';this.resumes++}}
};
window.getAudioContext=()=>window.__audio.ctx;
window.__audible=()=>window.__audio.voices>0 &&
  window.__audio.ctx.state==='running';
window.initStrudel=async()=>{
  window.samples=()=>{};
  window.evaluate=async()=>{
    if(window.__audio.delay){window.__audio.delay=false;
      await new Promise(r=>window.__audio.pending=r)}
    window.__audio.voices++;
  };
  // Hush alone stops scheduling, not already-active notes.
  window.hush=()=>{window.__audio.hushes++};
};
</script>"""
    return page.replace("</head>",stub+"</head>")

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        page=await browser.new_page()
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        await page.set_content(html())
        await page.locator("#playButton").click()
        await page.wait_for_function("window.__audible()")
        await page.locator("#playButton").click()
        await page.wait_for_function("window.__audio.ctx.state==='suspended'")
        assert not await page.evaluate("window.__audible()")
        assert await page.evaluate("window.__audio.hushes>=2")
        await page.locator("#playButton").click()
        await page.wait_for_function("window.__audio.ctx.resumes>=1")
        await page.evaluate("window.__audio.delay=true")
        await page.locator("#applyLive").click()
        await page.wait_for_function("window.__audio.pending!==null")
        await page.locator("#playButton").click()
        await page.wait_for_function("window.__audio.ctx.state==='suspended'")
        assert not await page.evaluate("window.__audible()")
        await page.evaluate("window.__audio.pending()")
        await page.wait_for_function("window.__audio.hushes>=4")
        assert not await page.evaluate("window.__audible()")
        assert not errors, errors
        print("Hard Stop, resume, and delayed evaluation regression passed")
        await browser.close()

if __name__=="__main__":
    asyncio.run(main())
