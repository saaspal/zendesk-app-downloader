// Page-context messenger – runs in the real Zendesk origin
(() => {
  const ZENDESK_ORIGIN = location.origin;

  // 1.  grab cookies that the browser would send anyway
  const cookies = document.cookie;

  // 2.  if the page has a ZAF client, copy its default headers
  const zafHeaders = {};
  if (window.zafClient && window.zafClient._defaultHeaders) {
    Object.assign(zafHeaders, window.zafClient._defaultHeaders);
  }

  // 3.  listen for requests from the extension popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_AUTH") {
      sendResponse({ cookies, zafHeaders, origin: ZENDESK_ORIGIN });
      return true; // keep channel open for async response
    }
  });
})();
