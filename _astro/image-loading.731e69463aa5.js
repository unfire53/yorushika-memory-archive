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
const initialized = new WeakSet();
function initialize() {
  const root = document.querySelector('[data-route-content]');
  if (!root || initialized.has(root)) return;
  initialized.add(root);
  // Release the first-visit shell using only the background and primary visible picture.
  const critical = async () => {
    const deskElement=document.querySelector('[data-persistent-desk]');
    const desk=deskElement && getComputedStyle(deskElement).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    const primary=root.querySelector('[data-place-scene].is-active .photo-print--1 img') || [...root.querySelectorAll('img[src]')].find(i=>i.getClientRects().length);
    const jobs=[];
    // The picture may finish before Astro installs the page's interaction handlers.
    // Its idle marker confirms that initialization and the entry animation finished.
    const scene=root.querySelector('[data-page-motion]');
    if(scene && scene.dataset.pageMotion!=='idle')jobs.push(new Promise(resolve=>{
      const observer=new MutationObserver(()=>{if(scene.dataset.pageMotion==='idle'){observer.disconnect();resolve();}});
      observer.observe(scene,{attributes:true,attributeFilter:['data-page-motion']});
      setTimeout(()=>{observer.disconnect();resolve();},7800);
    }));
    if(primary)jobs.push(primary.decode());
    if(desk){const image=new Image();image.src=desk;jobs.push(image.decode());}
    await Promise.allSettled(jobs);
    document.dispatchEvent(new Event('gp:critical-ready'));
  };
  void critical();
  const controller = new AbortController();
  document.addEventListener('astro:before-swap', () => controller.abort(), {once: true});
  // Background warmup waits until visible pictures and the desk have finished loading.
  const warm = async () => {
    const visible = [...root.querySelectorAll('img:not([data-gp-src])')].filter(i => i.getClientRects().length);
    await Promise.allSettled(visible.map(i => i.decode()));
    const desk = getComputedStyle(document.querySelector('[data-persistent-desk]')).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (desk) { const image = new Image(); image.src = desk; await image.decode().catch(() => {}); }
    if (controller.signal.aborted || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
    const run = () => {
      if (!root.isConnected || controller.signal.aborted) return;
      const hidden = root.querySelector('[data-place-scene][aria-hidden="true"]');
      if (hidden) {
        hidden.querySelectorAll('img').forEach(i => i.fetchPriority = 'low');
        void readyTarget(hidden).catch(() => {});
      }
    };
    // No timeout: idle warmup must never outrank the first visible scene.
    if ('requestIdleCallback' in window) requestIdleCallback(run); else setTimeout(run, 2000);
  };
  if (document.readyState === 'complete') void warm();
  else window.addEventListener('load', () => void warm(), {once: true, signal: controller.signal});
}
document.addEventListener('astro:page-load', initialize);
initialize();
