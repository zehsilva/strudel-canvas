const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const melody = instrument => ({
  name: 'Keys', kind: 'melody', instrument, speed: 1, gain: 0.4,
  root: C.seq([C.ev('c4'), C.chord(['e4','g4'])])
});

test('piano URL is an ordinary JavaScript string, not mini-notation', () => {
  const code = C.emitProject({format: 'strudel-canvas-v1', bpm: 120, lanes:[melody('piano')]});
  assert.equal(code.split('\n')[2],
    "samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json')");
  assert.doesNotMatch(code, /samples\("/);
  assert.doesNotMatch(code, /"https?:\/\//);
  assert.doesNotThrow(() => new Function(code));
});

test('user sound packs and pitched sample maps never use mini-string quotes', () => {
  const code = C.emitProject({
    format:'strudel-canvas-v1', bpm:96, lanes:[melody('sc_keys')],
    customSamples:[{name:'sc_keys', baseNote:'c4', pitched:true, url:'https://example.com/keys/c4.wav'}],
    samplePacks:['github:eddyflux/crate']
  });
  assert.ok(code.includes("samples('github:eddyflux/crate')"));
  assert.ok(code.includes("'sc_keys': { 'c4': 'https://example.com/keys/c4.wav' }"));
  assert.doesNotMatch(code, /"https?:\/\//);
  assert.doesNotThrow(() => new Function(code));
});

test('apostrophes in public sample URLs are escaped safely', () => {
  const code = C.emitProject({
    format:'strudel-canvas-v1', bpm:90, lanes:[melody('sc_keys')],
    customSamples:[{name:'sc_keys', baseNote:'c4', pitched:true, url:"https://example.com/user's/audio.wav"}]
  });
  assert.ok(code.includes("user\\'s/audio.wav"));
  assert.doesNotThrow(() => new Function(code));
});
