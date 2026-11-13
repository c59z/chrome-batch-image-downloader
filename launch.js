chrome.action.onClicked.addListener(tab => {
  chrome.tabs.create({url: chrome.runtime.getURL("download.html") + "#" + tab.id});
});