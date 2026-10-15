/* Strudel Canvas UI + the @strudel/web bridge (AGPL upstream). */
(() => {
  'use strict';
  const C = window.StrudelCanvasCore;
  const E = window.StrudelCanvasEngineLoader;
  const $ = id => document.getElementById(id);
  const colors = { bd:'#9cebb7',sd:'#bb9ffc',hh:'#83caff',oh:'#f69ac0',rim:'#ffbd7c',cp:'#f9b0bd',lt:'#d9aaff',c2:'#f5ce83' };
  const drumSources={bd:'Kick',sd:'Snare',hh:'Closed hat',oh:'Open hat',rim:'Rimshot',cp:'Clap',lt:'Low tom',sh:'Shaker',cb:'Cowbell',perc:'Percussion'};
  const keysSources={piano:'Grand piano · sampled',rhodes:'Rhodes-style keys · synth',organ:'Organ-style keys · synth',bass:'Bass keys · synth',vibes:'Vibraphone-style · synth',musicbox:'Music box-style · synth',triangle:'Triangle synth',sine:'Sine synth',sawtooth:'Saw synth',square:'Square synth'};
  // Older sketches used unregistered gm_* names. Preserve their note patterns
  // and switch those instruments to playable synthesizer approximations.
  const legacyKeys={gm_piano:'piano',gm_epiano1:'rhodes',gm_epiano2:'rhodes',gm_acoustic_bass:'bass',gm_organ:'organ',gm_vibraphone:'vibes',gm_music_box:'musicbox'};
  const PIANO_MAP_URL='https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json';
  const pianoNotes=(octave)=>Array.from({length:36},(_,i)=>{const midi=(octave+4)*12-1-i;const names=['c','c#','d','eb','e','f','f#','g','ab','a','bb','b'];return names[midi%12]+(Math.floor(midi/12)-1)});
  const sampleLibrary=()=>project.customSamples||[];
  const packs=()=>project.samplePacks||[];

  const makeLane=(name,sound,steps,hits,description,kind='drum')=>({id:name.toLowerCase().replace(/\W/g,'-'),name,sound,kind,description,root:C.makeSteps(steps,hits,kind==='melody' ? i=>['c2','g2','eb2','bb1'][i%4]:sound),rotation:0,instrument:kind==='melody'?'piano':undefined,speed:1,gain:sound==='hh'?.35:sound==='bd'?.82:kind==='melody'?.26:.55,reverse:false,muted:false,room:0});
  function makePreset(key){
    if(key==='broken')return {format:'strudel-canvas-v1',title:'Broken, connected.',description:'Interlocking pulses across mismatched subdivisions.',bpm:128,lanes:[
      makeLane('Kick','bd',16,[0,3,7,10,14],'Asymmetric low-end rhythm.'),
      makeLane('Snare','sd',16,[4,11,13],'Off-center backbeat.'),
      makeLane('Hats','hh',12,[0,2,4,6,8,10],'Twelve steps within one cycle.'),
      makeLane('Rim','rim',7,[0,2,5],'Seven-part subdivision.'),
      makeLane('Bass','c2',8,[0,3,6],'Counter-rhythm in low notes.','melody')]};
    if(key==='minimal')return {format:'strudel-canvas-v1',title:'The geometry of groove.',description:'Euclidean distributions over shared cyclic time.',bpm:112,lanes:[
      {...makeLane('Pulse','bd',8,[0],'Three of eight pulses.'),root:C.euc('bd',3,8,0)},
      {...makeLane('Rim','rim',13,[0],'Five of thirteen pulses.'),root:C.euc('rim',5,13,1)},
      {...makeLane('Hat','hh',16,[0],'Nine of sixteen pulses.'),root:C.euc('hh',9,16,0)},
      {...makeLane('Snare','sd',8,[0],'Two of eight pulses.'),root:C.euc('sd',2,8,2)}]};
    const caixa=makeLane('Caixa','sd',16,[3,4,7,11,12,15],'Snare syncopation with recursive ornaments.');
    caixa.root=C.split(caixa.root,[7],2);
    caixa.root=C.replace(caixa.root,[7,1],C.ev('sd'));
    const chocalho=makeLane('Chocalho','hh',16,[0,2,4,6,8,10,12,14],'A cycling shaker texture with microtiming structures.');
    chocalho.root=C.split(chocalho.root,[4],3);
    chocalho.root=C.replace(chocalho.root,[4,1],C.ev('hh'));
    const agogo=makeLane('Agogô','rim',12,[0,3,5,8,10],'Twelve subdivisions against sixteen.');
    return {format:'strudel-canvas-v1',title:'Samba, unfolded.',description:'A living samba-inspired pattern constructed from independent nested layers.',bpm:102,lanes:[
      makeLane('Surdo','bd',16,[0,7,8,15],'Deep pulse anchoring the rhythm.'),caixa,chocalho,agogo,
      makeLane('Bass','c2',8,[0,3,4,7],'Low notes complement the drum pulse.','melody')]};
  }
  let project, presetKey='samba', selected=0, focus=[], picked=0, view='lanes', playing=false, startedAt=0,
    raf=0, activeCodeMode='visual', customCode='', engineInitialized=false, audioFailure='', queue=Promise.resolve(), pendingStop=Promise.resolve(), playbackRevision=0, mixRevision=0, applyTimer=null, clickTimer=null, toastTimer=null,
    lastEvalError=null, sampleWarnings=[];
  function selectedLane(){return project.lanes[selected]}
  function rotationOf(l){return l.root.type==='euclidean'?l.root.rotation:(l.rotation||0)}
  function setRotation(l,r){if(l.root.type==='euclidean'){l.root={...l.root,rotation:r};l.rotation=0}else l.rotation=r}
  function accent(l){return colors[l.sound]||'#9cf1be'}
  function clone(o){return C.clone(o)}
  function notify(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3100)}
  function selectedSequence(){const n=C.at(selectedLane().root,focus);return n.type==='euclidean'?C.makeManual(n):n}
  function currentChildren(){return selectedSequence().children||[]}
  function selectedPath(){return [...focus,picked]}
  function focusedFraction(path=focus){let root=selectedLane().root;let start=C.frac(0),span=C.frac(1);
    for(const index of path){const node=root.type==='euclidean'?C.makeManual(root):root;
      if(node.type!=='sequence')break;
      const segment=C.divide(span,C.frac(node.children.length));start=C.add(start,C.mul(segment,C.frac(index)));span=segment;root=node.children[index];}
    return {start,end:C.add(start,span)};
  }
  function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x))}
  function manualRoot(){const l=selectedLane();if(l.root.type==='euclidean')l.root=C.makeManual(l.root)}
  function meaningful(){
    project.bpm=clamp(Math.round(+project.bpm||102),35,240);
    ++mixRevision;persist();render();
    if(playing&&$('autoApply').checked&&activeCodeMode==='visual')debounceApply();
  }
  function persist(){try{localStorage.setItem('strudel-canvas-v1',JSON.stringify(project))}catch(_) {}}
  function setLaneMuted(lane,muted){
    if(activeCodeMode!=='visual'){
      notify('Visual lane mute is unavailable in Custom code mode · return to visual');
      render();return;
    }
    if(lane.muted===muted)return;
    lane.muted=muted;
    meaningful();
    // Mute/unmute is a transport action, not a passive edit: ignore the
    // optional Auto-evaluate preference. Always transmit the latest mix.
    if(playing){
      clearTimeout(applyTimer);
      applyToEngine().catch(e=>notify('Mute update failed: '+(e.message||e)));
    }
  }
  function mutateRoot(fn){const l=selectedLane();l.root=fn(l.root);meaningful()}
  function toggleAt(index){
    if(focus.length===0)manualRoot();
    const l=selectedLane();const node=C.at(l.root,[...focus,index]);
    picked=index;
    if(node.type==='sequence'){render();notify('Nested cell selected · double-click or Enter to zoom in');return}
    l.root=C.toggle(l.root,[...focus,index],l.kind==='melody'?'c2':l.sound);
    meaningful();
  }
  function enterCell(index=picked){
    const l=selectedLane();let path=[...focus,index];
    if(C.at(l.root,focus).type==='euclidean')manualRoot();
    const node=C.at(l.root,path);
    if(node.type!=='sequence'){
      if(focus.length>=7){notify('Maximum visual depth: 8 levels');return}
      l.root=C.split(l.root,path,2);
    }
    focus=path;picked=0;meaningful();
  }
  function moveUp(){if(!focus.length)return;const last=focus.pop();picked=last;render()}
  function splitSelected(n){
    manualRoot();const l=selectedLane(),path=selectedPath();
    const node=C.at(l.root,path);
    try {if(node.type==='sequence'){notify('Already a nested sequence. Enter it to edit.');return}
      l.root=C.split(l.root,path,n);meaningful();notify(`Step subdivided ×${n} without changing cycle length`);
    }catch(e){notify(e.message)}
  }
  function collapseSelected(){manualRoot();let path=selectedPath();
    try{selectedLane().root=C.collapse(selectedLane().root,path);meaningful()}
    catch(e){notify('Select a nested step before collapsing')}
  }
  function euclideanize(){const l=selectedLane();const steps=l.root.type==='euclidean'?l.root.steps:l.root.children.length;const p=clamp(+$('pulsesRange').value,0,steps);
    l.root=C.euc(l.kind==='melody'?'c2':l.sound,p,steps,0);l.rotation=0;focus=[];picked=0;meaningful();notify('Euclidean structure retained as a symbolic pattern')}
  function vary(){
    project.lanes.forEach(l=>{
      if(l.kind==='melody')return;
      let node=C.makeManual(l.root);
      if(node.type!=='sequence')return;
      const arr=node.children.slice();let count=Math.max(1,Math.floor(arr.length*.10));
      for(let k=0;k<count;k++) {let index=Math.floor(Math.random()*arr.length),n=arr[index];if(n.type==='sequence')continue;arr[index]=n.type==='rest'?C.ev(l.sound):C.rest()}
      l.root={...node,children:arr};
    });focus=[];picked=0;meaningful();notify('Variation created · nested groups preserved')
  }
  function selectLane(i){selected=i;focus=[];picked=0;render()}
  function setView(v){view=v;document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===v));
    for(const [id,kind] of [['patternPanel','lanes'],['pianoPanel','piano'],['samplesPanel','samples'],['orbitPanel','orbit'],['transformsPanel','transforms']])$(id).classList.toggle('is-hidden',v!==kind);
    if(v==='orbit')drawAllOrbits();if(v==='transforms')renderGraph();if(v==='piano')renderPiano();if(v==='samples')renderSamples();}

  function makeButton(label,className,click,title=''){
    const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.title=title;b.onclick=click;return b;
  }
  function fireClick(fn){return e=>{clearTimeout(clickTimer);if(e.shiftKey){splitSelected(2);return}clickTimer=setTimeout(fn,180)}}
  function visualRootChildren(l){return l.root.type==='euclidean'?C.makeManual(l.root).children:l.root.children}
  function displayEvent(n){if(n.type==='rest')return '~';if(n.type==='event')return n.value;if(n.type==='chord')return n.notes.join('+');
    if(n.type==='euclidean')return `${n.pulses}/${n.steps}`;return '▤'}
  function renderLanes(){let target=$('lanes');target.innerHTML='';
    project.lanes.forEach((l,i)=>{
      const row=document.createElement('div');row.className='pattern-lane';const color=accent(l);
      const name=makeButton('',`lane-name ${selected===i?'active':''}`,()=>selectLane(i),'Inspect '+l.name);
      const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=color;
      const info=document.createElement('span');const b=document.createElement('strong');b.textContent=l.name+(l.muted?' (mute)':'');const sm=document.createElement('small');sm.textContent=l.kind==='melody'?'Melody':l.sound+' · '+l.speed+'×';info.append(b,sm);name.append(swatch,info);
      const grid=document.createElement('div');grid.className='pad-grid';const children=visualRootChildren(l);
      grid.style.gridTemplateColumns=`repeat(${children.length},minmax(0,1fr))`;
      children.forEach((node,j)=>{
        const isOn=node.type==='event'||node.type==='chord'||node.type==='euclidean';
        const nested=node.type==='sequence';
        const pad=makeButton(nested?'▤':(children.length<=12?displayEvent(node):''),`pad ${isOn?'active':''} ${nested?'nested':''} ${selected===i&&!focus.length&&picked===j?'selected-pad':''}`.trim(),null,
          `${l.name} · step ${j+1}; click to toggle; double-click to subdivide`);
        pad.style.setProperty('--lane',color);pad.dataset.lane=i;pad.dataset.step=j;
        pad.onclick=e=>{clearTimeout(clickTimer);if(selected!==i){selectLane(i)}if(e.shiftKey){selected=i;picked=j;splitSelected(2);return}
          clickTimer=setTimeout(()=>{selected=i;focus=[];toggleAt(j)},180)};
        pad.ondblclick=e=>{clearTimeout(clickTimer);selected=i;focus=[];enterCell(j)};
        if(nested){const t=document.createElement('span');t.className='subtick';pad.appendChild(t)}
        grid.appendChild(pad)
      });
      const mute=makeButton(l.muted?'MUTED':'ON',`lane-mute ${l.muted?'is-muted':'is-on'}`,
        ()=>setLaneMuted(l,!l.muted), l.muted?'Unmute '+l.name:'Mute '+l.name);
      mute.setAttribute('aria-label',(l.muted?'Unmute ':'Mute ')+l.name);
      mute.setAttribute('aria-pressed',String(!!l.muted));
      mute.disabled=activeCodeMode!=='visual';
      row.classList.toggle('is-muted',!!l.muted);
      row.append(name,grid,mute);target.appendChild(row);
    });$('layerCount').textContent=`${project.lanes.filter(l=>!l.muted).length} of ${project.lanes.length} lanes audible`;
  }
  function renderLens(){
    let l=selectedLane();const root=C.at(l.root,focus);
    if(root.type!=='sequence'&&root.type!=='euclidean'){focus=[];picked=0}
    let children=currentChildren();picked=clamp(picked,0,Math.max(0,children.length-1));
    const crumbs=$('crumbs');crumbs.innerHTML='';crumbs.appendChild(makeButton(l.name,'crumb',()=>{focus=[];picked=0;render()},'Root layer'));
    let traversed=[];
    for(const index of focus){traversed.push(index);const sep=document.createElement('span');sep.className='crumb-separator';sep.textContent='›';crumbs.appendChild(sep);
      const path=traversed.slice();crumbs.appendChild(makeButton('Step '+(index+1),'crumb',()=>{focus=path;picked=0;render()}))}
    const f=focusedFraction();$('focusTime').textContent=`${f.start.n}/${f.start.d} → ${f.end.n}/${f.end.d} cycle`;
    $('lensDescription').textContent=focus.length?`Zoom ${focus.length} · editing subdivisions inside step ${focus.at(-1)+1}`:`Root cycle · choose a step, then split or enter`;
    const box=$('lensSteps');box.innerHTML='';children.forEach((node,i)=>{
      const nested=node.type==='sequence';const on=node.type==='event'||node.type==='chord'||node.type==='euclidean';
      const p=makeButton('',`lens-cell ${on?'active':''} ${nested?'nested':''} ${picked===i?'selected':''}`.trim(),null);
      p.style.setProperty('--accent',accent(l));p.setAttribute('aria-label',`Step ${i+1}: ${displayEvent(node)}`);
      const idx=document.createElement('span');idx.className='idx';idx.textContent=String(i+1);
      const val=document.createElement('span');val.className='val';val.textContent=displayEvent(node);
      p.append(idx,val);
      if(nested){const shape=document.createElement('span');shape.className='nested-indicator';shape.textContent=`↳ ${node.children.length} steps`;p.appendChild(shape)}
      p.onclick=e=>{clearTimeout(clickTimer);if(e.shiftKey){picked=i;splitSelected(2);return}clickTimer=setTimeout(()=>toggleAt(i),180)};
      p.ondblclick=e=>{clearTimeout(clickTimer);enterCell(i)};
      box.appendChild(p);
    });
    $('goUp').disabled=!focus.length;$('dive').disabled=focus.length>=8;
    $('collapse').disabled=children[picked]?.type!=='sequence';
  }
  function svg(tag,attrs={}) {let e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,value);return e}
  function drawOrbit(target,l,size=238){
    target.innerHTML='';let children=visualRootChildren(l),n=children.length,r=size*.335,mid=size/2,color=accent(l);
    let el=svg('svg',{viewBox:`0 0 ${size} ${size}`,role:'img','aria-label':`${l.name} cyclic pattern`});
    el.appendChild(svg('circle',{cx:mid,cy:mid,r,stroke:'#42505b','stroke-width':2,fill:'none'}));
    children.forEach((node,i)=>{
      const theta=i/n*Math.PI*2-Math.PI/2,x=mid+Math.cos(theta)*r,y=mid+Math.sin(theta)*r;
      const isOn=node.type==='event'||node.type==='chord'||node.type==='euclidean',nested=node.type==='sequence';
      const dot=svg('circle',{cx:x,cy:y,r:nested?7:isOn?6.7:3.7,fill:nested?'#bb9ffc':isOn?color:'#4c5965',stroke:selectedLane()===l&&picked===i&&!focus.length?'#fff':'none','stroke-width':2});
      dot.style.cursor='pointer';dot.addEventListener('click',()=>{selectLane(project.lanes.indexOf(l));picked=i;render()});
      el.appendChild(dot);
      if(nested){el.appendChild(svg('circle',{cx:x,cy:y,r:2,fill:'#251a39'}))}
    });
    const big=svg('text',{x:mid,y:mid-2,'font-size':size*.115,fill:'#ecf3f0','text-anchor':'middle'});big.textContent=n;
    const small=svg('text',{x:mid,y:mid+17,'font-size':10,fill:'#90a4a9','text-anchor':'middle'});small.textContent='steps / cycle';el.append(big,small);target.appendChild(el);
  }
  function drawAllOrbits(){const box=$('allOrbits');box.innerHTML='';let n=project.lanes.length;
    const w=480,h=340,cx=w/2,cy=h/2;const el=svg('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':'Rhythmic rings'});
    el.style.width='min(100%, 480px)';
    project.lanes.forEach((l,i)=>{
      const steps=visualRootChildren(l),r=56+i*21,paint=accent(l);
      el.appendChild(svg('circle',{cx,cy,r,fill:'none',stroke:'#3b4854','stroke-width':1.4}));
      steps.forEach((node,j)=>{let theta=j/steps.length*Math.PI*2-Math.PI/2,x=cx+r*Math.cos(theta),y=cy+r*Math.sin(theta);
        let on=node.type==='event'||node.type==='chord'||node.type==='euclidean',nested=node.type==='sequence';
        let dot=svg('circle',{cx:x,cy:y,r:nested?4.7:on?4.1:2,fill:nested?'#cdb0ff':on?paint:'#4f5b65'});dot.style.cursor='pointer';
        dot.addEventListener('click',()=>{selected=i;picked=j;setView('lanes');render()});el.append(dot);
      });
    });
    const txt=svg('text',{x:cx,y:cy+4,'text-anchor':'middle','font-size':12,fill:'#eff7f3'});txt.textContent='ONE CYCLE';el.appendChild(txt);box.appendChild(el);
  }
  function renderGraph(){const l=selectedLane(),target=$('transformGraph');target.innerHTML='';const steps=l.root.type==='euclidean'?l.root.steps:l.root.children.length;
    let nodes=[['Source',l.kind==='melody'?'keys '+(l.instrument||'piano'):'sample '+l.sound],['Structure',l.root.type==='euclidean'?`${l.root.pulses} in ${steps} Euclidean`:`${steps} steps · recursive`],...(l.kind==='melody'?[['Arpeggiator',C.validateArp(l.arp).mode]]:[]),['Rotation',rotationOf(l)+' / '+steps+' steps'],['Time',l.speed+'× '+(l.reverse?'reverse':'forward')],['Dynamics',l.muted?'MUTED':l.gain.toFixed(2)+' gain'],['Output',l.muted?'silence':'Strudel audio']];
    nodes.forEach((node,i)=>{const el=document.createElement('div');el.className='transform '+(i===1?'transform-primary':'');const b=document.createElement('strong');b.textContent=node[0];const sm=document.createElement('small');sm.textContent=node[1];el.append(b,sm);target.appendChild(el);if(i<nodes.length-1){const connector=document.createElement('div');connector.className='connector';target.appendChild(connector)}})
  }
  function renderInspector(){
    const l=selectedLane(),steps=l.root.type==='euclidean'?l.root.steps:l.root.children.length;
    $('inspectorName').textContent=l.name;$('inspectorDescription').textContent=l.description;
    $('inspectorMode').textContent=l.root.type==='euclidean'?'Euclidean':'Recursive';
    $('stepsValue').textContent=steps;
    $('pulseValue').textContent=(l.root.type==='euclidean'?l.root.pulses:C.flatten(l.root).filter(h=>h.value!==null).length)+' / '+steps;
    $('pulsesRange').max=steps;$('pulsesRange').value=l.root.type==='euclidean'?l.root.pulses:Math.min(steps,C.flatten(l.root).filter(h=>h.value!==null).length);
    $('rotationRange').min=-(steps-1);$('rotationRange').max=steps-1;$('rotationRange').value=rotationOf(l);
    $('rotationValue').textContent=rotationOf(l)+' steps';
    $('laneType').value=l.kind==='melody'?'melody':'drum';
    $('drumSoundField').hidden=l.kind==='melody';$('keysSoundField').hidden=l.kind!=='melody';
    populateSoundSelects();

    $('speed').value=String(l.speed);$('speedValue').textContent=l.speed+'×';$('gain').value=l.gain;$('gainValue').textContent=Number(l.gain).toFixed(2);
    $('reverse').checked=!!l.reverse;$('muted').checked=!!l.muted;
    $('muted').disabled=activeCodeMode!=='visual';
    $('arpeggiatorField').hidden=l.kind!=='melody';
    const arp=C.validateArp(l.arp);
    $('arpMode').value=arp.mode;$('arpSteps').value=String(arp.steps);$('arpOctaves').value=String(arp.octaves);
    $('arpHint').textContent=arp.mode==='off'?'Play chord notes simultaneously':
      `${arp.steps} notes within each chord cell · ${arp.octaves} octave${arp.octaves===1?'':'s'}`;
    $('miniInput').value=C.emitMini(l.root);
    drawOrbit($('singleOrbit'),l);
  }
  function effectiveCode(){return activeCodeMode==='custom'?customCode:C.emitProject(project)}
  function renderCode(){if(activeCodeMode==='visual')$('codeEditor').value=C.emitProject(project);
    $('codeModeLabel').textContent=activeCodeMode==='visual'?'· generated from visual IR':'· custom Strudel · visually unsynchronized';
    $('editCode').textContent=activeCodeMode==='visual'?'Edit code':'Custom mode';
    $('codeEditor').readOnly=activeCodeMode==='visual';
    $('returnVisual').hidden=activeCodeMode==='visual';
    $('codeNotice').textContent=activeCodeMode==='visual'?'Visual edits regenerate this code.':'Custom code runs as written; visual changes are not merged into it.';
  }
  function render(){
    $('bpm').value=project.bpm;$('cycleTime').textContent=(240/project.bpm).toFixed(2)+'s';
    $('projectTitle').textContent=project.title;$('projectDesc').textContent=project.description;
    $('presetTag').textContent=presetKey==='custom'?'Custom sketch':presetKey==='samba'?'Samba study':presetKey==='broken'?'Broken rhythm':'Minimal pulse';
    document.querySelectorAll('[data-preset]').forEach(e=>e.classList.toggle('selected',e.dataset.preset===presetKey));
    renderLanes();renderLens();renderInspector();if(view==='orbit')drawAllOrbits();if(view==='transforms')renderGraph();if(view==='piano')renderPiano();if(view==='samples')renderSamples();renderCode();
  }
  function debounceApply(){clearTimeout(applyTimer);applyTimer=setTimeout(()=>applyToEngine().catch(()=>{}),230)}
  // Strudel WebAudio exposes the shared context after initStrudel(). Suspending
  // it is an audio-level stop: it also silences in-flight samples, synths, and FX
  // that may keep sounding even though hush() stopped the pattern scheduler.
  function sharedAudioContext(){
    if(!engineInitialized || typeof window.getAudioContext!=='function')return null;
    try{return window.getAudioContext() || null}catch(e){return null}
  }
  function diagnosticText(state=E.state()) {
    const locationHint=state.protocol==='file:'
      ? 'Opened from a local file. If playback is blocked, try http://localhost using the included server instructions.'
      : `Page origin: ${state.origin}`;
    const onlineHint=`Browser navigator.onLine: ${state.browserOnlineHint} (this is only a hint, not a CDN connectivity test).`;
    const attempts=state.errors.length
      ? state.errors.map((e,i)=>`${i+1}. ${e.url}\n   ${e.reason}`).join('\n')
      : state.phase==='ready' ? `Loaded successfully: ${state.source}` : 'No failed CDN requests recorded.';
    const loaded=state.source ? `\n\nLoaded successfully: ${state.source}` : '';
    const audioError=audioFailure ? `\n\nAudio initialization / evaluation error: ${audioFailure}` : '';
    const sampleErrors=sampleWarnings.length?`\n\nSample warnings: ${sampleWarnings.join('; ')}`:'';
    const ctx=sharedAudioContext();
    const contextStatus=ctx ? `Strudel AudioContext: ${ctx.state || 'unknown'} (suspend: ${typeof ctx.suspend}, resume: ${typeof ctx.resume})` : 'Strudel AudioContext: not exposed through getAudioContext()';
    return `${locationHint}\n${onlineHint}\n${contextStatus}\n\n${attempts}${loaded}${audioError}${sampleErrors}\n\nIf all attempts fail, check the browser Console / Network tab for CSP, ERR_BLOCKED_BY_CLIENT, DNS or TLS errors. Try opening one of the URLs above in a browser tab.`;
  }
  function updateEngineBadge(state=E.state()) {
    const badge=$('engineBadge');
    const labels={idle:'○ Engine not checked',loading:'◌ Loading Strudel…',ready:'● Strudel script loaded',error:'⚠ Strudel CDN failed'};
    badge.textContent=audioFailure?'⚠ Strudel audio error':engineInitialized?'● Strudel audio ready':labels[state.phase];
    badge.style.color=audioFailure||state.phase==='error'?'#ffbd7c':engineInitialized||state.phase==='ready'?'#9cf1be':'#d5d9e1';
    $('engineDiagText').textContent=diagnosticText(state);
    $('retryEngine').disabled=state.phase==='loading';
    if(state.phase==='error')$('engineDiagnostics').hidden=false;
  }
  async function initEngine(){
    if(engineInitialized)return;
    // initStrudel is the only guaranteed global BEFORE initialization.
    // @strudel/web installs evaluate/hush/samples *during* initialization.
    await E.load(true);
    $('statusText').textContent='Initializing Strudel…';
    try {
      lastEvalError=null;
      await window.initStrudel({
        // Strudel's repl.evaluate catches errors rather than rethrowing them.
        // Capture the underlying reason so silence cannot masquerade as Play.
        onEvalError:e=>{lastEvalError=e instanceof Error?e:new Error(String(e))},
        prebake:async()=>{
          if(typeof window.samples!=='function')throw new Error('samples() was not exposed by the engine');
          // Sample packs are OPTIONAL external dependencies. The audio engine and
          // built-in oscillators must remain usable if a GitHub manifest fails.
          const sources=[['Drum samples','github:tidalcycles/dirt-samples'],['Piano samples',PIANO_MAP_URL]];
          const results=await Promise.allSettled(sources.map(async ([name,url])=>{
            // Bound startup delay while allowing the slow request to settle later.
            // Promise.race attaches its rejection handler to the underlying promise.
            await Promise.race([
              Promise.resolve().then(()=>window.samples(url)),
              new Promise((_,reject)=>setTimeout(()=>reject(Error('timed out after 8 s')),8000)),
            ]);
          }));
          sampleWarnings=results.flatMap((result,i)=>result.status==='rejected'
            ?[sources[i][0]+': '+String(result.reason?.message||result.reason)]:[]);
        }
      });
    } catch(e) {
      throw new Error('Strudel initialization / sample loading failed: '+(e.message||e));
    }
    const missing=['evaluate','hush'].filter(name=>typeof window[name]!=='function');
    if(missing.length)throw new Error('Strudel initialized but missing '+missing.join(', ')+'. Try the bundled-project setup in the README.');
    engineInitialized=true;audioFailure='';
    updateEngineBadge();
  }
  // Every evaluation and final stop runs through one queue. In-flight evaluations
  // cannot be canceled by Strudel, so a Stop also queues a *second* hush after
  // any pending evaluation settles. A revision token invalidates stale updates.
  function enqueueAudio(action){
    const job=queue.catch(()=>{}).then(action);
    queue=job.catch(()=>{});
    return job;
  }
  async function applyToEngine(){
    if(!playing)return;
    const revision=playbackRevision;
    return enqueueAudio(async()=>{
      if(!playing||revision!==playbackRevision)return;
      // Generate the LATEST state at execution time, not when the job was
      // queued. Never discard the only pending initial evaluation because a
      // mixer change bumped mixRevision while Auto-evaluate was unchecked.
      const code=effectiveCode();
      lastEvalError=null;
      try{
        const result=await window.evaluate(code);
        // Strudel REPL swallows its exceptions, calls onEvalError, and resolves
        // to undefined. Without this guard it silently kills the prior pattern.
        if(lastEvalError)throw lastEvalError;
        if(result===undefined)throw new Error('Strudel returned no pattern. Open Audio diagnostics for errors; check generated code.');
        if(playing&&revision===playbackRevision){
          audioFailure='';
          const allMuted=activeCodeMode==='visual'&&project.lanes.every(l=>l.muted);
          $('statusText').textContent=allMuted?'All lanes muted · unmute a track':'Playing · Strudel';
          updateEngineBadge();
        }
      }catch(e){
        if(playing&&revision===playbackRevision){
          audioFailure=String(e.message||e);
          $('statusText').textContent='Audio error · inspect diagnostics';
          $('engineDiagnostics').hidden=false;
          updateEngineBadge();
          notify('Strudel evaluation failed: '+audioFailure);
        }
        throw e;
      }
    });
  }
  function startAnimation(){cancelAnimationFrame(raf);startedAt=performance.now();
    const tick=()=>{if(!playing)return;const phase=((performance.now()-startedAt)/(240000/project.bpm))%1;
      document.querySelectorAll('.pad').forEach(p=>{const lane=project.lanes[+p.dataset.lane];if(!lane)return;const count=visualRootChildren(lane).length;p.classList.toggle('playhead',Math.floor(phase*count)===+p.dataset.step)});
      raf=requestAnimationFrame(tick)};tick();
  }
  async function play(){
    if(playing)return;
    const revision=++playbackRevision;
    $('statusText').textContent='Preparing Strudel…';$('playButton').disabled=true;
    try{
      await initEngine();
      if(revision!==playbackRevision)return;
      // Do not resume before the previous Stop's final hush/suspend is done.
      // Otherwise a slow stop could suspend the sound of the new session.
      await pendingStop.catch(()=>{});
      if(revision!==playbackRevision)return;
      const ctx=sharedAudioContext();
      if(ctx?.state==='suspended' && typeof ctx.resume==='function')await ctx.resume();
      if(ctx?.state==='suspended')throw Error('Browser AudioContext remained suspended. Click Play again after interacting with the page.');
      if(revision!==playbackRevision)return;
      playing=true;
      // Enable Stop before evaluate() finishes: sample loads may be slow.
      $('playButton').disabled=false;
      $('playButton').textContent='■';$('statusDot').classList.add('on');
      startAnimation();
      await applyToEngine();
      if(revision!==playbackRevision||!playing)return;
      updateEngineBadge();
    }catch(e){
      if(revision!==playbackRevision)return;
      playing=false;audioFailure=String(e.message||e);
      cancelAnimationFrame(raf);
      notify('Could not start Strudel: '+audioFailure);
      $('statusText').textContent='Playback unavailable';
      $('playButton').textContent='▶';$('statusDot').classList.remove('on');
      $('engineDiagnostics').hidden=false;updateEngineBadge();
    }finally{$('playButton').disabled=false}
  }
  async function stop(){
    const revision=++playbackRevision;
    ++mixRevision;clearTimeout(applyTimer);playing=false;cancelAnimationFrame(raf);
    $('playButton').textContent='▶';$('statusDot').classList.remove('on');
    $('statusText').textContent='Stopping audio…';
    document.querySelectorAll('.pad').forEach(p=>p.classList.remove('playhead'));
    if(!engineInitialized){$('statusText').textContent='Stopped';return}
    const ctx=sharedAudioContext();
    // IMPORTANT: hush() only stops Strudel's scheduler; playing or queued WebAudio
    // voices and effect tails can continue. Suspend the shared AudioContext too.
    // Both are launched immediately (without waiting for pending evaluations).
    const attempt = fn => {try{return Promise.resolve(fn())}catch(e){return Promise.reject(e)}};
    const first=Promise.allSettled([
      attempt(()=>window.hush()),
      ctx && typeof ctx.suspend==='function' ? attempt(()=>ctx.suspend()) : Promise.resolve()
    ]);
    const finalStop=enqueueAudio(async()=>{
      const results=await first;
      // A second hush handles evaluations that completed after the first hush.
      // This queue is shared with evaluate(), so no older evaluation can follow it.
      const hushAgain=await attempt(()=>window.hush()).then(()=>null,e=>e);
      const suspendAgain=ctx && typeof ctx.suspend==='function'
        ? await attempt(()=>ctx.state==='suspended' ? undefined : ctx.suspend()).then(()=>null,e=>e)
        : null;
      if(results[0].status==='rejected' && hushAgain)throw hushAgain;
      if(suspendAgain)throw suspendAgain;
      if(ctx && typeof ctx.suspend==='function' && ctx.state!=='suspended')
        throw Error('AudioContext did not enter suspended state');
      return Boolean(ctx && ctx.state==='suspended');
    });
    pendingStop=finalStop.catch(()=>{});
    try{
      const hardStop=await finalStop;
      if(revision===playbackRevision){
        $('statusText').textContent=hardStop?'Stopped · audio suspended':'Stopped · scheduler only';
        if(!hardStop)notify('AudioContext not exposed; scheduler stopped, but active sounds may linger.');
        updateEngineBadge();
      }
    }catch(e){      if(revision===playbackRevision){
        $('statusText').textContent='Stop failed';
        notify('Audio stop failed: '+(e.message||e));
        audioFailure='Stop: '+(e.message||e);updateEngineBadge();
      }
    }
  }
  function download(name,body,type='text/plain'){
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function choosePreset(key){if(playing)stop();const sounds=clone(sampleLibrary()),libraries=clone(packs());presetKey=key;project=makePreset(key);project.customSamples=sounds;project.samplePacks=libraries;selected=0;focus=[];picked=0;activeCodeMode='visual';customCode='';persist();setView('lanes');render()}
  function addLane(){if(project.lanes.length>=12){notify('Maximum 12 layers');return};let i=project.lanes.length+1;project.lanes.push(makeLane('New voice '+i,'cp',8,[0,4],'An independent rhythmic voice.'));selectLane(project.lanes.length-1);meaningful()}
  function changeSteps(n){let l=selectedLane(),steps=l.root.type==='euclidean'?l.root.steps:l.root.children.length;
    n=clamp(n,2,32);if(n===steps)return;
    if(l.root.type==='euclidean'){l.root={...l.root,steps:n,pulses:Math.min(l.root.pulses,n),rotation:0};}
    else{
      const children=l.root.children.slice();while(children.length<n)children.push(C.rest());while(children.length>n)children.pop();l.root={...l.root,children};
    }
    l.rotation=0;focus=[];picked=0;meaningful();
  }
  function revoice(n,value){if(n.type==='event'||n.type==='euclidean')return {...n,value};if(n.type==='chord')return C.ev(value);if(n.type==='sequence')return {...n,children:n.children.map(child=>revoice(child,value))};return n}
  function adjustSound(s){const l=selectedLane();l.sound=s;if(l.kind==='drum')l.root=revoice(l.root,s);meaningful()}
  function changeLaneType(kind){const l=selectedLane();if(l.kind===kind)return;
    l.kind=kind;l.root=revoice(l.root,kind==='melody'?'c4':'bd');
    if(kind==='melody'){l.instrument=l.instrument||'piano';l.sound='c4';l.gain=.35;}
    else {l.sound='bd';l.instrument=undefined;l.gain=.65;}
    focus=[];picked=0;meaningful();setView(kind==='melody'?'piano':'lanes');}
  function addKeysLane(){if(project.lanes.length>=12){notify('Maximum 12 layers');return}
    const i=project.lanes.length+1;let l=makeLane('Keys '+i,'c4',16,[0,4,8,12],'Play piano, Rhodes or synth notes.','melody');
    l.instrument='piano';l.root=C.makeSteps(16,[0,4,8,12],j=>j===0?'c4':j===4?'e4':j===8?'g4':'b4');
    l.gain=.32;l.arp={mode:'off',steps:4,octaves:1};project.lanes.push(l);selectLane(project.lanes.length-1);meaningful();setView('piano');}
  const setChoice=(select,value,text)=>{const opt=document.createElement('option');opt.value=value;opt.textContent=text;select.appendChild(opt)};
  function populateSoundSelects(){const l=selectedLane();const drum=$('sourceSound'),keys=$('keyInstrument');drum.innerHTML='';keys.innerHTML='';
    if(l.kind==='melody'&&legacyKeys[l.instrument])l.instrument=legacyKeys[l.instrument];
    for(const [name,desc] of Object.entries(drumSources))setChoice(drum,name,name+' · '+desc);
    for(const [name,desc] of Object.entries(keysSources))setChoice(keys,name,desc);
    for(const x of sampleLibrary()){setChoice(drum,x.name,'♫ '+x.name);if(x.pitched)setChoice(keys,x.name,'♫ '+x.name+' ('+x.baseNote+')')}
    if(l.kind==='drum'&&![...drum.options].some(o=>o.value===l.sound))setChoice(drum,l.sound,l.sound+' · sample-pack alias');
    if(l.kind==='melody'&&![...keys.options].some(o=>o.value===(l.instrument||'piano')))setChoice(keys,l.instrument||'piano',(l.instrument||'piano')+' · bank alias');
    drum.value=l.sound;keys.value=l.instrument||'piano';}
  function notesAt(n){return n.type==='chord'?n.notes:n.type==='event'&&/^[a-g](?:#|b)?[0-8]$/i.test(n.value)?[n.value]:[]}
  function togglePianoNote(step,pitch){const l=selectedLane();if(l.kind!=='melody')return;
    if(C.at(l.root,focus).type==='euclidean')manualRoot();
    const path=[...focus,step],node=C.at(l.root,path);
    if(node.type==='sequence'||node.type==='euclidean'){notify('Nested step · open it in Lanes or use the recursive lens');return}
    try{l.root=C.flipNote(l.root,path,pitch);picked=step;meaningful()}catch(e){notify(e.message)}
  }
  function renderPiano(){const target=$('pianoRoll');target.innerHTML='';const l=selectedLane();$('pianoTitle').textContent=l.name+' · '+(l.instrument||'piano');
    if(l.kind!=='melody'){target.textContent='Select a keys lane in Lanes, or create a new one.';$('pianoRange').textContent='Chromatic keyboard';return}
    const node=selectedSequence();const children=node.children||[];
    const arp=C.validateArp(l.arp);
    $('pianoTitle').textContent=l.name+' · '+(l.instrument||'piano')+(l.muted?' · MUTED':'')+(arp.mode!=='off'?' · arp '+arp.mode:'');
    $('pianoFocus').textContent='Subdivisions: '+children.length+' · zoom level '+focus.length+(arp.mode!=='off'?' · arpeggiating chords':'');
    const octave=+$('pianoOctave').value||3;
    $('pianoRange').textContent=`C${octave}–B${octave+2} · click cells to add notes or chords`;
    pianoNotes(octave).forEach(pitch=>{const row=document.createElement('div');row.className='piano-row'+(pitch.includes('#')||pitch.includes('b')?' sharp':'');
      const key=document.createElement('button');key.type='button';key.className='piano-key'+(row.classList.contains('sharp')?' sharp':'')+(pitch.startsWith('c')?' root':'');key.textContent=pitch.toUpperCase();key.title='Pitch '+pitch;key.onclick=()=>notify('Pitch '+pitch+' · click the grid to place this note');
      const grid=document.createElement('div');grid.className='piano-grid';grid.style.gridTemplateColumns=`repeat(${children.length},minmax(0,1fr))`;
      children.forEach((cell,i)=>{const on=notesAt(cell).includes(pitch);const pad=document.createElement('button');pad.type='button';pad.className='piano-cell'+(on?' on':'')+(row.classList.contains('sharp')&&on?' sharp-on':'')+(i%4===0?' beat':'')+(cell.type==='sequence'?' nested':'');
        pad.title=`${pitch.toUpperCase()} · step ${i+1}`;pad.setAttribute('aria-label',`${pitch.toUpperCase()} at step ${i+1}${on?' selected':''}`);pad.dataset.pitch=pitch;pad.dataset.step=i;pad.onclick=()=>togglePianoNote(i,pitch);grid.appendChild(pad)});
      row.append(key,grid);target.appendChild(row)});
  }
  function normalizeSampleLink(input){let raw=String(input||'').trim();const u=new URL(raw);
    if(u.hostname==='github.com'){const parts=u.pathname.split('/').filter(Boolean);const idx=parts.indexOf('blob');
      if(idx===2&&parts.length>4)raw='https://raw.githubusercontent.com/'+parts.slice(0,2).join('/')+'/'+parts.slice(3).join('/');
      else if(parts.length>=4&&parts[2]==='raw')raw='https://raw.githubusercontent.com/'+parts.slice(0,2).join('/')+'/'+parts.slice(3).join('/');
      else throw Error('GitHub URLs must link to an individual audio file (…/blob/branch/file.wav)');
    }
    return C.validateSampleURL(raw);
  }
  function showSampleFeedback(message,error=false){$('sampleFeedback').textContent=message;$('sampleFeedback').style.color=error?'#ffb7aa':'#9cf1be';}
  function renderSamples(){const list=$('sampleList');list.innerHTML='';
    for(const [i,s] of sampleLibrary().entries()){
      const row=document.createElement('div');row.className='sample-item';const info=document.createElement('div');const name=document.createElement('b');name.textContent=s.name+(s.pitched?' · pitched '+s.baseNote:' · one-shot');const url=document.createElement('small');url.textContent=s.url;info.append(name,url);
      const use=makeButton('Use on lane','',()=>{const l=selectedLane();if(s.pitched&&l.kind==='melody'){l.instrument=s.name;meaningful();setView('piano')}else{if(l.kind==='melody')changeLaneType('drum');adjustSound(s.name);setView('lanes')}notify('Assigned '+s.name+' to '+l.name)});
      const remove=makeButton('Remove','remove',()=>{if(project.lanes.some(l=>l.sound===s.name||l.instrument===s.name)){showSampleFeedback('This sample is used by a lane; select another sound first.',true);return}project.customSamples.splice(i,1);meaningful();renderSamples()});row.append(info,use,remove);list.appendChild(row);
    }
    if(!sampleLibrary().length){const tip=document.createElement('p');tip.className='muted-note';tip.textContent='No custom sounds yet. Add a public audio URL above.';list.appendChild(tip)}
    const pl=$('packList');pl.innerHTML='';packs().forEach((url,i)=>{const row=document.createElement('div');row.className='sample-item';const name=document.createElement('small');name.textContent=url;name.style.flex='1';const remove=makeButton('Remove','remove',()=>{project.samplePacks.splice(i,1);meaningful();renderSamples()});row.append(name,remove);pl.appendChild(row)});
  }
  function addCustomSample(){try{
      const original=$('sampleName').value.trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_');
      if(!original||!/[a-z]/.test(original[0]))throw Error('Enter a name beginning with a letter');
      const name='sc_'+(original.startsWith('sc_')?original.slice(3):original);
      if(!/^sc_[a-z0-9_]{1,28}$/.test(name))throw Error('Use a short sample name (letters, digits, underscore)');
      if(sampleLibrary().some(s=>s.name===name))throw Error('Name already exists');
      const url=normalizeSampleLink($('sampleURL').value);const pitched=$('sampleMode').value==='pitched';
      const sample={name,url,pitched,baseNote:pickedNoteRoot()};
      project.customSamples=sampleLibrary().concat([sample]);C.validateSamples(project);meaningful();renderSamples();showSampleFeedback('Registered '+name+'. Samples load lazily when played; the hosting URL must allow audio downloads.');
      $('sampleName').value='';$('sampleURL').value='';
    }catch(e){showSampleFeedback(e.message||String(e),true)}
  }
  function pickedNoteRoot(){return $('sampleRoot').value||'c4'}
  function addSamplePack(){try{let input=$('packURL').value.trim();let url;
      if(input.startsWith('github:'))url=C.validateSampleURL(input,true);else if(/^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/?$/i.test(input)){const m=input.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i);url=C.validateSampleURL('github:'+m[1]+'/'+m[2],true)}else url=normalizeSampleLink(input);
      if(packs().includes(url))throw Error('This sample pack is already registered');
      project.samplePacks=packs().concat([url]);C.validateSamples(project);meaningful();renderSamples();showSampleFeedback('Sample pack registered. Enter a sample name from its map in the alias field.');$('packURL').value='';
    }catch(e){showSampleFeedback(e.message||String(e),true)}
  }
  function usePackAlias(){try{const alias=$('packAlias').value.trim();if(!/^[a-zA-Z][a-zA-Z0-9_:-]{0,45}$/.test(alias))throw Error('Enter a valid bank sample alias');
      const l=selectedLane();if(l.kind==='melody'){l.instrument=alias;meaningful();setView('piano')}else{adjustSound(alias);setView('lanes')}
      showSampleFeedback('Assigned '+alias+' to '+l.name+'. Ensure the pack declares this alias.');
    }catch(e){showSampleFeedback(e.message||String(e),true)}
  }

  // Engine status describes script loading, not general internet access.
  E.subscribe(updateEngineBadge);
  $('engineBadge').onclick=()=>{$('engineDiagnostics').hidden=!$('engineDiagnostics').hidden;updateEngineBadge()};
  $('closeEngineDiag').onclick=()=>$('engineDiagnostics').hidden=true;
  $('retryEngine').onclick=()=>E.load(true).catch(()=>{});
  $('testTone').onclick=async()=>{
    // Independent brief output test: tests browser/device without needing a
    // Strudel soundfont, sample download or generated code to evaluate.
    try{
      // Use an independent AudioContext so this test cannot accidentally
      // resume frozen Strudel voices from the previous Stop.
      const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
      const ctx=new AudioContextCtor();
      if(ctx.state==='suspended')await ctx.resume();
      const osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
      osc.type='sine';osc.frequency.value=440;
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(.1,now+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,now+.27);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.onended=()=>ctx.close().catch(()=>{});
      osc.start(now);osc.stop(now+.29);
      notify('Output test: 440 Hz tone for 0.3 s');
      updateEngineBadge();
    }catch(e){notify('Audio output test failed: '+(e.message||e))}
  };
  // Event wiring
  $('playButton').onclick=()=>playing?stop():play();$('applyLive').onclick=async()=>{if(!playing){await play();return}try{await applyToEngine();notify('Sent current code to Strudel')}catch(_){}};
  $('bpm').onchange=e=>{project.bpm=clamp(Math.round(+e.target.value||102),35,240);meaningful()};
  document.querySelectorAll('[data-preset]').forEach(e=>e.onclick=()=>choosePreset(e.dataset.preset));
  document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>setView(e.dataset.view));
  $('composeNav').onclick=()=>setView('lanes');$('keysNav').onclick=()=>setView('piano');$('soundsNav').onclick=()=>setView('samples');$('codeNav').onclick=()=>$('codeSection').scrollIntoView({behavior:'smooth',block:'center'});
  $('orbitGoBack').onclick=()=>setView('lanes');$('mutate').onclick=vary;$('resetPreset').onclick=()=>choosePreset(presetKey==='custom'?'samba':presetKey);
  $('addLane').onclick=addLane;$('addKeysLane').onclick=addKeysLane;$('pianoAddLane').onclick=addKeysLane;
  $('pianoOctave').onchange=renderPiano;
  $('pianoClear').onclick=()=>{if(selectedLane().kind!=='melody')return;const l=selectedLane();if(l.root.type==='euclidean')manualRoot();const n=C.at(l.root,focus);if(n.type!=='sequence')return;l.root=C.replace(l.root,focus,C.seq(n.children.map(()=>C.rest())));meaningful()};$('goUp').onclick=moveUp;$('dive').onclick=()=>enterCell();$('split2').onclick=()=>splitSelected(2);$('split3').onclick=()=>splitSelected(3);$('collapse').onclick=collapseSelected;
  $('stepsMinus').onclick=()=>changeSteps((selectedLane().root.type==='euclidean'?selectedLane().root.steps:selectedLane().root.children.length)-1);
  $('stepsPlus').onclick=()=>changeSteps((selectedLane().root.type==='euclidean'?selectedLane().root.steps:selectedLane().root.children.length)+1);
  $('sourceSound').onchange=e=>adjustSound(e.target.value);
  $('laneType').onchange=e=>changeLaneType(e.target.value);
  $('keyInstrument').onchange=e=>{selectedLane().instrument=e.target.value;meaningful()};
  $('openPiano').onclick=()=>setView('piano');$('editSampleLibrary').onclick=()=>setView('samples');
  $('sampleMode').onchange=e=>$('sampleRootLabel').hidden=e.target.value!=='pitched';
  $('addSample').onclick=addCustomSample;$('addPack').onclick=addSamplePack;$('usePackAlias').onclick=usePackAlias;

  $('applyEuclid').onclick=euclideanize;$('shiftPattern').onclick=()=>{const l=selectedLane(),n=l.root.type==='euclidean'?l.root.steps:l.root.children.length;setRotation(l,C.mod(rotationOf(l)+1,n));meaningful()};
  $('pulsesRange').onchange=e=>{const l=selectedLane();let n=l.root.type==='euclidean'?l.root.steps:l.root.children.length;let r=rotationOf(l);l.root=C.euc(l.kind==='melody'?'c2':l.sound,+e.target.value,n,r);l.rotation=0;focus=[];picked=0;meaningful()};
  $('rotationRange').onchange=e=>{setRotation(selectedLane(),+e.target.value);meaningful()};
  $('speed').onchange=e=>{selectedLane().speed=+e.target.value;meaningful()};
  $('gain').oninput=e=>$('gainValue').textContent=(+e.target.value).toFixed(2);
  $('gain').onchange=e=>{selectedLane().gain=+e.target.value;meaningful()};
  $('reverse').onchange=e=>{selectedLane().reverse=e.target.checked;meaningful()};
  $('muted').onchange=e=>setLaneMuted(selectedLane(),e.target.checked);
  function changeArpeggiator(){
    if(selectedLane().kind!=='melody')return;
    selectedLane().arp={mode:$('arpMode').value,steps:+$('arpSteps').value,octaves:+$('arpOctaves').value};
    C.validateArp(selectedLane().arp);meaningful();
  }
  for(const id of ['arpMode','arpSteps','arpOctaves'])$(id).onchange=changeArpeggiator;
  $('parseMini').onclick=()=>{try{const root=C.parseMini($('miniInput').value);C.validateNode(root);selectedLane().root=root;selectedLane().rotation=0;focus=[];picked=0;meaningful();notify('Mini-notation imported into the recursive editor')}
    catch(e){notify('Mini-notation not imported: '+e.message)}};
  $('editCode').onclick=()=>{if(activeCodeMode==='custom'){$('codeEditor').focus();return}customCode=C.emitProject(project);activeCodeMode='custom';render();$('codeEditor').focus();notify('Custom code mode: visual changes will not overwrite your code')};
  $('codeEditor').oninput=e=>{if(activeCodeMode==='custom'){customCode=e.target.value;++mixRevision;if(playing&&$('autoApply').checked)debounceApply()}};
  $('returnVisual').onclick=()=>{activeCodeMode='visual';customCode='';render();if(playing&&$('autoApply').checked)debounceApply();notify('Back to visual-generated source')};
  $('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(effectiveCode());notify('Copied current Strudel code')}catch(e){notify('Clipboard unavailable · use the .js export')}};
  $('downloadCode').onclick=()=>download('strudel-canvas.js',effectiveCode());
  $('openStrudel').onclick=()=>{
    const bytes=new TextEncoder().encode(effectiveCode());let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    window.open('https://strudel.cc/#'+encodeURIComponent(btoa(binary)),'_blank','noopener,noreferrer');
  };
  $('saveProject').onclick=()=>download('strudel-canvas-project.json',JSON.stringify(project,null,2),'application/json');
  $('importProject').onclick=()=>$('projectFile').click();
  $('projectFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const incoming=JSON.parse(await f.text());C.validateProject(incoming);
      if(playing)await stop();project=incoming;presetKey='custom';selected=0;focus=[];picked=0;activeCodeMode='visual';persist();render();notify('Project imported successfully')}
    catch(error){notify('Import rejected: '+error.message)}e.target.value=''};
  document.addEventListener('keydown',e=>{
    const typing=['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
    if(typing)return;
    if(e.code==='Space'){e.preventDefault();playing?stop():play()}
    if(e.code==='Escape'&&focus.length){moveUp()}
    if(e.code==='Enter'&&view==='lanes'){e.preventDefault();enterCell()}
  });
  try{const previous=JSON.parse(localStorage.getItem('strudel-canvas-v1')||'null');if(previous){C.validateProject(previous);project=previous;presetKey='custom'}else project=makePreset('samba')}
  catch(_){project=makePreset('samba')}
  project.customSamples=project.customSamples||[];project.samplePacks=project.samplePacks||[];
  render();
  // Start downloading as soon as the visual UI is ready; retry from Diagnostics or Play.
  E.load().catch(()=>{});
  // Tiny test hook: no mutation functions exposed and no remote API dependency.
  window.__strudelCanvasDebug=Object.freeze({getProject:()=>clone(project),getFocus:()=>focus.slice(),getCode:()=>effectiveCode()});
})();
