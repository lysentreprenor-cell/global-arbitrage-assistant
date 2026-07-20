// 🖥️ Otwiera panel Gadacza z boku przeglądarki po kliknięciu ikony.
// Panel boczny ZOSTAJE otwarty, gdy klikasz stronę — dlatego głos i „mówisz i robi"
// działają w trakcie przeglądania (zwykłe okienko-popup by się zamykało).
chrome.runtime.onInstalled.addListener(() => {
  try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (e) {}
});
chrome.action.onClicked.addListener((tab) => {
  try { chrome.sidePanel.open({ tabId: tab.id }); } catch (e) {}
});
