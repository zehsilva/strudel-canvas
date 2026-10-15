const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
test('piano chord edits and mini-notation roundtrip',()=>{
 const p=C.seq([C.rest(),C.ev('c4')]);
 const next=C.flipNote(C.flipNote(p,[0],'e4'),[0],'g4');
 assert.equal(C.emitMini(next),'[e4,g4] c4');
 assert.equal(C.emitMini(C.parseMini(C.emitMini(next))),C.emitMini(next));
 assert.equal(C.emitMini(C.flipNote(next,[0],'e4')),'g4 c4');
});
test('public samples, pitched map and pack generate Strudel',()=>{
 const project={format:'strudel-canvas-v1',bpm:120,
  lanes:[{name:'Keys',kind:'melody',instrument:'sc_piano',root:C.seq([C.chord(['c4','e4']),C.rest()]),speed:1,gain:.4}],
  customSamples:[{name:'sc_piano',url:'https://example.com/piano.wav',pitched:true,baseNote:'c4'}],
  samplePacks:['github:eddyflux/crate']};
 assert.equal(C.validateProject(project),true);
 const strudel=C.emitProject(project);
 assert.match(strudel,/samples\("github:eddyflux\/crate"\)/);
 assert.match(strudel,/"sc_piano": \{/);
 assert.match(strudel,/note\("\[c4,e4\] ~"\)\.s\("sc_piano"\)/);
});
test('only public HTTPS sample URLs permitted',()=>{
 for(const x of ['file:///x.wav','javascript:alert(1)','http://example.com/x.wav','data:audio/ogg,xyz'])assert.throws(()=>C.validateSampleURL(x));
});

test('sampled grand piano includes registration and is not muted by a low-pass filter',()=>{
 const project={format:'strudel-canvas-v1',bpm:120,lanes:[{name:'Keys',kind:'melody',instrument:'piano',root:C.seq([C.ev('c4'),C.chord(['e4','g4']),C.rest()]),gain:.5,speed:1}]};
 const code=C.emitProject(project);
 assert.match(code,/samples\("https:\/\/raw\.githubusercontent\.com\/felixroos\/dough-samples\/main\/piano\.json"\)/);
 assert.match(code,/note\("c4 \[e4,g4\] ~"\)\.s\("piano"\)/);
 assert.doesNotMatch(code,/\.lpf\(750\)/);
});

test('all built-in and legacy keyboard patches have playable Strudel oscillator aliases',()=>{
 for(const instrument of ['rhodes','organ','bass','vibes','musicbox','gm_epiano1','gm_epiano2','gm_organ','gm_vibraphone','gm_music_box','gm_acoustic_bass']){
   const code=C.emitProject({format:'strudel-canvas-v1',bpm:100,lanes:[{name:'Keys',kind:'melody',instrument,root:C.seq([C.ev('c4'),C.ev('g4')]),speed:1,gain:.4}]});
   assert.doesNotMatch(code,/\.s\("gm_/);
   assert.match(code,/\.s\("(triangle|square|sine)"\)/);
 }
});
