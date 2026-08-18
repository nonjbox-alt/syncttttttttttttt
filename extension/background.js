const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const state = {
  sourceTabId: null,
  syncRoomTabId: null,
};

const isSyncRoomUrl = (url = '') => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'syncttttttttttttt.vercel.app' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

async function sendToTab(tabId, message) {
  if (tabId == null) return;
  try {
    await browserApi.tabs.sendMessage(tabId, message);
  } catch (_) {
    // The tab may not have a content script yet (about:, extension pages, etc.).
  }
}

async function findSyncRoomTab() {
  const tabs = await browserApi.tabs.query({});
  const roomTab = tabs.find((tab) => isSyncRoomUrl(tab.url));
  if (roomTab?.id != null) {
    state.syncRoomTabId = roomTab.id;
    await browserApi.storage.local.set({ syncRoomTabId: roomTab.id });
  }
  return roomTab || null;
}

browserApi.runtime.onMessage.addListener(async (message, sender) => {
  if (!message?.type) return;

  if (message.type === 'PAIR_SOURCE_TAB') {
    if (sender.tab?.id != null) state.sourceTabId = sender.tab.id;
    await browserApi.storage.local.set({ sourceTabId: state.sourceTabId });
    const roomTab = await findSyncRoomTab();
    await sendToTab(state.sourceTabId, { type: 'BRIDGE_PAIRED', role: 'source' });
    if (roomTab?.id != null) await sendToTab(roomTab.id, { type: 'BRIDGE_STATUS', connected: true });
    return { ok: true, roomTabId: roomTab?.id ?? null };
  }

  if (message.type === 'PAIR_SYNCROOM_TAB') {
    if (sender.tab?.id != null) state.syncRoomTabId = sender.tab.id;
    await browserApi.storage.local.set({ syncRoomTabId: state.syncRoomTabId });
    return { ok: true };
  }

  if (message.type === 'SOURCE_MEDIA_READY' || message.type === 'SOURCE_MEDIA_EVENT') {
    if (sender.tab?.id != null) state.sourceTabId = sender.tab.id;
    await sendToTab(state.syncRoomTabId, message);
    return { ok: true };
  }

  if (message.type === 'SYNCROOM_COMMAND') {
    await sendToTab(state.sourceTabId, message);
    return { ok: true };
  }

  if (message.type === 'GET_STATE') {
    const stored = await browserApi.storage.local.get(['sourceTabId', 'syncRoomTabId']);
    state.sourceTabId = stored.sourceTabId ?? state.sourceTabId;
    state.syncRoomTabId = stored.syncRoomTabId ?? state.syncRoomTabId;
    const sourceTab = state.sourceTabId != null ? await browserApi.tabs.get(state.sourceTabId).catch(() => null) : null;
    const syncRoomTab = state.syncRoomTabId != null ? await browserApi.tabs.get(state.syncRoomTabId).catch(() => null) : null;
    return {
      sourceTabId: state.sourceTabId,
      syncRoomTabId: state.syncRoomTabId,
      sourceTitle: sourceTab?.title || null,
      syncRoomTitle: syncRoomTab?.title || null,
    };
  }
});

browserApi.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === state.sourceTabId) {
    state.sourceTabId = null;
    await browserApi.storage.local.remove('sourceTabId');
  }
  if (tabId === state.syncRoomTabId) {
    state.syncRoomTabId = null;
    await browserApi.storage.local.remove('syncRoomTabId');
  }
});

browserApi.runtime.onInstalled.addListener(() => {
  browserApi.storage.local.get(['sourceTabId', 'syncRoomTabId']).then((stored) => {
    state.sourceTabId = stored.sourceTabId ?? null;
    state.syncRoomTabId = stored.syncRoomTabId ?? null;
  });
});
