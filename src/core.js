/* Strudel Canvas Pattern IR. No DOM, audio, or external dependencies. */
(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  root.StrudelCanvasCore = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  let counter = 0;
  const id = () => `n${++counter}`;
  const ev = value => ({ id: id(), type: 'event', value: String(value) });
  const NOTE = /^[a-g](?:#|b)?[0-8]$/i;
  const chord = notes => ({id:id(),type:'chord',notes:[...new Set(notes)].sort((a,b)=>midi(a)-midi(b))});
  function midi(pitch){const m=String(pitch).match(/^([a-g])([#b]?)([0-8])$/i);if(!m)throw Error('Invalid note: '+pitch);const nums={c:0,d:2,e:4,f:5,g:7,a:9,b:11};return (+m[3]+1)*12+nums[m[1].toLowerCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0)}
  function flipNote(node,path,pitch){if(!NOTE.test(pitch))throw Error('Invalid piano pitch');const target=at(node,path);if(target.type==='sequence'||target.type==='euclidean')throw Error('Enter nested step to edit notes');let notes=target.type==='chord'?target.notes.slice():target.type==='event'&&NOTE.test(target.value)?[target.value]:[];notes=notes.includes(pitch)?notes.filter(n=>n!==pitch):[...notes,pitch];return replace(node,path,notes.length>1?chord(notes):notes.length===1?ev(notes[0]):rest())}

  const rest = () => ({ id: id(), type: 'rest' });
  const seq = children => ({ id: id(), type: 'sequence', children });
  const euc = (value,pulses,steps,rotation=0) => ({id:id(),type:'euclidean',value,pulses,steps,rotation});
  const mod = (a,n) => ((a % n) + n) % n;
  const gcd = (a,b) => {a=Math.abs(a); b=Math.abs(b); while(b){[a,b]=[b,a%b]} return a||1};
  const frac = (n,d=1) => {if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||d<=0) throw Error('Invalid rational time');const g=gcd(n,d);return {n:n/g,d:d/g}};
  const add = (a,b) => frac(a.n*b.d + b.n*a.d,a.d*b.d);
  const sub = (a,b) => frac(a.n*b.d - b.n*a.d,a.d*b.d);
  const mul = (a,b) => frac(a.n*b.n,a.d*b.d);
  const divide = (a,b) => frac(a.n*b.d,a.d*b.n);
  const num = a => a.n/a.d;
  const clone = v => JSON.parse(JSON.stringify(v));
  const at = (node,path=[]) => path.reduce((n,i) => {
    if(n.type!=='sequence'||!n.children[i])throw Error('No pattern at this path');return n.children[i];
  },node);
  function replace(node,path,next){
    if(!path.length)return next;
    if(node.type!=='sequence')throw Error('Expected a subdivision');
    const [i,...restPath]=path;
    if(i<0||i>=node.children.length)throw Error('Invalid step');
    return {...node,children:node.children.map((c,j)=>j===i?replace(c,restPath,next):c)};
  }
  function split(node,path,count=2){
    if(!Number.isInteger(count)||count<2||count>16)throw Error('Invalid split size');
    const target=at(node,path);
    if(target.type==='sequence')throw Error('Already subdivided');
    if(target.type==='euclidean')throw Error('Convert Euclidean rhythm to steps before splitting');
    return replace(node,path,seq([target,...Array.from({length:count-1},()=>rest())]));
  }
  function collapse(node,path){
    const target=at(node,path);
    if(target.type!=='sequence')throw Error('Not a subdivision');
    // Preserve a first encountered chord as a chord, not an invalid event
    // containing a comma-separated string.
    const firstSound = n => n.type==='sequence' ? n.children.map(firstSound).find(Boolean)
      : n.type==='euclidean' ? firstSound(makeManual(n))
      : n.type==='rest' ? null : n;
    const first=firstSound(target);
    return replace(node,path,first?clone(first):rest());
  }
  function toggle(node,path,value){
    const target=at(node,path);
    if(target.type!=='event'&&target.type!=='rest'&&target.type!=='chord')throw Error('Can only toggle an event, chord or a rest');
    return replace(node,path,target.type==='rest'?ev(value):rest());
  }
  function makeSteps(steps,hits,value){
    return seq(Array.from({length:steps},(_,i)=>hits.includes(i)?ev(typeof value==='function'?value(i):value):rest()));
  }
  // Bjorklund-style distribution consistent with the original prototype.
  function euclid(pulses,steps){
    if(!Number.isInteger(pulses)||!Number.isInteger(steps)||steps<1||pulses<0||pulses>steps)throw Error('Invalid Euclidean parameters');
    if(pulses===0)return Array(steps).fill(false);
    if(pulses===steps)return Array(steps).fill(true);
    let on=Array.from({length:pulses},()=>[true]),off=Array.from({length:steps-pulses},()=>[false]);
    while(Math.min(on.length,off.length)>1){let n=Math.min(on.length,off.length),merge=[];
      for(let j=0;j<n;j++)merge.push([...on[j],...off[j]]);
      on=[...merge,...on.slice(n)];off=off.slice(n);
    }
    return [...on,...off].flat().slice(0,steps);
  }
  function makeManual(node){
    if(node.type!=='euclidean')return node;
    const pattern=euclid(node.pulses,node.steps);const children=Array.from({length:node.steps},(_,i)=>pattern[mod(i-node.rotation,node.steps)]?ev(node.value):rest());
    return seq(children);
  }
  // Each descendant interval has exact rational boundaries in the master cycle.
  function flatten(node,start=frac(0),span=frac(1),path=[]){
    if(node.type==='sequence'){
      const dt=divide(span,frac(node.children.length));
      return node.children.flatMap((child,i)=>flatten(child,add(start,mul(dt,frac(i))),dt,[...path,i]));
    }
    if(node.type==='euclidean')return flatten(makeManual(node),start,span,path);
    return [{start,end:add(start,span),value:node.type==='event'?node.value:node.type==='chord'?node.notes.join(','):null,path,id:node.id}];
  }
  const SAFE_VALUE = /^[a-zA-Z0-9#:_+.-]{1,60}$/;
  function emitMini(node, nested=false){
    if(node.type==='rest')return '~';
    if(node.type==='event'){
      if(!SAFE_VALUE.test(node.value))throw Error('Unsupported event value');
      return node.value;
    }
    if(node.type==='chord'){
      if(!Array.isArray(node.notes)||node.notes.length<2||node.notes.length>12||node.notes.some(n=>!NOTE.test(n)))throw Error('Invalid chord');
      return '['+node.notes.join(',')+']';
    }
    if(node.type==='euclidean'){
      if(!SAFE_VALUE.test(node.value))throw Error('Unsupported Euclidean event');
      if(node.pulses===0)return '~';
      return `${node.value}(${node.pulses},${node.steps}${node.rotation?','+node.rotation:''})`;
    }
    if(node.type==='sequence'){
      if(!node.children.length)throw Error('Empty sequence');
      const text=node.children.map(n=>emitMini(n,true)).join(' ');
      return nested?'['+text+']':text;
    }
    throw Error('Unknown pattern node '+node.type);
  }
  // A deliberate, strict subset of Strudel mini-notation; unsupported syntax is rejected.
  function parseMini(text){
    const tokens=String(text).match(/\[|\]|[^\s\[\]]+/g)||[];
    let pos=0;
    function group(nested,depth){
      if(depth>8)throw Error('Maximum nesting depth is eight');
      const children=[];
      while(pos<tokens.length){let token=tokens[pos++];
        if(token===']'){if(!nested)throw Error('Unexpected closing bracket');if(!children.length)throw Error('Empty bracket group');return seq(children)}
        if(token==='['){
          const noteList=(tokens[pos]||'').split(',');
          if(noteList.length>1&&noteList.every(n=>NOTE.test(n))&&tokens[pos+1]===']'){pos+=2;children.push(chord(noteList));continue}
          children.push(group(true,depth+1));continue
        }
        if(token==='~'){children.push(rest());continue}
        const eu=token.match(/^([a-zA-Z0-9#:_+.-]+)\((\d+),(\d+)(?:,(-?\d+))?\)$/);
        if(eu){const p=+eu[2],s=+eu[3],r=+(eu[4]||0);if(s<1||s>64||p>s)throw Error('Euclidean range 0–64 steps');children.push(euc(eu[1],p,s,r));continue}
        if(!SAFE_VALUE.test(token))throw Error(`Unsupported token: ${token}`);
        children.push(ev(token));
      }
      if(nested)throw Error('Missing closing bracket');
      if(!children.length)throw Error('Empty pattern');
      return seq(children);
    }
    return group(false,0);
  }
  function cleanComment(value){return String(value||'Untitled').replace(/[\r\n\u2028\u2029]/g,' ').replace(/[^a-zA-Z0-9À-ÿ _.,:\-/]/g,'').slice(0,80)}
  const ARP_MODES=new Set(['off','up','down','updown']);
  function validateArp(arp){
    if(arp==null)return {mode:'off',steps:4,octaves:1};
    const mode=arp.mode||'off', steps=+(arp.steps??4), octaves=+(arp.octaves??1);
    if(!ARP_MODES.has(mode)||![2,3,4,6,8].includes(steps)||![1,2].includes(octaves))
      throw Error('Invalid arpeggiator parameters');
    return {mode,steps,octaves};
  }
  function pitchFromMidi(number){
    const names=['c','c#','d','eb','e','f','f#','g','ab','a','bb','b'];
    if(number<12||number>119)throw Error('Arpeggio note outside C0–B8');
    return names[number%12]+(Math.floor(number/12)-1);
  }
  // Non-destructive arpeggiation. Replace only chord leaves; each replacement
  // sequence occupies exactly the original chord step's duration.
  function arpeggiateNode(node,options){
    const arp=validateArp(options);
    if(arp.mode==='off')return node;
    if(node.type==='sequence')return {...node,children:node.children.map(child=>arpeggiateNode(child,arp))};
    if(node.type!=='chord')return node;
    const base=node.notes.slice().sort((a,b)=>midi(a)-midi(b));
    const playable=[];
    for(let octave=0;octave<arp.octaves;octave++)for(const pitch of base){
      const value=midi(pitch)+12*octave;
      if(value<=119)playable.push(pitchFromMidi(value));
    }
    if(!playable.length)return node;
    let ordered=arp.mode==='down'?playable.slice().reverse():playable.slice();
    if(arp.mode==='updown'&&ordered.length>2)
      ordered=ordered.concat(ordered.slice(1,-1).reverse());
    return seq(Array.from({length:arp.steps},(_,i)=>ev(ordered[i%ordered.length])));
  }
  function emitLane(lane){
    // Keep a stable slot with a proven Strudel mini-notation rest Pattern.
    // Use the documented s('~') constructor rather than a bare identifier:
    // @strudel/web eval scopes and versions can differ for exports such as silence.
    if(lane.muted)return 's("~")';
    const mini=emitMini(lane.kind==='melody'?arpeggiateNode(lane.root,lane.arp):lane.root);
    const speed=Number(lane.speed)||1;
    const gain=Number(lane.gain);
    if(speed<=0||speed>8||!Number.isFinite(gain)||gain<0||gain>2||!Number.isInteger(lane.rotation||0)||Math.abs(lane.rotation||0)>64)throw Error('Invalid lane modifiers');
    const drum=lane.kind!=='melody';
    // @strudel/web does not register General MIDI soundfonts. Treat historical
    // gm_* choices as explicit built-in synth approximations, never silent IDs.
    const patches={
      gm_piano:'piano',
      rhodes:'triangle', gm_epiano1:'triangle', gm_epiano2:'sine',
      organ:'square', gm_organ:'square',
      bass:'triangle', gm_acoustic_bass:'triangle',
      vibes:'sine', gm_vibraphone:'sine',
      musicbox:'sine', gm_music_box:'sine',
    };
    const instrument=lane.instrument||'piano';
    const voice=patches[instrument]||instrument;
    let code=drum?`s(${JSON.stringify(mini)})`:`note(${JSON.stringify(mini)}).s(${JSON.stringify(voice)})`;
    // Shape synthesized keyboard sounds, but never low-pass-filter sampled
    // piano or arbitrary user samples: the old blanket 750 Hz filter hid notes.
    if(!drum && ['rhodes','gm_epiano1'].includes(instrument))code+='.lpf(3300).attack(.003).decay(.32).sustain(.18).release(.18)';
    else if(!drum && ['gm_epiano2','vibes','gm_vibraphone','musicbox','gm_music_box'].includes(instrument))code+='.attack(.002).decay(.4).sustain(.08).release(.2)';
    else if(!drum && ['organ','gm_organ'].includes(instrument))code+='.lpf(2200).attack(.02).release(.15)';
    else if(!drum && ['bass','gm_acoustic_bass'].includes(instrument))code+='.lpf(1400).attack(.002).decay(.3).sustain(.15).release(.12)';
    if(lane.rotation){const n=lane.root.type==='sequence'?lane.root.children.length:lane.root.steps;
      if(lane.root.type==='euclidean'){
        // rotation is serialized directly in euclidean mini syntax if editing its own node.
        // lane.rotation should only be applied to manual sequences.
        code += `.late(${(lane.rotation/n).toFixed(6)})`;
      }else code+=`.late(${(lane.rotation/n).toFixed(6)})`;
    }
    if(speed>1)code+=`.fast(${speed})`;
    if(speed<1)code+=`.slow(${1/speed})`;
    if(lane.reverse)code+='.rev()';
    if(lane.room){const r=Number(lane.room);if(!Number.isFinite(r)||r<0||r>10)throw Error('Invalid reverb level');code+=`.room(${r.toFixed(2)})`}
    code+=`.gain(${gain.toFixed(2)})`;
    return code;
  }
  function validateSampleURL(url,pack=false){
    if(typeof url!=='string'||url.length>2048)throw Error('Invalid sample URL');
    // Strudel's github shortcut is only available for Strudel sample packs.
    if(pack&&/^github:[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[a-z0-9_.\/-]+)?$/i.test(url))return url;
    let u;
    try{u=new URL(url)}catch(_){throw Error('Use a public HTTPS URL')}
    if(u.protocol!=='https:'||u.username||u.password||!u.hostname||/\s/.test(url))throw Error('Sample URL must be public HTTPS');
    return u.href;
  }
  function validateSamples(project){
    const a=project.customSamples||[];const packs=project.samplePacks||[];
    if(!Array.isArray(a)||a.length>32||!Array.isArray(packs)||packs.length>12)throw Error('Too many samples or sample packs');
    const names=new Set();
    for(const sample of a){
      if(!sample||typeof sample.name!=='string'||!/^sc_[a-z0-9_]{1,28}$/.test(sample.name)||names.has(sample.name))throw Error('Invalid or duplicate sample alias (sc_name)');
      names.add(sample.name);validateSampleURL(sample.url);
      if(sample.pitched && !NOTE.test(sample.baseNote||'c4'))throw Error('Invalid sample base note');
    }
    for(const url of packs)validateSampleURL(url,true);
    return true;
  }
  function emitProject(project){
    const bpm=Number(project.bpm);
    if(!Number.isFinite(bpm)||bpm<35||bpm>240)throw Error('BPM must be 35–240');
    validateSamples(project);
    const custom=project.customSamples||[];
    const packStatements=(project.samplePacks||[]).map(u=>`samples(${JSON.stringify(u)})`);
    // In the reference REPL this manifest loads automatically. @strudel/web
    // starts with no external samples, so exports must include it explicitly.
    if(project.lanes.some(l=>l.kind==='melody'&&(!l.instrument||['piano','gm_piano'].includes(l.instrument))))
      packStatements.unshift('samples("https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json")');
    const map=Object.fromEntries(custom.map(s=>[s.name,s.pitched?{[s.baseNote||'c4']:s.url}:s.url]));
    if(custom.length)packStatements.push(`samples(${JSON.stringify(map,null,2)})`);
    const declarations=packStatements.length?packStatements.join('\n')+'\n':'';
    // One slot per lane, even when muted
    const active=project.lanes.map(emitLane);
    const body=active.length?`stack(\n${active.map((s,i)=>`  // ${cleanComment(project.lanes[i].name)}${project.lanes[i].muted?' (muted)':''}\n  ${s}`).join(',\n')}\n)`:'silence';
    return `// Strudel Canvas / ${cleanComment(project.title)}\n// Four beats per visual cycle; edits update the running Strudel pattern.\n${declarations}setcpm(${(bpm/4).toFixed(4)})\n${body}`;
  }
  function validateNode(node,depth=0){
    if(depth>12||!node||typeof node!=='object')throw Error('Invalid pattern structure');
    if(node.type==='sequence'){
      if(!Array.isArray(node.children)||node.children.length<1||node.children.length>64)throw Error('Invalid sequence length');
      node.children.forEach(c=>validateNode(c,depth+1));
    }else if(node.type==='event'){if(!SAFE_VALUE.test(node.value))throw Error('Invalid event value')}
    else if(node.type==='chord'){if(!Array.isArray(node.notes)||node.notes.length<2||node.notes.length>12||new Set(node.notes).size!==node.notes.length||node.notes.some(n=>!NOTE.test(n)))throw Error('Invalid chord')}
    else if(node.type==='euclidean'){
      if(!SAFE_VALUE.test(node.value)||!Number.isInteger(node.pulses)||!Number.isInteger(node.steps)||node.steps<1||node.steps>64||node.pulses<0||node.pulses>node.steps||!Number.isInteger(node.rotation))throw Error('Invalid Euclidean pattern');
    }else if(node.type!=='rest')throw Error('Unknown node type');
  }
  function validateProject(obj){
    if(!obj||obj.format!=='strudel-canvas-v1'||!Array.isArray(obj.lanes)||obj.lanes.length<1||obj.lanes.length>16)throw Error('Not a Strudel Canvas v1 project');
    if(!Number.isFinite(+obj.bpm)||obj.bpm<35||obj.bpm>240)throw Error('Invalid BPM');
    validateSamples(obj);
    obj.lanes.forEach(l=>{validateNode(l.root);validateArp(l.arp);emitLane({...l,muted:false})});
    return true;
  }
  return { ev,chord,flipNote,midi,rest,seq,euc,mod,frac,add,sub,mul,divide,num,at,replace,split,collapse,toggle,makeSteps,euclid,makeManual,flatten,emitMini,parseMini,emitLane,emitProject,validateNode,validateProject,validateSampleURL,validateSamples,validateArp,arpeggiateNode,clone};
});
