'use strict';
(() => {
  const base = new URL('./', location.href);
  history.scrollRestoration = 'manual';
  window.scrollTo({top:0,behavior:'instant'});
  const form = document.querySelector('#unlock-form');
  const input = document.querySelector('#review-password');
  const button = document.querySelector('#unlock-button');
  const status = document.querySelector('#unlock-status');
  const textEncoder = new TextEncoder();
  const fromBase64 = value => Uint8Array.from(atob(value), x => x.charCodeAt(0));
  async function fetchBytes(path) {
    const response = await fetch(new URL(path, base), {cache: 'no-store'});
    if (!response.ok) throw new Error('network');
    return new Uint8Array(await response.arrayBuffer());
  }
  async function decrypt(bytes, key, name) {
    return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:textEncoder.encode('LEANS review v1:'+name)},key,bytes.slice(12));
  }
  document.querySelector('#show-password').addEventListener('click', e => {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    e.currentTarget.textContent = visible ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(visible));
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!input.value || button.disabled) return;
    button.disabled = true;
    status.textContent = 'Opening your learning module…';
    let stage = 'load';
    try {
      if (!crypto.subtle) throw new Error('unsupported');
      const response = await fetch(new URL('access.json',base),{cache:'no-store'});
      if (!response.ok) throw new Error('network');
      const manifest = await response.json();
      if (manifest.version !== 1 || manifest.iterations !== 600000) throw new Error('version');
      const passwordMaterial = await crypto.subtle.importKey('raw',textEncoder.encode(input.value),'PBKDF2',false,['deriveKey']);
      const key = await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:fromBase64(manifest.salt),iterations:manifest.iterations},passwordMaterial,{name:'AES-GCM',length:256},false,['decrypt']);
      const encrypted = await fetchBytes(manifest.module.path);
      stage = 'decrypt';
      const html = new TextDecoder().decode(await decrypt(encrypted,key,manifest.module.path));
      input.value = '';
      let downloadBusy = false;
      let lastDownloadURL;
      window.downloadProtectedSlides = async () => {
        if (downloadBusy) return;
        downloadBusy = true;
        const notice = document.querySelector('#private-download-notice');
        notice.hidden = false;
        notice.textContent = 'Preparing the classroom slides…';
        notice.scrollIntoView({block:'nearest'});
        const file = manifest.downloads.slides;
        try {
          const parts = [];
          for (let i=0;i<file.parts.length;i++) {
            notice.textContent = `Preparing the classroom slides… ${i+1} of ${file.parts.length}`;
            parts.push(await decrypt(await fetchBytes(file.parts[i]),key,file.parts[i]));
          }
          const blob = new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
          if (blob.size !== file.bytes) throw new Error('size');
          if (lastDownloadURL) URL.revokeObjectURL(lastDownloadURL);
          lastDownloadURL = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = lastDownloadURL; link.download = file.filename; link.textContent = 'Save the classroom slides';
          notice.textContent = 'Your slides are ready. '; notice.append(link); link.click();
        } catch { notice.textContent = 'The slides could not be prepared. Please check your connection and select the slides link to try again.'; }
        finally { downloadBusy = false; }
      };
      document.open(); document.write(html); document.close();
      window.scrollTo({top:0,behavior:'instant'});
      document.querySelector('#main')?.focus({preventScroll:true});
    } catch (error) {
      status.textContent = stage === 'decrypt' ? 'That password didn’t open the module. Please try again.' : error.message === 'unsupported' ? 'Please open this page in a current browser over HTTPS.' : 'The module could not be loaded. Check your connection and try again.';
      button.disabled = false;
      input.focus();
    }
  });
})();
