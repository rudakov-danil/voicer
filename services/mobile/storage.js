let opening;
export function openDB() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open('voicer-mobile', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('recordings', {keyPath: 'id'});
      const chunks = request.result.createObjectStore('chunks', {keyPath: ['recordingId', 'index']});
      chunks.createIndex('recordingId', 'recordingId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}
async function transaction(names, mode, operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить запись'));
    operation(tx, result => {value = result;});
  });
}
export const saveRecording = record => transaction(['recordings'], 'readwrite', tx => tx.objectStore('recordings').put(record));
export const listRecordings = () => transaction(['recordings'], 'readonly', (tx, done) => {
  tx.objectStore('recordings').getAll().onsuccess = event => done(event.target.result);
});
export const saveChunk = (record, blob, index) => transaction(['recordings', 'chunks'], 'readwrite', tx => {
  tx.objectStore('chunks').put({recordingId: record.id, index, blob});
  tx.objectStore('recordings').put(record);
});
export const readAudio = record => transaction(['chunks'], 'readonly', (tx, done) => {
  tx.objectStore('chunks').index('recordingId').getAll(record.id).onsuccess = event => {
    const chunks = event.target.result.sort((a,b) => a.index - b.index);
    done(new Blob(chunks.map(chunk => chunk.blob), {type: record.mime}));
  };
});
export const removeRecording = record => transaction(['recordings', 'chunks'], 'readwrite', tx => {
  tx.objectStore('recordings').delete(record.id);
  tx.objectStore('chunks').index('recordingId').openCursor(record.id).onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {cursor.delete(); cursor.continue();}
  };
});
