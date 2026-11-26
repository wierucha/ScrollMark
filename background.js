const MENU_ID = "scrollmark-save-position";
const PENDING = "pending:";

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Bookmark this position with ScrollMark",
    contexts: ["page", "selection"]
  });
});

function flashBadge(tabId, text, color) {
  browser.action.setBadgeBackgroundColor({ color, tabId });
  browser.action.setBadgeText({ text, tabId });
  setTimeout(() => browser.action.setBadgeText({ text: "", tabId }), 2000);
}

// Pages that were already open before the add-on was installed or updated have no
// content script yet, so inject it on demand (allowed by activeTab).
async function saveInTab(tabId, source) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "PING" });
  } catch (_) {
    await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
  const result = await browser.tabs.sendMessage(tabId, { type: "SAVE_POSITION", source });
  return Boolean(result?.ok);
}

async function saveAndNotify(tabId, source) {
  try {
    const ok = await saveInTab(tabId, source);
    flashBadge(tabId, ok ? "✓" : "!", ok ? "#287a42" : "#b3261e");
    return ok;
  } catch (e) {
    console.warn("ScrollMark could not save this page:", e);
    flashBadge(tabId, "!", "#b3261e");
    return false;
  }
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) saveAndNotify(tab.id, "context");
});

browser.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "save-position") return;
  const target = tab || (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target?.id) saveAndNotify(target.id, "toolbar");
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "SAVE_ACTIVE") {
    return browser.tabs.query({ active: true, lastFocusedWindow: true }).then(async ([tab]) => {
      if (!tab?.id) return { ok: false };
      try {
        return { ok: await saveInTab(tab.id, "toolbar") };
      } catch (_) {
        return { ok: false };
      }
    });
  }
  // Opening a bookmark is handled here because the popup is destroyed
  // as soon as the new tab takes focus.
  if (message?.type === "OPEN_MARK") {
    return browser.tabs.create({ url: message.record.url, active: true }).then((tab) =>
      browser.storage.session.set({ [PENDING + tab.id]: message.record }).then(() => ({ ok: true }))
    );
  }
  if (message?.type === "GET_PENDING_RESTORE" && sender.tab) {
    const key = PENDING + sender.tab.id;
    return browser.storage.session.get(key).then((data) =>
      browser.storage.session.remove(key).then(() => data[key] || null)
    );
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  browser.storage.session.remove(PENDING + tabId);
});
