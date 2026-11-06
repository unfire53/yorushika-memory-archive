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
    ...[...target.querySelectorAll('svg[data-gp-crop] image')].map(node=>loadImage(node.getAttribute('href'))),
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
for (const type of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(type, event => {
  const button = event.target.closest?.(selector);
  if (button && !button.disabled) void readyTarget(targetFor(button)).catch(() => {});
}, {capture: true, passive: true});
// Select the remaining archive resources only after the current page has opened.
async function deviceResources(resources) {
  performance.setResourceTimingBufferSize(4000);
  const selected=new Set();
  const prefix=new URL('../',import.meta.url);
  const mobile=matchMedia('(max-width: 720px)').matches;
  const add=value=>{
    for(const match of String(value).matchAll(/\/(?:yorushika-memory-archive\/)?(?:_astro|live)\/[^\s"'<>),;]+\.(?:webp|png|jpe?g|svg)/g))selected.add(new URL(match[0],location.origin).href);
  };
  const documents=await Promise.all(['','members/','albums/','live/'].map(async route=>{
    const response=await fetch(new URL(route,prefix),{priority:'low',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('Page preparation failed');
    return new DOMParser().parseFromString(await response.text(),'text/html');
  }));
  const selectors=[];
  let textCorpus='';
  for(const doc of documents){
    for(const node of doc.querySelectorAll('style,script:not([type="application/json"])'))node.remove();
    textCorpus+=doc.body.textContent;
    for(const image of doc.querySelectorAll('svg[data-gp-crop] image'))add(image.getAttribute('href'));
    for(const img of doc.querySelectorAll('img')){
      const probe=new Image();probe.fetchPriority='low';
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

const loadedImages=new Map();
function loadImage(url, low=false) {
  if(!url)return Promise.resolve();
  url=new URL(url,location.href).href;
  if(loadedImages.has(url))return loadedImages.get(url);
  const promise=(async()=>{const image=new Image();image.fetchPriority=low?'low':'high';image.src=url;await image.decode();})();
  loadedImages.set(url,promise);promise.catch(()=>loadedImages.delete(url));return promise;
}
async function prepareDocument(doc, low=false) {
  const mobile=matchMedia('(max-width:720px)').matches;
  const tasks=[];
  const add=value=>{for(const m of String(value).matchAll(/url\(([^)]+)\)/g))tasks.push(loadImage(m[1].replaceAll('"','').replaceAll("'",''),low));};
  const scope=doc.querySelector('[data-route-content]')||doc;
  const hidden=node=>node.closest('[hidden],[data-place-scene][aria-hidden="true"],.member-dossier');
  for(const img of scope.querySelectorAll('img')){
    if(hidden(img))continue;
    if(img.ownerDocument===document)tasks.push(img.dataset.gpSrc?readyImage(img):img.decode());
    else {const probe=new Image();probe.fetchPriority=low?'low':'high';probe.sizes=img.getAttribute('sizes')||'100vw';if(img.getAttribute('srcset'))probe.srcset=img.getAttribute('srcset');probe.src=img.getAttribute('src')||img.getAttribute('data-gp-src')||'';if(probe.src)tasks.push(probe.decode());}
  }
  for(const image of scope.querySelectorAll('svg[data-gp-crop] image'))if(!hidden(image))tasks.push(loadImage(image.getAttribute('href'),low));
  for(const node of doc.querySelectorAll('[style]')){
    if(hidden(node))continue;
    for(const declaration of node.getAttribute('style').split(';')){
      const key=declaration.split(':')[0];
      if(key.endsWith('-desktop')&&mobile||key.endsWith('-mobile')&&!mobile)continue;
      add(declaration);
    }
  }
  await Promise.all(tasks);
  if(doc===document)await document.fonts.ready;
}
// Show loading only over the affected media; never intercept navigation or scene controls.
const mediaStates=new WeakMap();
function watchMedia(root){
  const watch=node=>{
    if(node.closest('[hidden],[data-place-scene][aria-hidden="true"]'))return;
    const isSvg=node.tagName.toLowerCase()==='image';
    const key=isSvg?node.getAttribute('href'):(node.getAttribute('src')||node.dataset.gpSrc||'')+'|'+(node.getAttribute('srcset')||node.dataset.gpSrcset||'');
    if(!key||mediaStates.get(node)?.key===key)return;
    const previous=mediaStates.get(node);previous?.overlay?.remove();
    const host=isSvg?node.closest('figure'):node.parentElement;
    if(!host)return;
    const state={key};mediaStates.set(node,state);
    if(!isSvg&&node.complete&&node.naturalWidth&&!node.dataset.gpSrc)return;
    const overlay=document.createElement('span');overlay.className='gp-media-wait';overlay.setAttribute('role','status');overlay.setAttribute('aria-label','图片加载中');
    const spinner=document.createElement('span');spinner.className='gp-spinner';overlay.append(spinner);
    if(getComputedStyle(host).position==='static')host.style.position='relative';
    host.append(overlay);state.overlay=overlay;
    const ready=()=>isSvg?loadImage(node.getAttribute('href')):node.dataset.gpSrc?readyImage(node):node.decode();
    const run=()=>{overlay.replaceChildren(spinner);overlay.setAttribute('aria-label','图片加载中');ready().then(()=>{if(mediaStates.get(node)===state)overlay.remove();}).catch(()=>{
      if(mediaStates.get(node)!==state)return;
      const retry=document.createElement('button');retry.type='button';retry.textContent='图片未载入，重试';retry.onclick=event=>{event.preventDefault();event.stopPropagation();if(!isSvg&&!node.dataset.gpSrc){const src=node.src;node.removeAttribute('src');node.src=src;}run();};overlay.replaceChildren(retry);overlay.setAttribute('aria-label','图片加载失败');
    });};run();
  };
  const scan=()=>root.querySelectorAll('img,svg[data-gp-crop] image').forEach(watch);scan();
  const observer=new MutationObserver(scan);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset','href','hidden','aria-hidden','data-state']});
  document.addEventListener('astro:before-swap',()=>observer.disconnect(),{once:true});
}
let backgroundStarted=false;
function preloadArchive() {
  if(backgroundStarted)return; backgroundStarted=true;
  void (async()=>{
    const response=await fetch(new URL('../archive-resources.v2.json',import.meta.url),{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('Manifest unavailable');
    const manifest=await response.json();const resources=await deviceResources(manifest.resources);
    let cursor=0;
    await Promise.all(Array.from({length:2},async()=>{while(cursor<resources.length){const item=resources[cursor++];try{const r=await fetch(item.url,{priority:'low',signal:AbortSignal.timeout(30000)});if(r.ok)await r.arrayBuffer();}catch{}}}));
    window.__gpBackgroundComplete=true;
  })().catch(()=>{backgroundStarted=false;});
}
const initialized=new WeakSet();
function initialize(){
  const root=document.querySelector('[data-route-content]');if(!root||initialized.has(root))return;initialized.add(root);
  watchMedia(root);
  if(window.__gpArchiveReady){void prepareDocument(document).catch(()=>{});preloadArchive();return;}
  window.__gpArchiveLoading=true;
  const label=document.querySelector('[data-gp-loading-label]');if(label)label.textContent='正在准备当前页面…';
  const progress=document.querySelector('[data-gp-progress]');if(progress)progress.textContent='图片与字体准备完成后即可进入';
  void prepareDocument(document).then(()=>{
    if(!root.isConnected)return;
    window.__gpArchiveReady=true;document.dispatchEvent(new Event('gp:archive-ready'));
    const start=()=>preloadArchive();
    if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:2000});else setTimeout(start,500);
  }).catch(()=>{
    const shell=document.querySelector('#gp-loading');
    if(shell){shell.querySelector('[data-gp-loading-label]').textContent='当前页面尚未准备好';shell.querySelector('[data-gp-progress]').textContent='请检查网络后重试';shell.querySelector('[data-gp-retry]').hidden=false;}
  });
}
document.addEventListener('astro:page-load',initialize);initialize();
