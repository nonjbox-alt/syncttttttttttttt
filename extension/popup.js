const browserApi = typeof browser !== 'undefined' ? browser : chrome;
const statusEl = document.getElementById('status');

const render = (state) => {
  const connected = state.sourceTabId != null && state.syncRoomTabId != null;
  statusEl.className = `status${connected ? ' ok' : ''}`;
  statusEl.innerHTML = `<span class="dot"></span>${connected ? 'Bridge connected' : 'Pair a source tab and a SyncRoom tab.'}`;
};

async function refresh() {
  render(await browserApi.runtime.sendMessage({ type: 'GET_STATE' }));
}

document.getElementById('pair').addEventListener('click', async () => {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id != null) await browserApi.tabs.sendMessage(tab.id, { type: 'PAIR_SOURCE_TAB' }).catch(() => {});
  await refresh();
});

document.getElementById('room').addEventListener('click', async () => {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id != null) await browserApi.tabs.sendMessage(tab.id, { type: 'PAIR_SYNCROOM_TAB' }).catch(() => {});
  await refresh();
});

refresh();
