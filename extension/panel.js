// ✍️ GADACZ — WTYCZKA (Faza 2). Mówisz albo piszesz, a Gadacz DZIAŁA na stronach:
//  • wieloetapowo („mówisz i robi": otwiera → klika → wpisuje → aż do celu),
//  • dostrojone klikanie (trafia w przycisk po napisie, nie w byle kontener),
//  • strażnik płatności (przy „Zapłać/Kup/Przelew" pyta o potwierdzenie),
//  • ten sam mózg i PAMIĘĆ co telefon (serwer, learn:true) — jedno konto mózgu.

const $ = (id) => document.getElementById(id);
let cfg = { url: "", pin: "0905", speak: true };
const history = [];
let stopFlag = false;
let pendingClick = null;   // przycisk do potwierdzenia (płatność itp.)

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
  const o = $("out"), d = document.createElement("div");
  const b = document.createElement("b"); b.textContent = who + ": ";
  d.appendChild(b); d.appendChild(document.createTextNode(text));
  o.appendChild(d); o.scrollTop = o.scrollHeight;
}
function say(t) {
  if (!cfg.speak) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "pl-PL"; speechSynthesis.speak(u); } catch (e) {}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
async function inject(func, args) {
  const t = await activeTab();
  if (!t || !t.id) return null;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func, args: args || [] });
    return r ? r.result : null;
  } catch (e) { return null; }
}
async function pageText() {
  const r = await inject(() => (document.body ? document.body.innerText.slice(0, 4000) : ""));
  return r || "";
}

// --- funkcje wstrzykiwane na stronę ---
// 🎯 DOSTROJONE KLIKANIE: punktuje kandydatów (dokładne trafienie > początek > zawiera;
//   przyciski/linki > zwykłe kontenery; krótszy tekst pewniejszy) i klika NAJLEPSZY,
//   tylko WIDOCZNY. Zwraca "ok" albo "brak".
function _clickByText(q) {
  q = (q || "").toLowerCase().trim(); if (!q) return "brak";
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && el.offsetParent !== null; };
  const cands = [];
  const consider = (el, base) => {
    const s = ((el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "") + "").toLowerCase().trim();
    if (!s || !vis(el)) return;
    let sc;
    if (s === q) sc = 100; else if (s.startsWith(q)) sc = 70; else if (s.includes(q)) sc = 40; else return;
    sc += base;
    sc -= Math.min(25, Math.floor(s.length / 8));
    cands.push({ el, sc });
  };
  document.querySelectorAll("a,button,input[type=submit],input[type=button],[role=button],summary,[tabindex]").forEach((el) => consider(el, 30));
  document.querySelectorAll("[onclick],label,li,td,th,div,span,p").forEach((el) => consider(el, 0));
  cands.sort((a, b) => b.sc - a.sc);
  if (!cands.length) return "brak";
  const el = cands[0].el;
  el.scrollIntoView({ block: "center", behavior: "instant" });
  el.click();
  return "ok";
}
function _typeText(t) {
  let el = document.activeElement;
  if (!el || !/input|textarea/i.test(el.tagName)) {
    const list = [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]),textarea")];
    el = list.find((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && e.offsetParent !== null; });
  }
  if (!el) return "brak";
  el.focus(); el.value = t;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
}
function _scroll(dir) {
  if (dir === "up") window.scrollBy(0, -600);
  else if (dir === "top") window.scrollTo(0, 0);
  else if (dir === "bottom") window.scrollTo(0, document.body.scrollHeight);
  else window.scrollBy(0, 600);
  return "ok";
}
function _enter() {
  const el = document.activeElement;
  if (el && el.form) { try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); return "ok"; } catch (e) {} }
  if (el) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
  return "ok";
}

const DANGER = /zap[łl]a[cć]|kup teraz|kupuj[eę]|potwierd[źz] p[łl]atno|wy[śs]lij przelew|przelew|usu[ńn] konto|zam[óo]w i zap[łl]a/i;

async function doAction(action, args) {
  const a = (action || "").toLowerCase();
  const text = (args && (args.text || args.name || args.query)) || "";
  const dir = (args && args.dir) || "down";
  const url = (args && (args.url || args.address)) || "";
  const t = await activeTab();

  if (a === "tap" || a === "click") {
    if (DANGER.test(text)) { pendingClick = text; return "confirm"; }
    return (await inject(_clickByText, [text])) || "brak";
  }
  if (a === "type" || a === "write") return (await inject(_typeText, [text])) || "brak";
  if (a === "scroll") return (await inject(_scroll, [dir])) || "ok";
  if (a === "enter") return (await inject(_enter, [])) || "ok";
  if (a === "back") { if (t) chrome.tabs.goBack(t.id); return "ok"; }
  if (a === "forward") { if (t) chrome.tabs.goForward(t.id); return "ok"; }
  if ((a === "open" || a === "navigate" || a === "search") && url.startsWith("http")) { if (t) chrome.tabs.update(t.id, { url }); return "ok"; }
  if (a === "newtab" && url.startsWith("http")) { chrome.tabs.create({ url }); return "ok"; }
  return "ok"; // np. "none" / samo mówienie
}

async function ask(goal, lastError) {
  const scr = await pageText();
  const q = "EKRAN: " + scr + "\n\nPolecenie: " + goal +
    (lastError ? "\n\nUWAGA: poprzedni krok NIE WYSZEDŁ: " + lastError + " Spróbuj inaczej albo inny napis z EKRANU." : "");
  const body = { question: q, history: history.slice(-10), clientTime: new Date().toLocaleString("pl-PL"), learn: true, work: "normal" };
  const resp = await fetch(cfg.url.replace(/\/$/, "") + "/api/assistant/ask", {
    method: "POST", headers: { "Content-Type": "application/json", "x-bot-pin": cfg.pin }, body: JSON.stringify(body),
  });
  return await resp.json();
}

async function run(text) {
  text = (text || "").trim(); if (!text) return;

  // 🛑 STOP
  if (/^(stop|przerwij|do[śs][cć]|koniec)$/i.test(text)) { stopFlag = true; log("Ty", text); log("Gadacz", "Przerywam."); say("Przerywam."); return; }
  // ✅ POTWIERDZENIE płatności/ważnego kliknięcia
  if (pendingClick) {
    log("Ty", text);
    if (/potwierdzam|tak,? klik|klikaj|zgadzam/i.test(text)) {
      const p = pendingClick; pendingClick = null;
      const r = await inject(_clickByText, [p]);
      const m = r === "ok" ? "Kliknięte: " + p : "Nie znalazłem: " + p;
      log("Gadacz", m); say(m);
    } else { pendingClick = null; log("Gadacz", "Dobrze, nie klikam."); say("Nie klikam."); }
    return;
  }

  // 📖 WBUDOWANE: przeczytaj stronę na głos (lokalnie, bez serwera).
  if (/^(przeczytaj( (t[ęe]|cał[ąa]))? stron|czytaj stron|co jest na (tej )?stronie)/i.test(text)) {
    log("Ty", text); $("in").value = "";
    const t = await pageText();
    log("Gadacz", t ? t.slice(0, 500) + (t.length > 500 ? "…" : "") : "(pusta strona)");
    say(t || "Ta strona jest pusta.");
    return;
  }
  // 🧠 WBUDOWANE: podgląd pamięci.
  if (/^(pami[eę][ćc]|co o mnie wiesz|co pami[eę]tasz)/i.test(text)) { log("Ty", text); $("in").value = ""; await showMemory(); return; }

  log("Ty", text); $("in").value = "";
  if (!cfg.url) { log("Gadacz", "Wpisz najpierw adres serwera z Replita i PIN u góry."); say("Wpisz adres serwera."); return; }

  stopFlag = false;
  let lastError = "";
  for (let step = 0; step < 8; step++) {
    if (stopFlag) return;
    let j;
    try { j = await ask(text, lastError); }
    catch (e) { log("Gadacz", "Nie mogę połączyć się z serwerem (sprawdź adres i czy serwer działa)."); say("Nie mogę połączyć się z serwerem."); return; }

    if (j.error) { log("Gadacz", "Błąd serwera: " + j.error); say("Błąd serwera."); return; }
    const sayTxt = j.say || "";
    if (sayTxt) { log("Gadacz", sayTxt); say(sayTxt); }
    history.push({ role: "user", content: text }, { role: "assistant", content: sayTxt });

    const action = j.action || "none";
    if (action !== "none") {
      const res = await doAction(action, j.args || {});
      if (res === "confirm") { const msg = "To ważny przycisk: " + pendingClick + ". Powiedz „potwierdzam”, a kliknę."; log("Gadacz", msg); say(msg); return; }
      lastError = res === "brak" ? ("nie znalazłem: " + ((j.args && (j.args.text || j.args.name)) || "elementu")) : "";
    } else lastError = "";

    if (!j.next) break;         // AI mówi: skończone
    await sleep(750);           // pozwól stronie się przeładować
  }
}

// 🧠 Podgląd pamięci (wspólnej z telefonem/Windowsem).
async function showMemory() {
  if (!cfg.url) { log("Gadacz", "Wpisz adres serwera z Replita i PIN."); say("Wpisz adres serwera."); return; }
  try {
    const r = await fetch(cfg.url.replace(/\/$/, "") + "/api/assistant/memory", { headers: { "x-bot-pin": cfg.pin } });
    const j = await r.json();
    const arr = (j && j.memory) || [];
    log("Gadacz", "🧠 Co wiem o Tobie: " + (arr.length ? arr.map((f, i) => (i + 1) + ". " + f).join("   ") : "(jeszcze nic)"));
    say("Wypisałem, co o Tobie wiem.");
  } catch (e) { log("Gadacz", "Nie mogę pobrać pamięci (sprawdź serwer)."); }
}
$("mem").addEventListener("click", showMemory);

$("send").addEventListener("click", () => run($("in").value));
$("in").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run($("in").value); } });

// 🎤 rozpoznawanie mowy (Chrome/Edge)
$("mic").addEventListener("click", () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { log("Gadacz", "Ta przeglądarka nie rozpoznaje mowy. Użyj Chrome albo Edge."); say("Użyj Chrome albo Edge."); return; }
  const rec = new SR(); rec.lang = "pl-PL"; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => { run(e.results[0][0].transcript); };
  rec.onerror = () => {};
  rec.onend = () => { $("mic").textContent = "🎤 Mów"; };
  $("mic").textContent = "🔴 Słucham…";
  try { rec.start(); } catch (e) {}
});
