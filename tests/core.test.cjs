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


test('mute keeps original stack slots with no cross-track reassignment',()=>{
 const mk=(name,sound)=>({name,kind:'drum',sound,root:C.makeSteps(4,[0,2],sound),speed:1,gain:.6,muted:false});
 const p={format:'strudel-canvas-v1',bpm:110,lanes:[mk('Kick','bd'),mk('Snare','sd'),mk('Hat','hh')]};
 const original=p.lanes.map(C.emitLane);
 p.lanes[1].muted=true;
 assert.deepEqual(p.lanes.map(C.emitLane),[original[0],'s("~")',original[2]]);
 assert.match(C.emitProject(p),/\/\/ Snare \(muted\)\n  s\(\"~\"\)/);
 p.lanes[1].muted=false;
 assert.deepEqual(p.lanes.map(C.emitLane),original);
 p.lanes.forEach(l=>l.muted=true);
 assert.deepEqual(p.lanes.map(C.emitLane),['s("~")','s("~")','s("~")']);
});
test('chord arpeggiator preserves original notes with nested timing',()=>{
 const root=C.seq([C.chord(['g4','c4','e4']),C.rest(),C.seq([C.chord(['c3','g3']),C.ev('d3')])]);
 const saved=JSON.stringify(root);
 assert.equal(C.emitMini(C.arpeggiateNode(root,{mode:'up',steps:6,octaves:1})),'[c4 e4 g4 c4 e4 g4] ~ [[c3 g3 c3 g3 c3 g3] d3]');
 assert.equal(C.emitMini(C.arpeggiateNode(root,{mode:'down',steps:3,octaves:1})),'[g4 e4 c4] ~ [[g3 c3 g3] d3]');
 assert.equal(C.emitMini(C.arpeggiateNode(root,{mode:'updown',steps:6,octaves:1})),'[c4 e4 g4 e4 c4 e4] ~ [[c3 g3 c3 g3 c3 g3] d3]');
 assert.equal(C.emitMini(C.arpeggiateNode(C.seq([C.chord(['c4','e4'])]),{mode:'up',steps:4,octaves:2})),'[c4 e4 c5 e5]');
 assert.equal(JSON.stringify(root),saved);
 assert.equal(C.emitMini(C.arpeggiateNode(root,{mode:'off'})),C.emitMini(root));
});
test('arpeggiator affects keys only and mute overrides lane safely',()=>{
 const k={name:'Keys',kind:'melody',instrument:'triangle',root:C.seq([C.chord(['c4','e4','g4']),C.rest()]),speed:1,gain:.4,arp:{mode:'down',steps:3,octaves:1}};
 const d={name:'Snare',kind:'drum',root:C.seq([C.ev('sd'),C.rest()]),speed:1,gain:.5};
 const p={format:'strudel-canvas-v1',bpm:100,lanes:[d,k]};
 assert.equal(C.validateProject(p),true);
 assert.match(C.emitLane(k),/\[g4 e4 c4\]/);
 assert.match(C.emitLane(d),/s\("sd ~"\)/);
 k.muted=true;
 assert.equal(C.emitLane(k),'s("~")');
 assert.match(C.emitProject(p),/\/\/ Keys \(muted\)\n  s\(\"~\"\)/);
 k.muted=false;
 assert.equal(C.emitMini(k.root),'[c4,e4,g4] ~');
 assert.throws(()=>C.validateArp({mode:'reverse',steps:4,octaves:1}));
});
test('collapsing recursive chord subdivisions retains a proper chord',()=>{
 const root=C.seq([C.seq([C.rest(),C.chord(['c4','e4'])])]);
 const collapsed=C.collapse(root,[0]);
 assert.equal(C.emitMini(collapsed),'[c4,e4]');
 assert.doesNotThrow(()=>C.validateNode(collapsed));
});
