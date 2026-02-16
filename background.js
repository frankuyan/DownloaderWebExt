const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "download") {
    const urls = message.urls;
    let completed = 0;
    let failed = 0;

    for (const url of urls) {
      api.downloads.download({ url }, (downloadId) => {
        if (api.runtime.lastError) {
          failed++;
        } else {
          completed++;
        }
        if (completed + failed === urls.length) {
          sendResponse({ completed, failed });
        }
      });
    }

    return true; // keep message channel open for async response
  }
});
