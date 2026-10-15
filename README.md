# Strudel Canvas

Visual, recursive, cycle-first music composition powered by [Strudel](https://strudel.cc/).

## Live app

After enabling GitHub Pages, the site will be at **https://zehsilva.github.io/strudel-canvas/**.

## GitHub Pages deployment

This repository is a static website. `index.html` in the root is fully self-contained apart from the external Strudel engine and sound samples. It does not need Node/npm, a backend, or a build step at deploy time.

1. Make this repository **public** (if it is not already).
2. Open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select **main** and **/(root)**, then **Save**.
5. After GitHub builds the site, visit https://zehsilva.github.io/strudel-canvas/.

Pushing future changes to `main` will republish the site automatically.

## Development

The maintainable source is under `src/`: `index.html` is the HTML template; `style.css`, `core.js`, `engine-loader.js`, and `app.js` contain the styling, pattern engine, CDN loader, and UI respectively.

After editing source files, rebuild the deployed single-file `index.html` with:

```bash
python3 build.py
```

## Interaction

- Click a rhythm cell to toggle its event. Double-click to subdivide or enter a nested sequence.
- Use Split x2/x3, Dive, and Up to compose hierarchical patterns.
- Use the inspector for Euclidean pulses, phase, gain, speed, and reversal.
- Generated Strudel code updates with the visual model. Arbitrary code can be entered in custom-code mode without reverse-parsing it into the visual model.
- Press Play to initialize the real Strudel web engine from a CDN. Use the engine badge and **Retry engine** for diagnostics.
- Import and export projects as JSON. Local project state is saved per-browser origin.

## Dependencies and limitations

Strudel is loaded over HTTPS from external CDNs (unpkg and jsDelivr) and requires network access. Audio starts only after browser user interaction. Some browsing environments disallow third-party scripts or audio. A CDN failure does **not** mean your internet connection is offline.

The interface is an early prototype supporting a documented subset of Strudel mini-notation, not a general visual parser for arbitrary Strudel JavaScript.

The application dynamically loads the separately distributed `@strudel/web` library. Review the upstream library license and attribution requirements before further redistribution. This repository does not contain the upstream Strudel engine or sample bank.

Source: initial implementation by collaborative development in ChatGPT, 2026.
## Transport reliability (v1.2)

Stop calls `hush()` immediately and again after any in-flight `evaluate()` finishes. Evaluations and the final stop use one serialized audio-operation queue, and stale playback sessions cannot update the UI. This fixes delayed audio restarting after Stop, including live edits during playback.

Browser regression test (requires Python Playwright and Chromium):

```bash
pip install playwright
python -m playwright install chromium
python src/tests/transport_race.py
```

The browser test mocks Strudel's audio functions to reproduce the ordering race; it does not verify actual audio output.

## Audio transport (v1.3)

**Stop** calls Strudel's `hush()` and additionally suspends the shared Web Audio `AudioContext` using `getAudioContext().suspend()`. This immediately silences audio processing, including active samples/synths/effect tails, even if the scheduler was already stopped. **Play** resumes the same context after the previous Stop operation is complete. The UI shows `Stopped · audio suspended` on confirmed hard stop, or `Stopped · scheduler only` when this browser/bundle does not expose the context. The engine diagnostics panel reports the actual audio context state.

Note: Suspended Web Audio freezes already-active voices; on resuming, the residual tail of a pre-stop note can briefly continue. A later version should provide per-voice shutdown or master-output gain control for tail-free restarts. This test verifies transport behavior with a simulated WebAudio context, not live audio.

```bash
python src/tests/audio_context_stop.py
```
