// ✍️ GADACZ — WTYCZKA (Faza 1). Mówisz albo piszesz, a Gadacz:
//  • czyta stronę na głos, klika w nią, wypełnia pola, przewija,
//  • korzysta z TEGO SAMEGO mózgu i pamięci co telefon (serwer /api/assistant).
//  „Uczenie się użytkownika" dzieje się na serwerze (learn:true) — pamięć jest
//  WSPÓLNA dla telefonu, komputera i wtyczki (jedno konto mózgu).

const $ = (id) => document.getElementById(id);
let cfg = { url: "", pin: "0905", speak: true };
const history = [];

chrome.storage.local.get(["url", "pin", "speak"], (r) => {
  cfg.url = r.url || ""; cfg.pin = r.pin || "0905"; cfg.speak = r.speak !== false;
  $("url").value = cfg.url; $("pin").value = cfg.pin; $("speak").checked = cfg.speak;
});
function saveCfg() {
  cfg.url = $("url").value.trim(); cfg.pin = $("pin").value.trim(); cfg.speak = $("speak").checked;
  chrome.storage.local.set(cfg);
}
["url", "pin", "speak"].forEach((id) => $(id).addEventListener("change", saveCfg));

function log(who, text) {
  const o = $("out");
  const d = document.createElement("div");
  const b = document.createElement("b"); b.textContent = who + ": ";
  d.appendChild(b); d.appendChild(document.createTextNode(text));
  o.appendChild(d); o.scrollTop = o.scrollHeight;
}
function say(t) {
  if (!cfg.speak) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "pl-PL"; speechSynthesis.speak(u); } catch (e) {}
}

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
async function pageText() {
  const t = await activeTab();
  if (!t || !t.id) return "";
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: t.id },
      func: () => (document.body ? document.body.innerText.slice(0, 4000) : ""),
    });
    return r && r.result ? r.result : "";
  } catch (e) { return ""; }
}

// --- funkcje wstrzykiwane na stronę (działają w kontekście karty) ---
function _clickByText(q) {
  q = (q || "").toLowerCase().trim(); if (!q) return false;
  const sel = "a,button,input,[role=button],[onclick],label,summary,[tabindex]";
  for (const el of document.querySelectorAll(sel)) {
    const s = ((el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "") + "").toLowerCase().trim();
    if (s && s.includes(q)) { el.scrollIntoView({ block: "center" }); el.click(); return true; }
  }
  return false;
}
function _typeText(t) {
  let el = document.activeElement;
  if (!el || !/input|textarea/i.test(el.tagName)) el = document.querySelector("input:not([type=hidden]):not([type=submit]),textarea");
  if (!el) return false;
  el.focus(); el.value = t;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
function _scroll(dir) { window.scrollBy(0, dir === "up" ? -600 : 600); }

async function doAction(action, args) {
  const t = await activeTab(); if (!t || !t.id) return;
  const a = (action || "").toLowerCase();
  const text = (args && (args.text || args.name || args.dir || args.url)) || "";
  try {
    if (a === "tap" || a === "click") {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, func: _clickByText, args: [text] });
    } else if (a === "type" || a === "write") {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, func: _typeText, args: [text] });
    } else if (a === "scroll") {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, func: _scroll, args: [text || "down"] });
    } else if ((a === "open" || a === "navigate" || a === "search") && text.startsWith("http")) {
      chrome.tabs.update(t.id, { url: text });
    }
  } catch (e) {}
}

async function run(text) {
  text = (text || "").trim(); if (!text) return;
  log("Ty", text); $("in").value = "";
  if (!cfg.url) { log("Gadacz", "Wpisz najpierw adres serwera z Replita i PIN u góry."); say("Wpisz adres serwera."); return; }
  const scr = await pageText();
  try {
    const body = {
      question: "EKRAN: " + scr + "\n\nPolecenie: " + text,
      history: history.slice(-10),
      clientTime: new Date().toLocaleString("pl-PL"),
      learn: true, // 🧠 serwer UCZY SIĘ użytkownika — pamięć wspólna z telefonem
    };
    const resp = await fetch(cfg.url.replace(/\/$/, "") + "/api/assistant/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-pin": cfg.pin },
      body: JSON.stringify(body),
    });
    const j = await resp.json();
    if (j.error) { log("Gadacz", "Błąd serwera: " + j.error); say("Błąd serwera."); return; }
    const sayTxt = j.say || "(brak odpowiedzi)";
    log("Gadacz", sayTxt); say(sayTxt);
    history.push({ role: "user", content: text }, { role: "assistant", content: sayTxt });
    if (j.action && j.action !== "none") await doAction(j.action, j.args || {});
  } catch (e) {
    log("Gadacz", "Nie mogę połączyć się z serwerem (sprawdź adres i czy serwer działa).");
    say("Nie mogę połączyć się z serwerem.");
  }
}

$("send").addEventListener("click", () => run($("in").value));
$("in").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run($("in").value); } });

// 🎤 rozpoznawanie mowy (Chrome/Edge)
let rec = null;
$("mic").addEventListener("click", () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { log("Gadacz", "Ta przeglądarka nie rozpoznaje mowy. Użyj Chrome albo Edge."); say("Użyj Chrome albo Edge."); return; }
  rec = new SR(); rec.lang = "pl-PL"; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => { const t = e.results[0][0].transcript; run(t); };
  rec.onerror = () => {};
  rec.onend = () => { $("mic").textContent = "🎤 Mów"; };
  $("mic").textContent = "🔴 Słucham…";
  try { rec.start(); } catch (e) {}
});
