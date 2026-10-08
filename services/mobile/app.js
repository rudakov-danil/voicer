import {session, setSession, login, request, allSellers} from './api.js';
import {openDB, saveRecording, listRecordings, saveChunk, readAudio, removeRecording} from './storage.js';

const $ = id => document.getElementById(id);
const MAX_LOCAL_BYTES = 95 * 1024 * 1024;
let sellers = [], recorder, stream, active, writes = Promise.resolve(), wakeLock;
let starting = false, stopping = false, uploading = false, tabOwnsRecorder = false;
let chunkIndex = 0, failedChunks = [], storageFailed = false, messageTimer;
let optionsReady = false;
const downloads = new Set();
const owner = () => session ? `${session.user.organization_id}:${session.user.id}` : null;
const selectionKey = () => `voicer-selection:${owner()}`;
const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const formatTime = seconds => {
  const minutes = Math.floor(seconds / 60), sec = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};
function message(text) {
  $('message').textContent = text; $('message').hidden = false;
  clearTimeout(messageTimer); messageTimer = setTimeout(() => {$('message').hidden = true;}, 12000);
}
function network() {
  $('network').textContent = navigator.onLine ? 'Онлайн' : 'Без сети';
  $('network').classList.toggle('offline', !navigator.onLine);
}
function errorText(error) {
  if (error.name === 'NotAllowedError') return 'Разрешите доступ к микрофону в настройках браузера.';
  if (error.name === 'NotFoundError') return 'Микрофон не найден.';
  if (error.name === 'NotReadableError') return 'Микрофон занят другим приложением. Закройте его и попробуйте снова.';
  if (error.name === 'QuotaExceededError') return 'Недостаточно места на телефоне. Скачайте запись перед закрытием страницы.';
  if (error.name === 'TimeoutError' || error.name === 'TypeError') return 'Нет связи с сервером. Запись сохранена для повторной отправки.';
  return error.message || 'Не удалось выполнить действие. Попробуйте снова.';
}
function screen() {
  $('login-panel').hidden = Boolean(session) || Boolean(active);
  $('recorder-panel').hidden = !session && !active;
  $('account').textContent = session?.user.email || 'Войдите снова, чтобы отправить сохранённую запись';
  const busy = starting || Boolean(active);
  $('store').disabled = $('seller').disabled = busy;
  $('logout').disabled = busy || uploading;
  $('record').disabled = starting || stopping || uploading || !tabOwnsRecorder || (!active && (!optionsReady || !$('seller').value));
  $('record').setAttribute('aria-label', active ? 'Остановить и отправить запись' : 'Начать запись');
  $('mic-icon').hidden = Boolean(active);
  $('mic-icon').style.display = active ? 'none' : '';
  document.querySelector('.stop-icon').hidden = !active;
  document.querySelector('.recorder').classList.toggle('recording', Boolean(active));
  $('record-label').textContent = stopping ? 'Сохраняем запись…' : starting ? 'Подключаем микрофон…' : active ? 'Остановить и отправить' : 'Нажмите, чтобы начать';
}
function fillSellers(preferred) {
  $('seller').replaceChildren();
  for (const seller of sellers.filter(s => s.store_id === $('store').value)) {
    $('seller').add(new Option(`${seller.first_name} ${seller.last_name}`, seller.id));
  }
  if (preferred && [...$('seller').options].some(o => o.value === preferred)) $('seller').value = preferred;
  screen();
}
async function loadOptions() {
  const currentOwner = owner();
  optionsReady = false; screen();
  let cached;
  try {cached = JSON.parse(localStorage.getItem(selectionKey()) || 'null');} catch {}
  try {
    sellers = await allSellers();
    if (owner() !== currentOwner) return;
    optionsReady = true;
    localStorage.setItem(`voicer-sellers:${currentOwner}`, JSON.stringify(sellers));
    $('reload-options').hidden = true;
  } catch(error) {
    if (owner() !== currentOwner) return;
    try {sellers = JSON.parse(localStorage.getItem(`voicer-sellers:${currentOwner}`) || '[]');} catch {sellers=[];}
    optionsReady = sellers.length > 0;
    $('reload-options').hidden = false;
    message(sellers.length ? 'Список сотрудников сохранён на телефоне. Доступ проверится при отправке.' : errorText(error));
  }
  $('store').replaceChildren();
  const stores = new Map(sellers.map(s => [s.store_id, s.store_name || 'Магазин']));
  for (const [id, name] of stores) $('store').add(new Option(name, id));
  if (cached && stores.has(cached.store)) $('store').value = cached.store;
  fillSellers(cached?.seller);
  if (!sellers.length) message('Нет доступных сотрудников. Добавьте сотрудника в личном кабинете или обратитесь к администратору.');
}
async function keepAwake() {
  if (!active || !$('keep-awake').checked || document.visibilityState !== 'visible' || wakeLock) return;
  if (!navigator.wakeLock) {
    message('Этот браузер не умеет удерживать экран. Отключите автоблокировку в настройках телефона.');
    return;
  }
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!active || !$('keep-awake').checked) {await lock.release(); return;}
    wakeLock = lock;
    lock.addEventListener('release', () => {if (wakeLock === lock) wakeLock = null;});
  } catch {message('Не удалось удержать экран включённым. Проверьте автоблокировку телефона.');}
}
function releaseAwake() {if (wakeLock) {wakeLock.release().catch(() => {}); wakeLock = null;}}
function supportedMime() {
  for (const mime of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  throw new Error('Этот браузер не поддерживает нужный формат записи. Откройте сайт в Safari или Chrome.');
}
async function startRecording() {
  if (starting || active || !tabOwnsRecorder) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    message('Запись доступна через HTTPS в Safari или Chrome.'); return;
  }
  const seller = sellers.find(s => s.id === $('seller').value);
  if (!seller || !session) return;
  starting = true; screen();
  try {
    await openDB();
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && estimate.quota-estimate.usage < 10*1024*1024) throw new Error('На телефоне мало места. Освободите память перед записью.');
    const mime = supportedMime();
    stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1, echoCancellation:true, noiseSuppression:true}, video:false});
    recorder = new MediaRecorder(stream, {mimeType:mime, audioBitsPerSecond:64000});
    const now = new Date();
    active = {id:crypto.randomUUID(), owner:owner(), seller_id:seller.id, store_id:seller.store_id,
      sellerName:`${seller.first_name} ${seller.last_name}`, storeName:seller.store_name,
      startedAt:now.toISOString(), day:localDay(now), mime:recorder.mimeType || mime,
      bytes:0, elapsed:0, status:'recording', warning:'', error:''};
    await saveRecording({...active});
    localStorage.setItem(selectionKey(), JSON.stringify({store:seller.store_id,seller:seller.id}));
    chunkIndex=0; failedChunks=[]; storageFailed=false; writes=Promise.resolve();
    recorder.addEventListener('dataavailable', event => {
      if (!event.data.size || !active) return;
      const index = chunkIndex++;
      active.bytes += event.data.size;
      active.elapsed = (Date.now()-Date.parse(active.startedAt))/1000;
      const snapshot = {...active};
      writes = writes.then(async () => {
        if (storageFailed) {failedChunks.push(event.data); return;}
        try {await saveChunk(snapshot, event.data, index);}
        catch(error) {
          storageFailed=true; failedChunks.push(event.data);
          active.warning='Не удалось полностью сохранить запись. Скачайте её до закрытия страницы.';
          message(errorText(error)); stopRecording();
        }
      });
      $('saved-state').textContent = `${(active.bytes/1024/1024).toFixed(1)} МБ · сохраняем на телефоне`;
      if (active.bytes >= MAX_LOCAL_BYTES) {
        active.warning='Достигнут предел размера записи. Начните следующую запись.';
        stopRecording();
      }
    });
    recorder.addEventListener('error', () => {
      if (active) active.warning='Браузер прервал запись. Проверьте сохранённый звук перед отправкой.';
      stopRecording();
    });
    recorder.addEventListener('stop', () => {finishRecording().catch(error => {message(errorText(error)); stopping=false; screen();});});
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('mute', () => {
        if (active) {active.warning='Микрофон временно приостанавливался. В записи могут быть пропуски.'; $('record-state').textContent='Микрофон приостановлен браузером';}
      });
      track.addEventListener('unmute', () => {if (active) $('record-state').textContent='Запись продолжается · проверьте возможные пропуски';});
      track.addEventListener('ended', () => {if (active) {active.warning='Доступ к микрофону прерван. Сохранена доступная часть.'; stopRecording();}});
    }
    recorder.start(3000);
    $('record-state').textContent='Идёт запись'; $('timer').textContent='00:00';
    $('saved-state').textContent='Звук сохраняется на этом телефоне';
    navigator.storage?.persist?.().catch(() => {});
    await keepAwake();
  } catch(error) {
    stream?.getTracks().forEach(t => t.stop());
    if (active && active.bytes===0) await removeRecording(active).catch(() => {});
    active=null; releaseAwake(); message(errorText(error));
  } finally {starting=false; screen();}
}
function stopRecording() {
  if (!active || stopping) return;
  stopping=true; screen();
  if (recorder.state !== 'inactive') recorder.stop();
  // An inactive recorder has already queued its stop event.
}
async function finishRecording() {
  stream?.getTracks().forEach(t => t.stop()); releaseAwake();
  await writes;
  const record = active;
  if (!record) return;
  record.elapsed=(Date.now()-Date.parse(record.startedAt))/1000;
  record.status=record.warning ? 'interrupted' : 'ready';
  if (record.bytes === 0) {
    await removeRecording(record); message('Браузер не передал звук. Запись не создана.');
  } else {
    if (!storageFailed) {
      try { await saveRecording({...record}); }
      catch { storageFailed=true; }
    }
    if (storageFailed) {
    // Keep the failed chunks reachable until the user downloads the recording.
    const saved = await readAudio(record);
    const blob = new Blob([saved, ...failedChunks], {type:record.mime});
    const url=URL.createObjectURL(blob); downloads.add(url);
    const card=document.createElement('div'); card.className='recording-item';
    const link=document.createElement('a'); link.href=url; link.download=`voicer-${record.id}.${extension(record.mime)}`;
    link.textContent='Скачать запись — сохранение на телефоне не завершено'; card.append(link);
    $('recordings').before(card);
    record.status='interrupted'; record.error='Сохранена только часть. Полная запись доступна по ссылке выше до закрытия страницы.';
    await saveRecording({...record}).catch(() => {});
    message('Память заполнена. Скачайте полную запись по ссылке. Не закрывайте страницу.');
    }
  }
  active=null; stopping=false; recorder=null;
  $('record-state').textContent=record.warning ? 'Запись завершена с предупреждением' : 'Запись сохранена';
  $('saved-state').textContent=record.warning || 'Готово к новой записи';
  screen(); await renderRecordings();
  if (!storageFailed) await sendQueue();
}
function extension(mime) {return mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';}
async function userRecords() {return (await listRecordings()).filter(r => r.owner===owner()).sort((a,b) => b.startedAt.localeCompare(a.startedAt));}
function action(label, callback, disabled=false) {
  const button=document.createElement('button'); button.className='text-button'; button.textContent=label; button.disabled=disabled;
  button.addEventListener('click', () => Promise.resolve(callback()).catch(error => message(errorText(error)))); return button;
}
async function renderRecordings() {
  if (!session) return;
  const records=await userRecords(); $('recordings').replaceChildren();
  if (!records.filter(r => r.id !== active?.id).length) {
    const empty=document.createElement('div'); empty.className='empty'; empty.textContent='Здесь появятся ваши записи'; $('recordings').append(empty);
  }
  for (const record of records.filter(r => r.id !== active?.id)) {
    const card=document.createElement('article'); card.className='recording-item';
    const title=document.createElement('p'); title.textContent=record.sellerName;
    const meta=document.createElement('p'); meta.className='meta';
    meta.textContent=`${new Date(record.startedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · ${formatTime(record.elapsed)} с начала · ${(record.bytes/1024/1024).toFixed(1)} МБ`;
    const state=document.createElement('p');
    state.textContent=({ready:'Ожидает отправки',uploading:'Отправляем…',sent:'Передано на анализ',interrupted:'Запись могла прерваться — проверьте звук',recording:'Незавершённая запись'})[record.status] || record.status;
    if (record.status==='sent') state.className='success';
    card.append(title,meta,state);
    if (record.warning || record.error) {
      const error=document.createElement('p'); error.className='error'; error.textContent=record.error || record.warning; card.append(error);
    }
    const buttons=document.createElement('div'); buttons.className='actions';
    if (record.status !== 'sent') buttons.append(action('Отправить', async () => {
      if (record.status==='interrupted' && !confirm('В записи могут быть пропуски. Отправить сохранённый звук на анализ?')) return;
      record.status='ready'; record.error=''; record.noAutoRetry=false; await saveRecording(record); await sendQueue();
    }, uploading || !tabOwnsRecorder));
    buttons.append(action('Скачать', async () => {
      const blob=await readAudio(record); const url=URL.createObjectURL(blob); downloads.add(url);
      const link=document.createElement('a'); link.href=url; link.download=`voicer-${record.id}.${extension(record.mime)}`; link.click();
      setTimeout(() => {URL.revokeObjectURL(url); downloads.delete(url);}, 60000);
    }));
    buttons.append(action('Удалить', async () => {
      if (!confirm(record.status==='sent' ? 'Удалить копию с телефона? Запись на сервере останется.' : 'Удалить неотправленную запись с телефона?')) return;
      await removeRecording(record); await renderRecordings();
    }, uploading || !tabOwnsRecorder));
    card.append(buttons); $('recordings').append(card);
  }
}
async function sendQueue() {
  if (uploading || !navigator.onLine || !session || !tabOwnsRecorder || active || starting) return;
  uploading=true; screen();
  try {
    for (const record of await userRecords()) {
      if (!session || owner()!==record.owner) break;
      if (record.status!=='ready' || record.noAutoRetry) continue;
      try {
        record.status='uploading'; record.error=''; await saveRecording(record); await renderRecordings();
        const blob=await readAudio(record);
        if (!blob.size || blob.size !== record.bytes) throw new Error('Сохранённый звук неполон. Скачайте и проверьте запись.');
        const data=new FormData(); data.append('file',blob,`recording.${extension(record.mime)}`);
        for (const [key,value] of Object.entries({seller_id:record.seller_id, store_id:record.store_id,
          session_date:record.day,client_upload_id:record.id,started_at:record.startedAt})) data.append(key,value);
        const result=await request('/api/v1/recorder/mobile/upload', {method:'POST',body:data});
        record.status='sent'; record.recordingId=result.recording_id;
        if (result.status==='failed') record.error='Файл на сервере, но анализ завершился ошибкой. Проверьте личный кабинет.';
        await saveRecording(record);
      } catch(error) {
        record.status='ready'; record.error=errorText(error);
        record.noAutoRetry=[400,403,409,413,415,422].includes(error.status) || record.error.includes('неполон');
        await saveRecording(record); message(record.error);
        if (!error.status || [401,502,503,504].includes(error.status)) break;
      }
    }
  } finally {uploading=false; screen(); await renderRecordings();}
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-button').disabled=true;
  try {await login($('email').value.trim(),$('password').value); $('password').value=''; screen(); await loadOptions(); await renderRecordings(); await sendQueue();}
  catch(error) {message(error.status===401 ? 'Неверный email или пароль.' : errorText(error));}
  finally {$('login-button').disabled=false;}
});
$('logout').addEventListener('click', () => {if (active || starting || uploading) return; setSession(null); sellers=[]; optionsReady=false; $('recordings').replaceChildren(); screen();});
$('record').addEventListener('click', () => active ? stopRecording() : startRecording());
$('store').addEventListener('change', () => fillSellers());
$('reload-options').addEventListener('click', () => loadOptions().catch(error=>message(errorText(error))));
$('retry-all').addEventListener('click', () => sendQueue().catch(error=>message(errorText(error))));
$('keep-awake').addEventListener('change', () => $('keep-awake').checked ? keepAwake() : releaseAwake());
window.addEventListener('online', () => {network(); sendQueue().catch(error=>message(errorText(error)));});
window.addEventListener('offline', network);
window.addEventListener('auth-expired', () => {if(active) stopRecording(); screen(); message('Войдите снова. Сохранённые записи останутся на телефоне.');});
window.addEventListener('beforeunload', event => {if (active || starting || storageFailed) {event.preventDefault(); event.returnValue='';}});
document.addEventListener('visibilitychange', () => {
  if (active && document.visibilityState==='visible') {
    keepAwake();
    if (stream?.getAudioTracks().some(t=>t.muted || t.readyState==='ended')) message('Микрофон приостановлен. Проверьте запись после остановки.');
  }
  // Do not stop/restart MediaRecorder on visibility changes: that would truncate recordings.
});
setInterval(() => {if (active) $('timer').textContent=formatTime((Date.now()-Date.parse(active.startedAt))/1000);}, 500);
setInterval(() => sendQueue().catch(()=>{}), 60000);
async function init() {
  network(); screen();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  await openDB();
  if (navigator.locks) {
    await new Promise(resolve => {
      navigator.locks.request('voicer-mobile-recorder', {ifAvailable:true}, lock => {
        tabOwnsRecorder=Boolean(lock); resolve();
        if (lock) return new Promise(()=>{});
      }).catch(()=>resolve());
    });
  }
  if (!tabOwnsRecorder) {
    message('Откройте Voicer в одной вкладке Safari или Chrome. Закройте другие вкладки диктофона и обновите страницу.');
    screen(); return;
  }
  if (tabOwnsRecorder) {
    for (const record of await listRecordings()) {
      if (record.status==='recording') {record.status='interrupted'; record.warning='Браузер закрылся во время записи. Сохранены только полученные фрагменты.'; await saveRecording(record);}
      if (record.status==='uploading') {record.status='ready'; await saveRecording(record);}
    }
  }
  screen();
  if (session) {await loadOptions(); await renderRecordings(); await sendQueue();}
}
init().catch(error => {message(`Не удалось открыть хранилище: ${errorText(error)}`); $('record').disabled=true;});
