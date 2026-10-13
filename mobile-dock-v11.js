'use strict';
// V1.1 Dock settings are private to this browser, never part of snapshot transfer.
(() => {
  const dbName = 'tourists-dock-v11', limit = 4 * 1024 * 1024;
  const cover = document.getElementById('mobile-cover');
  const mount = document.getElementById('mobile-cover-dock');
  const dialog = document.getElementById('mobile-dock-dialog');
  const title = document.getElementById('mobile-dock-dialog-title');
  const content = document.getElementById('mobile-dock-dialog-content');
  const close = document.getElementById('mobile-dock-dialog-close');
  let dbPromise, tripKey = null, generation = 0, objectUrls = [], library = [], tripEntries = [];
  function openDb() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('apps')) db.createObjectStore('apps', {keyPath: 'id'});
        if (!db.objectStoreNames.contains('trips')) db.createObjectStore('trips', {keyPath: 'id'});
        if (!db.objectStoreNames.contains('app-metadata')) db.createObjectStore('app-metadata', {keyPath: 'id'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function transaction(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode), request = fn(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const all = (store) => transaction(store, 'readonly', s => s.getAll());
  const get = (store, id) => transaction(store, 'readonly', s => s.get(id));
  const put = (store, value) => transaction(store, 'readwrite', s => s.put(value));
  const del = (store, id) => transaction(store, 'readwrite', s => s.delete(id));
  const element = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function button(label, action, cls = '') {
    const b = element('button', cls, label); b.type = 'button'; b.addEventListener('click', action); return b;
  }
  function releaseUrls() { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls = []; }
  function imageUrl(blob) { const url = URL.createObjectURL(blob); objectUrls.push(url); return url; }
  function showDialog(heading) { title.textContent = heading; content.replaceChildren(); dialog.hidden = false; }
  function hideDialog() { dialog.hidden = true; content.replaceChildren(); }
  function field(label, placeholder, value = '') {
    const labelEl = element('label', '', label);
    const input = element('input', 'mobile-dock-input'); input.placeholder = placeholder; input.value = value; input.maxLength = 80;
    labelEl.append(input); content.append(labelEl); return input;
  }
  function message(text) { const p = element('p', 'mobile-dock-message', text); content.append(p); return p; }
  function actions(...buttons) { const row = element('div', 'mobile-dock-actions');row.append(...buttons);content.append(row); }
  const folderUrl = name => 'shareddocuments:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/' + encodeURIComponent(name) + '/';
  function launch(entry) {
    if (entry.type === 'folder') window.location.href = folderUrl(entry.folder);
    if (entry.type === 'app') window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(entry.shortcut);
  }
  async function refresh() {
    const current = ++generation;
    try {
      const [apps, metadata, record] = await Promise.all([all('apps'), all('app-metadata'), tripKey ? get('trips', tripKey) : Promise.resolve(null)]);
      if (current !== generation) return;
      const byId = new Map(metadata.map(item => [item.id, item]));
      library = apps.map(app => ({...app, ...(byId.get(app.id) || {})}));
      tripEntries = record?.entries || []; render();
    } catch (_) { if (current === generation) { mount.replaceChildren(button('＋ 追加', () => message('Dockの保存領域を開けません。'))); } }
  }
  function render() {
    // Each render creates fresh object URLs. Retain prior URLs for the lifetime
    // of the page: WebKit may decode previously displayed Blob URLs lazily.
    // They are all released on pagehide, not during an unrelated Dock edit.
    mount.replaceChildren();
    if (!tripKey) return;
    for (const entry of tripEntries) {
      const app = entry.type === 'app' ? library.find(a => a.id === entry.appId) : null;
      if (entry.type === 'app' && !app) continue;
      const name = entry.type === 'folder' ? '書類' : app.name;
      const b = element('button', 'mobile-dock-item'); b.type='button';b.title=name; b.setAttribute('aria-label', name+'を開く');
      if (app?.blob) { const img = element('img', 'mobile-dock-icon');img.src=imageUrl(app.blob);img.alt='';b.append(img); }
      else if (entry.type === 'folder' && entry.iconBlob) { const img = element('img', 'mobile-dock-icon'); img.src = imageUrl(entry.iconBlob); img.alt = ''; b.append(img); }
      else if (entry.type === 'folder') b.append(element('span', 'mobile-dock-icon mobile-dock-icon-fallback', '📁'));
      else b.append(element('span', 'mobile-dock-icon mobile-dock-icon-fallback', '📁'));
      b.append(element('span', 'mobile-dock-label', name));
      b.addEventListener('click', () => launch(entry.type === 'folder' ? entry : {...entry,shortcut:app.shortcut}));
      b.addEventListener('contextmenu', e => {e.preventDefault(); edit(entry);});
      let hold; b.addEventListener('touchstart',()=>{hold=setTimeout(()=>{hold=undefined;edit(entry)},650)},{passive:true});
      for(const event of ['touchend','touchmove','touchcancel'])b.addEventListener(event,()=>{if(hold){clearTimeout(hold);hold=undefined}},{passive:true});
      mount.append(b);
    }
    const add = element('button', 'mobile-dock-item mobile-dock-add');add.type='button';
    add.append(element('span','mobile-dock-icon mobile-dock-icon-fallback','＋'),element('span','mobile-dock-label','追加'));
    add.addEventListener('click',chooseType);mount.append(add);
    mount.classList.toggle('mobile-dock-scroll', mount.childElementCount > 4);
  }
  async function saveTrip(entries) { if (!tripKey) return;await put('trips', {id:tripKey,entries});await refresh(); }
  function chooseType() {
    showDialog('Dockに追加');
    actions(button('アプリ', chooseApp),button('書類', chooseFolder));
  }
  function chooseApp() {
    showDialog('アプリを追加');
    if (library.length) {
      message('登録済みから選ぶ');
      for(const app of library) actions(button(app.name, async()=>{await saveTrip([...tripEntries.filter(e=>e.appId!==app.id),{type:'app',appId:app.id}]);hideDialog();}));
    }
    actions(button('新しいアプリを登録', () => newApp()));
  }
  function newApp(existing = null) {
    showDialog(existing ? 'アプリを編集' : 'アプリを登録');
    const name=field('表示名','ANA',existing?.name||'');
    const shortcut=field('ショートカット名','Dockテスト',existing?.shortcut||'');
    const label=element('label','', 'アイコン画像');
    const file=element('input','mobile-dock-input');file.type='file';file.accept='image/*';label.append(file);content.append(label);
    const error=message('画像はこのiPhone内だけに保存されます。');
    actions(button('保存',async()=>{
      const n=name.value.trim(),s=shortcut.value.trim();
      const selectedFile=file.files?.[0] || null;
      // Safari may invalidate File-backed artwork when a record is rewritten.
      // Persist plain Blob bytes and retain the existing image if unchanged.
      const source=selectedFile || existing?.blob;
      const blob=source instanceof Blob ? source : null;
      if(!n||!s||!blob||!blob.type.startsWith('image/')||blob.size>limit){error.textContent='名前・ショートカット名・4MB以下の画像を指定してください。';return}
      const id=existing?.id||('app-'+Date.now()+'-'+Math.random().toString(36).slice(2));
      try {
        if (existing && !selectedFile) {
          // Metadata-only edit: do not rewrite the existing image Blob in IndexedDB.
          await put('app-metadata',{id,name:n,shortcut:s});
        } else {
          await put('apps',{id,name:n,shortcut:s,blob});
          if (existing) await put('app-metadata',{id,name:n,shortcut:s});
        }
        if (!existing && tripKey) {
          const record = await get('trips',tripKey);
          const entries = record?.entries || [];
          if (!entries.some(e => e.type === 'app' && e.appId === id)) await put('trips',{id:tripKey,entries:[...entries,{type:'app',appId:id}]});
        }
        await refresh();
        hideDialog();
      }
      catch(_){error.textContent='保存できませんでした。端末の空き容量を確認してください。'}
    },'mobile-dock-primary'));
  }
  function chooseFolder() {
    const old=tripEntries.find(e=>e.type==='folder');
    showDialog(old?'書類フォルダを変更':'書類フォルダを追加');
    const name=field('iCloud Drive直下のフォルダ名','旅行書類',old?.folder||'');
    const iconLabel = element('label', '', '書類アイコン画像（任意）');
    const iconFile = element('input', 'mobile-dock-input'); iconFile.type = 'file'; iconFile.accept = 'image/*'; iconLabel.append(iconFile); content.append(iconLabel);
    const error=message('画像はこのiPhoneにだけ保存されます。未選択なら標準アイコンを使用します。');
    actions(button('保存',async()=>{
      const folder=name.value.trim();
      if(!folder||folder==='.'||folder==='..'||folder.includes('/')||folder.includes('\\')){error.textContent='有効なフォルダ名を入力してください。';return}
      const iconBlob = iconFile.files?.[0] || old?.iconBlob || null;
      if(iconBlob && (!iconBlob.type.startsWith('image/') || iconBlob.size > limit)){error.textContent='4MB以下の画像を選んでください。';return}
      try{await saveTrip([{type:'folder',folder,...(iconBlob ? {iconBlob} : {})},...tripEntries.filter(e=>e.type!=='folder')]);hideDialog()}catch(_){error.textContent='保存できませんでした。'}
    },'mobile-dock-primary'));
  }
  function edit(entry) {
    showDialog('Dockを編集');
    if(entry.type==='app'){
      const app=library.find(a=>a.id===entry.appId);
      if(app)actions(button('アプリ情報を編集',()=>newApp(app)));
    }else actions(button('フォルダ名を変更',chooseFolder));
    actions(button('この旅行から外す',async()=>{await saveTrip(tripEntries.filter(e=>e!==entry));hideDialog();}));
  }
  close.addEventListener('click',hideDialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog)hideDialog()});
  globalThis.TouristsDockV11 = {
    show(snapshot) {
      const key=globalThis.MobileSnapshotStore?.tripKey(snapshot)||null;
      if(key===tripKey)return;tripKey=key;void refresh();
    },
    async removeTrip(key){await del('trips',key);if(tripKey===key){tripKey=null;mount.replaceChildren();}}
  };
  window.addEventListener('pagehide',releaseUrls);
})();
