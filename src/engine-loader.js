/* Strudel Canvas engine script loader. No blanket 'offline' inference from CDN errors.
 * Upstream @strudel/web is AGPL-3.0-or-later. */
(function (root) {
  'use strict';
  const candidates = [
    'https://unpkg.com/@strudel/web@1.3.0',
    'https://cdn.jsdelivr.net/npm/@strudel/web@1.3.0',
    'https://unpkg.com/@strudel/web@1.0.3',
  ];
  const listeners = new Set();
  const errors = [];
  let phase = typeof root.initStrudel === 'function' ? 'ready' : 'idle';
  let source = phase === 'ready' ? 'Already available on page' : '';
  let currentPromise = null;
  let attempt = '';
  const latest = () => ({ phase, source, attempt, errors: errors.slice(),
    browserOnlineHint: typeof navigator !== 'undefined' ? navigator.onLine : null,
    protocol: location.protocol, origin: location.origin });
  function publish(){const snapshot=latest();for(const listener of listeners)try{listener(snapshot)}catch(e){console.error('Engine diagnostics listener:',e)}}
  function setPhase(next, from=''){phase=next;if(from)attempt=from;publish()}
  function loadScript(url, timeoutMs=10500) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src=url;script.async=true;
      let settled=false;
      const finish=(failure)=>{
        if(settled)return;
        settled=true;clearTimeout(timer);
        script.onload=null;script.onerror=null;
        if(failure){script.remove();reject(failure)}else resolve();
      };
      const timer=setTimeout(()=>finish(new Error('Timed out after '+Math.round(timeoutMs/1000)+'s (CDN, browser policy, or network)')),timeoutMs);
      script.onload=()=>typeof root.initStrudel==='function'
        ? finish(null)
        : finish(new Error('Script downloaded, but it did not expose initStrudel (incompatible build)'));
      script.onerror=()=>finish(new Error('Script request failed or was blocked (network, CSP, browser extension, or CDN)'));
      document.head.appendChild(script);
    });
  }
  function load(retry=false) {
    if(typeof root.initStrudel==='function') {
      phase='ready';source=source||'Previously loaded script';publish();return Promise.resolve(latest());
    }
    if(currentPromise)return currentPromise;
    if(phase==='error'&&!retry)return Promise.reject(new Error('Strudel CDN load failed; use Retry engine for another attempt.'));
    errors.length=0;source='';setPhase('loading',candidates[0]);
    currentPromise=(async()=>{
      for(const url of candidates){
        setPhase('loading',url);
        try{
          await loadScript(url);
          source=url;setPhase('ready',url);
          return latest();
        }catch(err){
          errors.push({url,reason:String(err?.message||err)});
          publish();
        }
      }
      setPhase('error');
      throw new Error('Unable to load @strudel/web from any CDN. This does not prove your browser is offline.');
    })().finally(()=>{currentPromise=null});
    return currentPromise;
  }
  root.StrudelCanvasEngineLoader=Object.freeze({load,state:latest,subscribe(fn){listeners.add(fn);fn(latest());return()=>listeners.delete(fn)}});
})(window);
