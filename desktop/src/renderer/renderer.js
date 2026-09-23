/* global window, document */
const statusEl = document.getElementById('status');
const latestEl = document.getElementById('latest');
const latestAmountEl = document.getElementById('latest-amount');
const latestContentEl = document.getElementById('latest-content');
const latestTimeEl = document.getElementById('latest-time');
const announceStateEl = document.getElementById('announce-state');
const historyEl = document.getElementById('history');
const errorsEl = document.getElementById('errors');
const volumeEl = document.getElementById('volume');
const voiceEl = document.getElementById('voice');
const autoStartEl = document.getElementById('auto-start');

const STATUS_LABEL = {
  connected: ['🟢 CONNECTED', 'connected'],
  connecting: ['🟡 CONNECTING', 'connecting'],
  disconnected: ['🔴 DISCONNECTED', 'disconnected'],
};

window.atieu.onConnectionStatus((status) => {
  const [label, cls] = STATUS_LABEL[status] || STATUS_LABEL.disconnected;
  statusEl.textContent = label;
  statusEl.className = cls;
});

window.atieu.onConnectionError((message) => {
  errorsEl.textContent = `Lỗi kết nối: ${message}`;
});

window.atieu.onSettings((settings) => {
  volumeEl.value = settings.volume;
  autoStartEl.checked = !!settings.autoStart;
  window.atieu.listVoices().then((voices) => {
    voiceEl.innerHTML = '';
    for (const v of voices) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === settings.voice) opt.selected = true;
      voiceEl.appendChild(opt);
    }
  });
});

function fmtAmount(amount) {
  return `${amount.toLocaleString('vi-VN')} VND`;
}

function renderHistory(entries) {
  historyEl.innerHTML = '';
  for (const e of entries) {
    const li = document.createElement('li');
    const time = new Date(e.receivedAt).toLocaleTimeString('vi-VN');
    li.textContent = `${fmtAmount(e.amount)} — ${e.content || ''} — ${time} ${e.announced ? '🔊' : ''}`;
    historyEl.appendChild(li);
  }

  if (entries.length > 0) {
    const latest = entries[0];
    latestEl.style.display = 'block';
    latestAmountEl.textContent = fmtAmount(latest.amount);
    latestContentEl.textContent = latest.content || '(không có nội dung)';
    latestTimeEl.textContent = new Date(latest.receivedAt).toLocaleTimeString('vi-VN');
  }
}

window.atieu.onHistory((entries) => renderHistory(entries));

window.atieu.onAnnounced(() => {
  announceStateEl.textContent = '🔊 Đã phát thông báo';
  errorsEl.textContent = '';
});

window.atieu.onTtsError((payload) => {
  announceStateEl.textContent = '⚠️ Lỗi phát âm thanh — giao dịch vẫn được lưu.';
  errorsEl.textContent = `Lỗi TTS: ${payload.error}`;
});

document.getElementById('test-speaker').addEventListener('click', async () => {
  const res = await window.atieu.testSpeaker();
  errorsEl.textContent = res.ok ? '' : `Test loa thất bại: ${res.error}`;
});

document.getElementById('test-tts').addEventListener('click', async () => {
  const res = await window.atieu.testTts('Đây là thông báo thử nghiệm hai trăm nghìn đồng.');
  errorsEl.textContent = res.ok ? '' : `Test TTS thất bại: ${res.error}`;
});

document.getElementById('retry').addEventListener('click', async () => {
  await window.atieu.retryAnnouncement();
});

volumeEl.addEventListener('change', () => {
  window.atieu.updateSettings({ volume: Number(volumeEl.value) });
});

voiceEl.addEventListener('change', () => {
  window.atieu.updateSettings({ voice: voiceEl.value });
});

autoStartEl.addEventListener('change', () => {
  window.atieu.updateSettings({ autoStart: autoStartEl.checked });
});
