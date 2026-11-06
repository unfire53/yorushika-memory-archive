// This module belongs only to the GitHub Pages export. Original image bytes stay intact.
const images = new WeakMap();
function readyImage(img) {
  if (images.has(img)) return images.get(img);
  const promise = (async () => {
    img.loading = 'eager';
    if (img.dataset.gpSrcset) img.srcset = img.dataset.gpSrcset;
    if (img.dataset.gpSrc) img.src = img.dataset.gpSrc;
    await img.decode();
    img.dataset.gpReady = 'true';
  })();
  images.set(img, promise);
  promise.catch(() => images.delete(img)); // Failed downloads can be retried on the next interaction.
  return promise;
}
const papers = new WeakMap();
function readyPaper(root) {
  if (!root?.dataset.gpPaper) return Promise.resolve();
  if (papers.has(root)) return papers.get(root);
  const values = JSON.parse(root.dataset.gpPaper);
  const promise = (async () => {
    const key = matchMedia('(max-width: 680px)').matches ? '--paper-image-mobile' : '--paper-image-desktop';
    const url = values[key]?.match(/url\((.*?)\)/)?.[1];
    if (url) { const image = new Image(); image.src = url; await image.decode(); }
    for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
    root.dataset.gpPaperReady = 'true';
  })();
  papers.set(root, promise);
  promise.catch(() => papers.delete(root));
  return promise;
}
function targetFor(button) {
  const home = document.querySelector('[data-home-archive]');
  const live = document.querySelector('[data-live-root]');
  if (button.matches('[data-place-button]')) return home?.querySelector(`[data-place-scene="${button.dataset.placeButton}"]`);
  if (button.matches('[data-place-direction]')) {
    const scenes = [...home.querySelectorAll('[data-place-scene]')];
    return scenes[scenes.findIndex(s => s.classList.contains('is-active')) + Number(button.dataset.placeDirection)];
  }
  if (button.matches('[data-live-index]')) return live?.querySelector(`[data-photo-group="${button.dataset.liveIndex}"]`);
  if (button.matches('[data-switch-member]')) return document.querySelector(`[data-member="${button.dataset.switchMember}"]`);
  return button.closest('[data-member]');
}
function readyTarget(target) {
  if (!target) return Promise.resolve();
  return Promise.all([
    ...[...target.querySelectorAll('img[data-gp-src]')].map(readyImage),
    readyPaper(target.closest('[data-members-root]')),
  ]);
}
const selector = '[data-place-button],[data-place-direction],[data-live-index],.member-entry,[data-switch-member]';
const replay = new WeakSet();
function showStatus(button, text, busy) {
  const status = document.createElement('div');
  status.className = 'gp-image-status';
  status.setAttribute('role', 'status');
  if (busy) { const spinner = document.createElement('span'); spinner.className = 'gp-spinner'; spinner.setAttribute('aria-hidden','true'); status.append(spinner); }
  status.append(document.createTextNode(text));
  document.body.append(status);
  const rect=button.getBoundingClientRect();
  status.style.left=`${Math.max(16,Math.min(rect.left,innerWidth-status.offsetWidth-16))}px`;
  status.style.top=`${Math.max(16,Math.min(rect.bottom+8,innerHeight-status.offsetHeight-16))}px`;
  return status;
}
// Capture runs before page handlers: retain the current scene until the next pictures decode.
document.addEventListener('click', event => {
  const button = event.target.closest?.(selector);
  if (!button || button.disabled || replay.has(button)) return;
  const target = targetFor(button);
  if (!target) return;
  const pending = [...target.querySelectorAll('img[data-gp-src]')].some(img => img.dataset.gpReady !== 'true');
  const paperRoot = target.closest('[data-members-root]');
  const paperPending = paperRoot?.dataset.gpPaper && paperRoot.dataset.gpPaperReady !== 'true';
  if (!pending && !paperPending) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (button.dataset.gpWaiting) return;
  button.dataset.gpWaiting = 'true'; button.setAttribute('aria-busy', 'true');
  let status;
  const delay=setTimeout(()=>{if(button.isConnected)status=showStatus(button,'正在载入图片…',true);},500);
  let timeout;
  Promise.race([readyTarget(target),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Image wait timed out')),15000);})]).then(() => {
    if (!button.isConnected) return;
    replay.add(button); button.click(); replay.delete(button);
  }).catch(() => {
    if(button.isConnected){const error=showStatus(button,'图片暂未载入，请再点一次重试',false);setTimeout(()=>error.remove(),4500);}
  }).finally(() => {
    clearTimeout(delay);clearTimeout(timeout);status?.remove();
    delete button.dataset.gpWaiting; button.removeAttribute('aria-busy');
  });
}, true);
for (const type of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(type, event => {
  const button = event.target.closest?.(selector);
  if (button && !button.disabled) void readyTarget(targetFor(button)).catch(() => {});
}, {capture: true, passive: true});
// Keyboard arrows use the same decode-before-switch guarantee as clickable controls.
document.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  let button = document.querySelector(`[data-place-direction="${delta}"]`);
  const live = document.querySelector('[data-live-root]');
  if (live) {
    const active = live.querySelector('[data-live-index][aria-current="true"]');
    button = live.querySelector(`[data-live-index="${Number(active?.dataset.liveIndex) + delta}"]`);
  }
  if (!button || button.disabled) return;
  event.preventDefault(); event.stopImmediatePropagation(); button.click();
}, true);
// Gate the first entry on the complete published resource inventory, not just the hero.
let archivePromise;
async function deviceResources(resources) {
  performance.setResourceTimingBufferSize(4000);
  const selected=new Set();
  const prefix=new URL('../',import.meta.url);
  const mobile=matchMedia('(max-width: 720px)').matches;
  const add=value=>{
    for(const match of String(value).matchAll(/\/(?:yorushika-memory-archive\/)?(?:_astro|live)\/[^\s"'<>),;]+\.(?:webp|png|jpe?g|svg)/g))selected.add(new URL(match[0],location.origin).href);
  };
  const documents=await Promise.all(['','members/','albums/','live/'].map(async route=>{
    const response=await fetch(new URL(route,prefix),{cache:'reload',signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error('Page preparation failed');
    return new DOMParser().parseFromString(await response.text(),'text/html');
  }));
  const selectors=[];
  let textCorpus='';
  for(const doc of documents){
    for(const node of doc.querySelectorAll('style,script:not([type="application/json"])'))node.remove();
    textCorpus+=doc.body.textContent;
    for(const img of doc.querySelectorAll('img')){
      const probe=new Image();
      const srcset=img.getAttribute('data-gp-srcset')||img.getAttribute('srcset');
      if(srcset){
        probe.sizes=img.getAttribute('sizes')||'100vw';probe.srcset=srcset;
        probe.src=img.getAttribute('data-gp-src')||img.getAttribute('src')||'';
        // Let the native browser choose exactly as it will when this page is visited.
        selectors.push(probe);probe.decode().catch(()=>{});
      }else add(img.getAttribute('data-gp-src')||img.getAttribute('src'));
    }
    for(const node of doc.querySelectorAll('[style]')){
      for(const declaration of node.getAttribute('style').split(';')){
        const key=declaration.split(':')[0];
        if(key.endsWith('-desktop')&&mobile||key.endsWith('-mobile')&&!mobile)continue;
        add(declaration);
      }
    }
    for(const node of doc.querySelectorAll('[data-gp-paper]')){
      const paper=JSON.parse(node.getAttribute('data-gp-paper'));
      add(paper[mobile?'--paper-image-mobile':'--paper-image-desktop']);
    }
    // Player cover art is stored in Astro island props, including tracks not yet selected.
    for(const node of doc.querySelectorAll('[props]'))add(node.getAttribute('props'));
  }
  await new Promise(resolve=>requestAnimationFrame(resolve));
  for(const image of selectors){
    if(!image.currentSrc)await image.decode().catch(()=>{});
    if(image.currentSrc)selected.add(image.currentSrc);
  }
  // Include background imagery referenced directly by stylesheets, if any.
  for(const item of resources.filter(r=>r.url.endsWith('.css'))){
    const response=await fetch(item.url,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error('Stylesheet preparation failed');
    add(await response.text());
  }
  // Ask the browser for the font subsets needed by all four pages' actual text.
  // Every weight used by the site is warmed, rather than downloading every fallback subset.
  await Promise.all([
    document.fonts.load('400 16px "Noto Serif SC"',textCorpus),
    document.fonts.load('600 16px "Noto Serif SC"',textCorpus),
    document.fonts.load('400 16px "JetBrains Mono"',textCorpus),
    document.fonts.load('500 16px "JetBrains Mono"',textCorpus),
  ]);
  const fonts=new Set(performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.woff2')).map(r=>r.name));
  const chosen=resources.filter(r=>r.url.endsWith('.woff2')?fonts.has(new URL(r.url,location.origin).href):!/\.(webp|png|jpe?g|svg)$/.test(r.url)||selected.has(new URL(r.url,location.origin).href)||r.url.endsWith('/favicon.svg'));
  window.__gpDeviceResourceCount=chosen.length;
  window.__gpDeviceResourceBytes=chosen.reduce((n,r)=>n+r.bytes,0);
  return chosen;
}
function preloadArchive() {
  if(archivePromise)return archivePromise;
  window.__gpArchiveLoading=true;
  const shell=document.querySelector('#gp-loading');
  const label=shell?.querySelector('[data-gp-loading-label]');
  const progress=shell?.querySelector('[data-gp-progress]');
  const retry=shell?.querySelector('[data-gp-retry]');
  if(retry)retry.hidden=true;
  archivePromise=(async()=>{
    const response=await fetch(new URL('../archive-resources.v2.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error('Resource manifest unavailable');
    const manifest=await response.json();
    const resources=await deviceResources(manifest.resources);
    const totalBytes=resources.reduce((n,r)=>n+r.bytes,0);
    if(label)label.textContent='正在准备完整档案…';
    let cursor=0,completed=0,bytes=0;const failed=[];
    const update=()=>{if(progress)progress.textContent=`${completed} / ${resources.length} 项 · ${(bytes/1048576).toFixed(1)} / ${(totalBytes/1048576).toFixed(1)} MB`;};
    update();
    await Promise.all(Array.from({length:6},async()=>{
      while(cursor<resources.length){const item=resources[cursor++];try{
        const resource=await fetch(item.url,{cache:item.url.endsWith('.html')?'reload':'default',signal:AbortSignal.timeout(90000)});
        if(!resource.ok)throw Error('HTTP '+resource.status);
        await resource.arrayBuffer(); // Consume the entire response before counting it complete.
        bytes+=item.bytes;completed++;update();
      }catch{failed.push(item.url);}}
    }));
    if(failed.length)throw Error(`${failed.length} 项资源未能加载`);
    window.__gpArchiveDownloadsComplete=true;
  })().catch(error=>{
    archivePromise=undefined;
    if(label)label.textContent='资源尚未加载完整';
    if(progress)progress.textContent=error.message.includes('项资源')?`${error.message}，请检查网络后重试`:'网络连接失败，请检查网络后重试';
    if(retry)retry.hidden=false;
    throw error;
  });
  return archivePromise;
}
const initialized = new WeakSet();
function initialize() {
  const root=document.querySelector('[data-route-content]');
  if(!root||initialized.has(root))return;
  initialized.add(root);
  const preparePage=async()=>{
    // Populate deferred elements even when their scene or letter is not visible yet.
    await Promise.all([
      ...[...root.querySelectorAll('img[data-gp-src]')].map(readyImage),
      readyPaper(root.querySelector('[data-members-root]')),
      ...[...root.querySelectorAll('img[src]:not([data-gp-src])')].map(i=>i.decode()),
    ]);
    await document.fonts.ready;
    const scene=root.querySelector('[data-page-motion]');
    if(scene&&scene.dataset.pageMotion!=='idle')await new Promise(resolve=>{
      const observer=new MutationObserver(()=>{if(scene.dataset.pageMotion==='idle'){observer.disconnect();resolve();}});
      observer.observe(scene,{attributes:true,attributeFilter:['data-page-motion']});
      setTimeout(()=>{observer.disconnect();resolve();},8000);
    });
  };
  if(window.__gpArchiveReady){void preparePage().catch(()=>{});return;}
  void (async()=>{
    try{
      await preloadArchive();
      await preparePage();
      window.__gpArchiveReady=true;
      document.dispatchEvent(new Event('gp:archive-ready'));
    }catch{
      const shell=document.querySelector('#gp-loading');
      if(window.__gpArchiveDownloadsComplete&&shell){
        shell.querySelector('[data-gp-loading-label]').textContent='图片尚未准备完成';
        shell.querySelector('[data-gp-progress]').textContent='请重试以重新准备页面';
        shell.querySelector('[data-gp-retry]').hidden=false;
      }
    }
  })();
}
document.addEventListener('astro:page-load',initialize);
initialize();
