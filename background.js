// background.js
chrome.runtime.onInstalled.addListener(() => {
  // Allows content scripts to access chrome.storage.session
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
});
