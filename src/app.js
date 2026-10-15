/* Strudel Canvas UI + the @strudel/web bridge (AGPL upstream). */
(() => {
  'use strict';
  const C = window.StrudelCanvasCore;
  const E = window.StrudelCanvasEngineLoader;
  const $ = id => document.getElementById(id);
  const colors = { bd:'#9cebb7',sd:'#bb9ffc',hh:'#83caff',oh:'#f69ac0',rim:'#ffbd7c',cp:'#f9b0bd',lt:'#d9aaff',c2:'#f5ce83' };
  const makeLane=(name,sound,steps,hits,description,kind='drum')=>({id:name.toLowerCase().replace(/\W/g,'-'),name,sound,kind,description,root:C.makeSteps(steps,hits,kind==='melody' ? i=>['c2','g2','eb2','bb1'][i%4]:sound),rotation:0,speed:1,gain:sound==='hh'?.35:sound==='bd'?.82:kind==='melody'?.26:.55,reverse:false,muted:false,room:0});
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
    raf=0, activeCodeMode='visual', customCode='', engineInitialized=false, audioFailure='', queue=Promise.resolve(), applyTimer=null, clickTimer=null, toastTimer=null;
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
    persist();render();
    if(playing&&$('autoApply').checked&&activeCodeMode==='visual')debounceApply();
  }
  function persist(){try{localStorage.setItem('strudel-canvas-v1',JSON.stringify(project))}catch(_) {}}
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
    $('patternPanel').classList.toggle('is-hidden',v!=='lanes');$('orbitPanel').classList.toggle('is-hidden',v!=='orbit');$('transformsPanel').classList.toggle('is-hidden',v!=='transforms');
    if(v==='orbit')drawAllOrbits();if(v==='transforms')renderGraph()}
  function makeButton(label,className,click,title=''){
    const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.title=title;b.onclick=click;return b;
  }
  function fireClick(fn){return e=>{clearTimeout(clickTimer);if(e.shiftKey){splitSelected(2);return}clickTimer=setTimeout(fn,180)}}
  function visualRootChildren(l){return l.root.type==='euclidean'?C.makeManual(l.root).children:l.root.children}
  function displayEvent(n){if(n.type==='rest')return '~';if(n.type==='event')return n.value;
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
        const isOn=node.type==='event'||node.type==='euclidean';
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
      const select=makeButton(children.length+'/1','lane-select',()=>selectLane(i),'Select layer');
      row.append(name,grid,select);target.appendChild(row);
    });$('layerCount').textContent=`${project.lanes.length} independent layers`;
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
      const nested=node.type==='sequence';const on=node.type==='event'||node.type==='euclidean';
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
      const isOn=node.type==='event'||node.type==='euclidean',nested=node.type==='sequence';
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
        let on=node.type==='event'||node.type==='euclidean',nested=node.type==='sequence';
        let dot=svg('circle',{cx:x,cy:y,r:nested?4.7:on?4.1:2,fill:nested?'#cdb0ff':on?paint:'#4f5b65'});dot.style.cursor='pointer';
        dot.addEventListener('click',()=>{selected=i;picked=j;setView('lanes');render()});el.append(dot);
      });
    });
    const txt=svg('text',{x:cx,y:cy+4,'text-anchor':'middle','font-size':12,fill:'#eff7f3'});txt.textContent='ONE CYCLE';el.appendChild(txt);box.appendChild(el);
  }
  function renderGraph(){const l=selectedLane(),target=$('transformGraph');target.innerHTML='';const steps=l.root.type==='euclidean'?l.root.steps:l.root.children.length;
    let nodes=[['Source',l.kind==='melody'?'note '+l.sound:'sample '+l.sound],['Structure',l.root.type==='euclidean'?`${l.root.pulses} in ${steps} Euclidean`:`${steps} steps · recursive`],['Rotation',rotationOf(l)+' / '+steps+' steps'],['Time',l.speed+'× '+(l.reverse?'reverse':'forward')],['Dynamics',l.gain.toFixed(2)+' gain'],['Output','Strudel audio']];
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
    $('rotationValue').textContent=rotationOf(l)+' steps';$('sourceSound').value=l.sound;
    $('speed').value=String(l.speed);$('speedValue').textContent=l.speed+'×';$('gain').value=l.gain;$('gainValue').textContent=Number(l.gain).toFixed(2);
    $('reverse').checked=!!l.reverse;$('muted').checked=!!l.muted;
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
    renderLanes();renderLens();renderInspector();if(view==='orbit')drawAllOrbits();if(view==='transforms')renderGraph();renderCode();
  }
  function debounceApply(){clearTimeout(applyTimer);applyTimer=setTimeout(()=>applyToEngine().catch(()=>{}),230)}
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
    return `${locationHint}\n${onlineHint}\n\n${attempts}${loaded}${audioError}\n\nIf all attempts fail, check the browser Console / Network tab for CSP, ERR_BLOCKED_BY_CLIENT, DNS or TLS errors. Try opening one of the URLs above in a browser tab.`;
  }
  function updateEngineBadge(state=E.state()) {
    const badge=$('engineBadge');
    const labels={idle:'○ Engine not checked',loading:'◌ Loading Strudel…',ready:'● Strudel script loaded',error:'⚠ Strudel CDN failed'};
    badge.textContent=engineInitialized?'● Strudel audio ready':audioFailure?'⚠ Audio initialization failed':labels[state.phase];
    badge.style.color=engineInitialized?'#9cf1be':audioFailure||state.phase==='error'?'#ffbd7c':state.phase==='ready'?'#9cf1be':'#d5d9e1';
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
      await window.initStrudel({prebake:()=>{
        if(typeof window.samples!=='function')throw new Error('samples() was not exposed by the engine');
        return window.samples('github:tidalcycles/dirt-samples');
      }});
    } catch(e) {
      throw new Error('Strudel initialization / sample loading failed: '+(e.message||e));
    }
    const missing=['evaluate','hush'].filter(name=>typeof window[name]!=='function');
    if(missing.length)throw new Error('Strudel initialized but missing '+missing.join(', ')+'. Try the bundled-project setup in the README.');
    engineInitialized=true;audioFailure='';
    updateEngineBadge();
  }
  async function applyToEngine(){
    if(!playing)return;
    const code=effectiveCode();
    queue=queue.catch(()=>{}).then(async()=>{try{await window.evaluate(code);$('statusText').textContent='Playing · Strudel'}
      catch(e){$('statusText').textContent='Audio error';notify(`Strudel evaluation failed: ${e.message||e}`);throw e}});
    await queue;
  }
  function startAnimation(){cancelAnimationFrame(raf);startedAt=performance.now();
    const tick=()=>{if(!playing)return;const phase=((performance.now()-startedAt)/(240000/project.bpm))%1;
      document.querySelectorAll('.pad').forEach(p=>{const lane=project.lanes[+p.dataset.lane];if(!lane)return;const count=visualRootChildren(lane).length;p.classList.toggle('playhead',Math.floor(phase*count)===+p.dataset.step)});
      raf=requestAnimationFrame(tick)};tick();
  }
  async function play(){if(playing)return;
    $('statusText').textContent='Preparing Strudel…';$('playButton').disabled=true;
    try{await initEngine();playing=true;await applyToEngine();$('playButton').textContent='■';$('statusDot').classList.add('on');startAnimation()}
    catch(e){playing=false;audioFailure=String(e.message||e);notify('Could not start Strudel: '+audioFailure);$('statusText').textContent='Playback unavailable';$('engineDiagnostics').hidden=false;updateEngineBadge()}
    finally{$('playButton').disabled=false}
  }
  async function stop(){clearTimeout(applyTimer);playing=false;cancelAnimationFrame(raf);$('playButton').textContent='▶';$('statusDot').classList.remove('on');$('statusText').textContent='Stopped';
    document.querySelectorAll('.pad').forEach(p=>p.classList.remove('playhead'));try{if(engineInitialized)await window.hush()}catch(e){notify('Stop error: '+e.message)}}
  function download(name,body,type='text/plain'){
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function choosePreset(key){if(playing)stop();presetKey=key;project=makePreset(key);selected=0;focus=[];picked=0;activeCodeMode='visual';customCode='';persist();setView('lanes');render()}
  function addLane(){if(project.lanes.length>=12){notify('Maximum 12 layers');return};let i=project.lanes.length+1;project.lanes.push(makeLane('New voice '+i,'cp',8,[0,4],'An independent rhythmic voice.'));selectLane(project.lanes.length-1);meaningful()}
  function changeSteps(n){let l=selectedLane(),steps=l.root.type==='euclidean'?l.root.steps:l.root.children.length;
    n=clamp(n,2,32);if(n===steps)return;
    if(l.root.type==='euclidean'){l.root={...l.root,steps:n,pulses:Math.min(l.root.pulses,n),rotation:0};}
    else{
      const children=l.root.children.slice();while(children.length<n)children.push(C.rest());while(children.length>n)children.pop();l.root={...l.root,children};
    }
    l.rotation=0;focus=[];picked=0;meaningful();
  }
  function adjustSound(s){let l=selectedLane();l.sound=s;l.kind=s==='c2'?'melody':'drum';
    const value=l.kind==='melody'?'c2':s;
    function revoice(n){if(n.type==='event')return {...n,value};if(n.type==='euclidean')return {...n,value};if(n.type==='sequence')return {...n,children:n.children.map(revoice)};return n}
    l.root=revoice(l.root);meaningful()}
  // Engine status describes script loading, not general internet access.
  E.subscribe(updateEngineBadge);
  $('engineBadge').onclick=()=>{$('engineDiagnostics').hidden=!$('engineDiagnostics').hidden;updateEngineBadge()};
  $('closeEngineDiag').onclick=()=>$('engineDiagnostics').hidden=true;
  $('retryEngine').onclick=()=>E.load(true).catch(()=>{});
  // Event wiring
  $('playButton').onclick=()=>playing?stop():play();$('applyLive').onclick=async()=>{if(!playing){await play();return}try{await applyToEngine();notify('Sent current code to Strudel')}catch(_){}};
  $('bpm').onchange=e=>{project.bpm=clamp(Math.round(+e.target.value||102),35,240);meaningful()};
  document.querySelectorAll('[data-preset]').forEach(e=>e.onclick=()=>choosePreset(e.dataset.preset));
  document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>setView(e.dataset.view));
  $('composeNav').onclick=()=>setView('lanes');$('codeNav').onclick=()=>$('codeSection').scrollIntoView({behavior:'smooth',block:'center'});
  $('orbitGoBack').onclick=()=>setView('lanes');$('mutate').onclick=vary;$('resetPreset').onclick=()=>choosePreset(presetKey==='custom'?'samba':presetKey);
  $('addLane').onclick=addLane;$('goUp').onclick=moveUp;$('dive').onclick=()=>enterCell();$('split2').onclick=()=>splitSelected(2);$('split3').onclick=()=>splitSelected(3);$('collapse').onclick=collapseSelected;
  $('stepsMinus').onclick=()=>changeSteps((selectedLane().root.type==='euclidean'?selectedLane().root.steps:selectedLane().root.children.length)-1);
  $('stepsPlus').onclick=()=>changeSteps((selectedLane().root.type==='euclidean'?selectedLane().root.steps:selectedLane().root.children.length)+1);
  $('sourceSound').onchange=e=>adjustSound(e.target.value);
  $('applyEuclid').onclick=euclideanize;$('shiftPattern').onclick=()=>{const l=selectedLane(),n=l.root.type==='euclidean'?l.root.steps:l.root.children.length;setRotation(l,C.mod(rotationOf(l)+1,n));meaningful()};
  $('pulsesRange').onchange=e=>{const l=selectedLane();let n=l.root.type==='euclidean'?l.root.steps:l.root.children.length;let r=rotationOf(l);l.root=C.euc(l.kind==='melody'?'c2':l.sound,+e.target.value,n,r);l.rotation=0;focus=[];picked=0;meaningful()};
  $('rotationRange').onchange=e=>{setRotation(selectedLane(),+e.target.value);meaningful()};
  $('speed').onchange=e=>{selectedLane().speed=+e.target.value;meaningful()};
  $('gain').oninput=e=>$('gainValue').textContent=(+e.target.value).toFixed(2);
  $('gain').onchange=e=>{selectedLane().gain=+e.target.value;meaningful()};
  $('reverse').onchange=e=>{selectedLane().reverse=e.target.checked;meaningful()};
  $('muted').onchange=e=>{selectedLane().muted=e.target.checked;meaningful()};
  $('parseMini').onclick=()=>{try{const root=C.parseMini($('miniInput').value);C.validateNode(root);selectedLane().root=root;selectedLane().rotation=0;focus=[];picked=0;meaningful();notify('Mini-notation imported into the recursive editor')}
    catch(e){notify('Mini-notation not imported: '+e.message)}};
  $('editCode').onclick=()=>{if(activeCodeMode==='custom'){$('codeEditor').focus();return}customCode=C.emitProject(project);activeCodeMode='custom';renderCode();$('codeEditor').focus();notify('Custom code mode: visual changes will not overwrite your code')};
  $('codeEditor').oninput=e=>{if(activeCodeMode==='custom'){customCode=e.target.value;if(playing&&$('autoApply').checked)debounceApply()}};
  $('returnVisual').onclick=()=>{activeCodeMode='visual';customCode='';renderCode();if(playing&&$('autoApply').checked)debounceApply();notify('Back to visual-generated source')};
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
  render();
  // Start downloading as soon as the visual UI is ready; retry from Diagnostics or Play.
  E.load().catch(()=>{});
  // Tiny test hook: no mutation functions exposed and no remote API dependency.
  window.__strudelCanvasDebug=Object.freeze({getProject:()=>clone(project),getFocus:()=>focus.slice(),getCode:()=>effectiveCode()});
})();
