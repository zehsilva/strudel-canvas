"""Regression: a delayed evaluate() must not restart audio after Stop."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

def page_html():
    root = (ROOT / "index.html").read_text()
    root = root.replace('<link rel="stylesheet" href="style.css">',
                        "<style>" + (ROOT / "style.css").read_text() + "</style>")
    stub = """<script>
window.__audio = {playing: false, count: 0, hushes: 0, release: null, delay: false};
window.initStrudel = async () => {
  window.samples = () => {};
  window.evaluate = async () => {
    const a = window.__audio;
    a.count++;
    if (a.delay) {
      a.delay = false;
      await new Promise(resolve => a.release = resolve);
    }
    a.playing = true;
  };
  window.hush = async () => {
    const a = window.__audio;
    a.playing = false;
    a.hushes++;
  };
};
</script>"""
    root = root.replace('<script src="engine-loader.js"></script>',
                        stub + "<script>" + (ROOT / "engine-loader.js").read_text() + "</script>")
    for name in ("core.js", "app.js"):
        root = root.replace(f'<script src="{name}"></script>',
                            "<script>" + (ROOT / name).read_text() + "</script>")
    return root

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.set_content(page_html())
        await page.locator("#playButton").click()
        await page.wait_for_function("window.__audio.playing")
        await page.evaluate("window.__audio.delay = true")
        await page.locator("#applyLive").click(no_wait_after=True)
        await page.wait_for_function("window.__audio.release !== null")
        before = await page.evaluate("window.__audio.hushes")
        await page.locator("#playButton").click()
        await page.wait_for_function("(n) => window.__audio.hushes > n", arg=before)
        assert not await page.evaluate("window.__audio.playing")
        await page.evaluate("window.__audio.release()")
        await page.wait_for_function("(n) => window.__audio.hushes >= n + 2", arg=before)
        assert not await page.evaluate("window.__audio.playing"), "evaluate restarted playback after Stop"
        assert await page.locator("#statusText").inner_text() == "Stopped"
        assert not errors, errors
        print("Stop/evaluate race regression passed")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
