import React, { useState } from "react";
import { X, Copy, Check, ExternalLink, Package, Truck, CheckCircle, DollarSign, AlertTriangle } from "lucide-react";
import { recordEarning } from "@/lib/earningsTracker";

interface FulfillmentOrder {
  orderId?: number;
  listingId?: number;
  productName?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  sourceUrl?: string;
  sourceMarket?: string;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  quantity?: number;
  platform?: string;
  category?: string;
}

interface Props {
  order: FulfillmentOrder;
  onClose: () => void;
  onProcessed?: () => void;
}

type Step = "buy" | "tracking" | "done";

// ── Shipping helpers ──────────────────────────────────────────────────────────

function detectBuyerCountry(address: string): string | null {
  const a = address.toUpperCase();
  // Americas
  if (/\bUSA\b|\bUNITED STATES\b|\bU\.S\.A\b/.test(a)) return "US";
  if (/\bCANADA\b/.test(a)) return "CA";
  if (/\bBRAZIL\b|\bBRASIL\b/.test(a)) return "BR";
  if (/\bMEXICO\b|\bMÉXICO\b/.test(a)) return "MX";
  if (/\bARGENTINA\b/.test(a)) return "AR";
  if (/\bCHILE\b/.test(a)) return "CL";
  if (/\bCOLOMBIA\b/.test(a)) return "CO";
  if (/\bPERU\b|\bPERÚ\b/.test(a)) return "PE";
  // Europe
  if (/\bUK\b|\bUNITED KINGDOM\b|\bENGLAND\b|\bSCOTLAND\b|\bWALES\b/.test(a)) return "GB";
  if (/\bGERMANY\b|\bDEUTSCHLAND\b/.test(a)) return "DE";
  if (/\bPOLAND\b|\bPOLSKA\b/.test(a)) return "PL";
  if (/\bFRANCE\b|\bFRANKREICH\b/.test(a)) return "FR";
  if (/\bITALY\b|\bITALIA\b/.test(a)) return "IT";
  if (/\bSPAIN\b|\bESPA[NÑ]A\b/.test(a)) return "ES";
  if (/\bNETHERLANDS\b|\bHOLLAND\b/.test(a)) return "NL";
  if (/\bNORWAY\b|\bNORGE\b/.test(a)) return "NO";
  if (/\bSWEDEN\b|\bSVERIGE\b/.test(a)) return "SE";
  if (/\bDENMARK\b|\bDANMARK\b/.test(a)) return "DK";
  if (/\bSWITZERLAND\b|\bSCHWEIZ\b|\bSUISSE\b/.test(a)) return "CH";
  if (/\bRUSSIA\b|\bROSSIYA\b|\bROSSIA\b/.test(a)) return "RU";
  if (/\bTURKEY\b|\bTÜRKIYE\b|\bTURCJA\b/.test(a)) return "TR";
  // Asia-Pacific
  if (/\bJAPAN\b|\bJAPONIA\b/.test(a)) return "JP";
  if (/\bAUSTRALIA\b/.test(a)) return "AU";
  if (/\bNEW ZEALAND\b|\bNOWA ZELANDIA\b/.test(a)) return "NZ";
  if (/\bCHINA\b|\bCHINY\b/.test(a)) return "CN";
  if (/\bINDIA\b|\bINDIE\b/.test(a)) return "IN";
  if (/\bSINGAPORE\b|\bSINGAPUR\b/.test(a)) return "SG";
  if (/\bMALAYSIA\b/.test(a)) return "MY";
  if (/\bTHAILAND\b|\bTAJLANDIA\b/.test(a)) return "TH";
  if (/\bINDONESIA\b/.test(a)) return "ID";
  if (/\bPHILIPPINES\b|\bFILIPINY\b/.test(a)) return "PH";
  if (/\bVIETNAM\b|\bWIETNAM\b/.test(a)) return "VN";
  if (/\bSOUTH KOREA\b|\bKOREA\b|\bKOREA POŁUDNIOWA\b/.test(a)) return "KR";
  if (/\bTAIWAN\b/.test(a)) return "TW";
  if (/\bHONG KONG\b/.test(a)) return "HK";
  if (/\bPAKISTAN\b/.test(a)) return "PK";
  if (/\bBANGLADESH\b/.test(a)) return "BD";
  // Middle East
  if (/\bUAE\b|\bUNITED ARAB\b|\bDUBAI\b|\bABU DHABI\b/.test(a)) return "AE";
  if (/\bSAUDI\b|\bARABIA\b|\bKSA\b/.test(a)) return "SA";
  if (/\bISRAEL\b|\bIZRAEL\b/.test(a)) return "IL";
  if (/\bQATAR\b/.test(a)) return "QA";
  if (/\bKUWAIT\b/.test(a)) return "KW";
  // Africa
  if (/\bNIGERIA\b|\bNIGERII\b/.test(a)) return "NG";
  if (/\bSOUTH AFRICA\b|\bPOŁUDNIOWA AFRYKA\b|\bRSA\b/.test(a)) return "ZA";
  if (/\bKENYA\b/.test(a)) return "KE";
  if (/\bEGYPT\b|\bEGIPT\b|\bMISR\b/.test(a)) return "EG";
  if (/\bGHANA\b/.test(a)) return "GH";
  if (/\bMOROCCO\b|\bMAROKO\b|\bMAROC\b/.test(a)) return "MA";
  if (/\bTANZANIA\b/.test(a)) return "TZ";
  if (/\bUGANDA\b/.test(a)) return "UG";
  if (/\bETHIOPIA\b/.test(a)) return "ET";
  if (/\bSENEGAL\b/.test(a)) return "SN";
  if (/\bCOTE D.IVOIRE\b|\bIVORY COAST\b/.test(a)) return "CI";
  if (/\bCAMEROON\b|\bKAMERUN\b/.test(a)) return "CM";
  // Postal code patterns
  if (/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s\d[A-Z]{2}\b/.test(a)) return "GB";
  if (/\b\d{2}-\d{3}\b/.test(a)) return "PL";
  return null;
}

function detectSourceCountry(url = "", market = ""): string | null {
  const u = url.toLowerCase(), m = market.toLowerCase();
  // Europe
  if (u.includes("allegro.pl") || u.includes("olx.pl")) return "PL";
  if (u.includes("kleinanzeigen.de") || u.includes("ebay.de")) return "DE";
  if (u.includes("ebay.fr") || u.includes("leboncoin.fr")) return "FR";
  if (u.includes("ebay.co.uk") || u.includes("gumtree.com")) return "GB";
  if (u.includes("marktplaats.nl") || u.includes("ebay.nl")) return "NL";
  if (u.includes("wallapop") || u.includes("ebay.es")) return "ES";
  if (u.includes("subito.it") || u.includes("ebay.it")) return "IT";
  if (u.includes("avito.ru") || u.includes("youla.ru")) return "RU";
  if (u.includes("sahibinden.com") || u.includes("letgo.com.tr")) return "TR";
  // Asia-Pacific
  if (u.includes("yahoo.co.jp") || u.includes("mercari.com") || u.includes(".co.jp")) return "JP";
  if (u.includes("taobao") || u.includes("1688.com") || u.includes("alibaba") || u.includes("tmall") || u.includes("xianyu")) return "CN";
  if (u.includes("flipkart") || u.includes("olx.in") || u.includes("quikr.com")) return "IN";
  if (u.includes("carousell.sg") || u.includes("lazada.sg") || u.includes("shopee.sg")) return "SG";
  if (u.includes("mudah.my") || u.includes("lazada.com.my") || u.includes("shopee.com.my")) return "MY";
  if (u.includes("kaidee.com") || u.includes("lazada.co.th") || u.includes("shopee.co.th")) return "TH";
  if (u.includes("tokopedia") || u.includes("bukalapak") || u.includes("olx.co.id") || u.includes("shopee.co.id")) return "ID";
  if (u.includes("carousell.com.ph") || u.includes("olx.ph") || u.includes("shopee.ph")) return "PH";
  if (u.includes("shopee.vn") || u.includes("tiki.vn") || u.includes("lazada.vn")) return "VN";
  if (u.includes("bunjang.com") || u.includes("joongna.com")) return "KR";
  if (u.includes("ruten.com.tw") || u.includes("carousell.com.tw")) return "TW";
  // Americas
  if (u.includes("ebay.com") || u.includes("craigslist") || u.includes("amazon.com") || u.includes("offerup") || u.includes("facebook.com")) return "US";
  if (u.includes("mercadolivre.com.br") || u.includes("enjoei.com.br") || u.includes("olx.com.br")) return "BR";
  if (u.includes("mercadolibre.com.mx") || u.includes("segundamano.mx")) return "MX";
  if (u.includes("mercadolibre.com.ar") || u.includes("olx.com.ar")) return "AR";
  if (u.includes("mercadolibre.cl")) return "CL";
  // Middle East
  if (u.includes("dubizzle.com") || u.includes("opensooq.com/ae")) return "AE";
  if (u.includes("opensooq.com") || u.includes("haraj.com.sa")) return "SA";
  // Africa
  if (u.includes("jiji.ng") || u.includes("konga.com") || u.includes("olx.com.ng")) return "NG";
  if (u.includes("jiji.com.gh") || u.includes("olx.com.gh") || u.includes("tonaton.com")) return "GH";
  if (u.includes("jiji.co.ke") || u.includes("olx.co.ke") || u.includes("pigiame.co.ke")) return "KE";
  if (u.includes("olx.com.eg") || u.includes("dubizzle.com.eg")) return "EG";
  if (u.includes("takealot.com") || u.includes("olx.co.za") || u.includes("gumtree.co.za")) return "ZA";
  if (u.includes("avito.ma") || u.includes("marocannonces") || u.includes("jumia.ma")) return "MA";
  if (u.includes("jumia.")) return "NG";
  // market string fallbacks
  if (m.includes("ng") || m.includes("nigeria")) return "NG";
  if (m.includes("za") || m.includes("south africa")) return "ZA";
  if (m.includes("ke") || m.includes("kenya")) return "KE";
  if (m.includes("eg") || m.includes("egypt")) return "EG";
  if (m.includes("gh") || m.includes("ghana")) return "GH";
  if (m.includes("ma") || m.includes("morocco")) return "MA";
  if (m.includes("in") || m.includes("india")) return "IN";
  if (m.includes("sg") || m.includes("singapore")) return "SG";
  if (m.includes("br") || m.includes("brazil")) return "BR";
  if (m.includes("mx") || m.includes("mexico")) return "MX";
  if (m.includes("ae") || m.includes("dubai") || m.includes("uae")) return "AE";
  if (m.includes("tr") || m.includes("turkey")) return "TR";
  if (m.includes("ru") || m.includes("russia")) return "RU";
  if (m.includes("pl")) return "PL";
  if (m.includes("de")) return "DE";
  if (m.includes("gb") || m.includes("uk")) return "GB";
  if (m.includes("fr")) return "FR";
  if (m.includes("us")) return "US";
  if (m.includes("jp")) return "JP";
  return null;
}

const EU = ["PL","DE","FR","IT","ES","NL","CZ","AT","BE","SE","DK","FI","PT","HU","RO","SK","SI","HR","BG","LT","LV","EE","LU","MT","CY"];
const EU_ADJACENT = ["NO","CH","IS","LI"]; // non-EU but same zone economically
const AFRICA = ["NG","ZA","KE","EG","GH","MA","TZ","UG","ET","SN","CI","CM","DZ","LY","TN","SD","AO","MZ","ZM","ZW"];
const SEA = ["SG","MY","TH","ID","PH","VN","KH","MM","LA","BN"]; // Southeast Asia
const LATAM = ["BR","MX","AR","CL","CO","PE","VE","EC","BO","UY","PY"];
const MIDEAST = ["AE","SA","IL","QA","KW","BH","OM","JO","LB","IQ","IR"];

// Shipping cost table: DHL/FedEx express rates (USD) + transit days
// Costs include packaging; heavy items (Electronics/Antiques/Spirits) add $15
function estimateShipping(src: string | null, dst: string | null, category = ""): { cost: number; days: string } {
  if (!src || !dst) return { cost: 25, days: "7–21" };
  if (src === dst) return { cost: 5, days: "2–4" };
  const heavy = ["Electronics","Antiques","Spirits"].includes(category);
  const H = heavy ? 15 : 0;
  const srcEU = EU.includes(src) || EU_ADJACENT.includes(src);
  const dstEU = EU.includes(dst) || EU_ADJACENT.includes(dst);
  const srcAf = AFRICA.includes(src), dstAf = AFRICA.includes(dst);
  const srcSEA = SEA.includes(src), dstSEA = SEA.includes(dst);
  const srcLA = LATAM.includes(src), dstLA = LATAM.includes(dst);
  const srcME = MIDEAST.includes(src), dstME = MIDEAST.includes(dst);

  // ── EU ──────────────────────────────────────────────────────────────
  if (srcEU && dstEU) return { cost: 9+H, days: "3–6" };
  if (srcEU && dst === "GB") return { cost: 15+H, days: "4–8" };
  if (srcEU && (dst === "US" || dst === "CA")) return { cost: 28+H, days: "6–12" };
  if (srcEU && dst === "AU") return { cost: 38+H, days: "5–10" };
  if (srcEU && dst === "NZ") return { cost: 42+H, days: "7–12" };
  if (srcEU && dst === "JP") return { cost: 28+H, days: "5–9" };
  if (srcEU && dst === "KR") return { cost: 30+H, days: "5–9" };
  if (srcEU && dst === "CN") return { cost: 32+H, days: "5–8" };
  if (srcEU && dst === "HK") return { cost: 28+H, days: "4–8" };
  if (srcEU && dst === "TW") return { cost: 30+H, days: "5–9" };
  if (srcEU && dst === "IN") return { cost: 38+H, days: "5–9" };
  if (srcEU && dst === "PK") return { cost: 40+H, days: "6–10" };
  if (srcEU && dst === "BD") return { cost: 42+H, days: "7–11" };
  if (srcEU && dstSEA) return { cost: dst === "SG" ? 35+H : dst === "MY" ? 37+H : 42+H, days: "5–10" };
  if (srcEU && dstME) return { cost: dst === "AE" ? 35+H : dst === "IL" ? 30+H : 38+H, days: "4–8" };
  if (srcEU && dst === "TR") return { cost: 22+H, days: "3–6" };
  if (srcEU && dst === "RU") return { cost: 30+H, days: "5–10" };
  if (srcEU && dstAf) return { cost: dst === "MA" ? 28+H : 45+H, days: dst === "MA" ? "4–7" : "7–14" };
  if (srcEU && dstLA) return { cost: dst === "MX" ? 40+H : dst === "BR" ? 52+H : 48+H, days: "7–14" };

  // ── GB ──────────────────────────────────────────────────────────────
  if (src === "GB" && dstEU) return { cost: 14+H, days: "4–8" };
  if (src === "GB" && dst === "US") return { cost: 20+H, days: "5–10" };
  if (src === "GB" && dst === "AU") return { cost: 35+H, days: "5–10" };
  if (src === "GB" && dst === "JP") return { cost: 25+H, days: "5–9" };
  if (src === "GB" && dst === "IN") return { cost: 35+H, days: "5–9" };
  if (src === "GB" && dstSEA) return { cost: 38+H, days: "5–10" };
  if (src === "GB" && dstME) return { cost: 32+H, days: "4–8" };
  if (src === "GB" && dstAf) return { cost: 42+H, days: "6–12" };
  if (src === "GB" && dstLA) return { cost: 45+H, days: "7–14" };

  // ── US / CA ─────────────────────────────────────────────────────────
  if ((src === "US" || src === "CA") && (dstEU || dst === "GB")) return { cost: 30+H, days: "6–12" };
  if ((src === "US" || src === "CA") && (dst === "US" || dst === "CA")) return { cost: 12+H, days: "2–5" };
  if (src === "US" && dst === "MX") return { cost: 22+H, days: "3–7" };
  if ((src === "US" || src === "CA") && dst === "AU") return { cost: 32+H, days: "5–10" };
  if ((src === "US" || src === "CA") && dst === "JP") return { cost: 22+H, days: "4–8" };
  if ((src === "US" || src === "CA") && dst === "KR") return { cost: 24+H, days: "4–8" };
  if ((src === "US" || src === "CA") && dst === "CN") return { cost: 25+H, days: "4–8" };
  if ((src === "US" || src === "CA") && dst === "IN") return { cost: 32+H, days: "5–9" };
  if ((src === "US" || src === "CA") && dstSEA) return { cost: 32+H, days: "5–10" };
  if ((src === "US" || src === "CA") && dstME) return { cost: 35+H, days: "5–9" };
  if ((src === "US" || src === "CA") && dst === "TR") return { cost: 30+H, days: "5–9" };
  if ((src === "US" || src === "CA") && dstAf) return { cost: 52+H, days: "10–18" };
  if ((src === "US" || src === "CA") && dstLA) return { cost: dst === "MX" ? 22+H : dst === "BR" ? 45+H : 38+H, days: "5–12" };

  // ── Japan ────────────────────────────────────────────────────────────
  if (src === "JP" && (dstEU || dst === "GB")) return { cost: 28+H, days: "5–10" };
  if (src === "JP" && (dst === "US" || dst === "CA")) return { cost: 22+H, days: "4–8" };
  if (src === "JP" && dst === "AU") return { cost: 24+H, days: "4–8" };
  if (src === "JP" && dst === "CN") return { cost: 15+H, days: "3–6" };
  if (src === "JP" && dst === "KR") return { cost: 14+H, days: "2–5" };
  if (src === "JP" && dstSEA) return { cost: 18+H, days: "3–7" };
  if (src === "JP" && dstME) return { cost: 28+H, days: "5–9" };
  if (src === "JP" && dst === "IN") return { cost: 22+H, days: "4–8" };
  if (src === "JP" && dstAf) return { cost: 45+H, days: "10–18" };
  if (src === "JP" && dstLA) return { cost: 38+H, days: "8–14" };

  // ── China ────────────────────────────────────────────────────────────
  // China → world: ePacket/standard post is very cheap but slow; DHL express shown here
  if (src === "CN" && (dstEU || dst === "GB")) return { cost: 18+H, days: "5–9" };
  if (src === "CN" && (dst === "US" || dst === "CA")) return { cost: 16+H, days: "4–8" };
  if (src === "CN" && dst === "AU") return { cost: 20+H, days: "4–8" };
  if (src === "CN" && dst === "JP") return { cost: 12+H, days: "2–5" };
  if (src === "CN" && dst === "KR") return { cost: 12+H, days: "2–5" };
  if (src === "CN" && dstSEA) return { cost: 14+H, days: "3–7" };
  if (src === "CN" && dstME) return { cost: 20+H, days: "4–8" };
  if (src === "CN" && dst === "IN") return { cost: 16+H, days: "4–8" };
  if (src === "CN" && dst === "TR") return { cost: 22+H, days: "5–9" };
  if (src === "CN" && dstAf) return { cost: 30+H, days: "7–14" };
  if (src === "CN" && dstLA) return { cost: 25+H, days: "7–14" };

  // ── Southeast Asia ───────────────────────────────────────────────────
  if (srcSEA && dstSEA) return { cost: 10+H, days: "3–7" };
  if (srcSEA && (dstEU || dst === "GB")) return { cost: 40+H, days: "5–10" };
  if (srcSEA && (dst === "US" || dst === "CA")) return { cost: 35+H, days: "5–10" };
  if (srcSEA && dst === "AU") return { cost: 25+H, days: "4–8" };
  if (srcSEA && dst === "JP") return { cost: 20+H, days: "3–7" };
  if (srcSEA && dst === "CN") return { cost: 18+H, days: "3–7" };
  if (srcSEA && dst === "IN") return { cost: 25+H, days: "5–9" };
  if (srcSEA && dstME) return { cost: 30+H, days: "5–9" };
  if (srcSEA && dstAf) return { cost: 45+H, days: "10–18" };
  if (srcSEA && dstLA) return { cost: 40+H, days: "10–18" };

  // ── Australia / NZ ───────────────────────────────────────────────────
  if ((src === "AU" || src === "NZ") && (dstEU || dst === "GB")) return { cost: 38+H, days: "5–10" };
  if ((src === "AU" || src === "NZ") && (dst === "US" || dst === "CA")) return { cost: 30+H, days: "5–10" };
  if (src === "AU" && dst === "NZ") return { cost: 12+H, days: "2–5" };
  if ((src === "AU" || src === "NZ") && dstSEA) return { cost: 25+H, days: "4–8" };
  if ((src === "AU" || src === "NZ") && dst === "JP") return { cost: 28+H, days: "4–8" };
  if ((src === "AU" || src === "NZ") && dstAf) return { cost: 50+H, days: "10–18" };

  // ── Middle East ──────────────────────────────────────────────────────
  if (srcME && dstME) return { cost: 18+H, days: "3–6" };
  if (srcME && (dstEU || dst === "GB")) return { cost: 35+H, days: "4–8" };
  if (srcME && (dst === "US" || dst === "CA")) return { cost: 38+H, days: "5–9" };
  if (srcME && dstSEA) return { cost: 28+H, days: "4–8" };
  if (srcME && dst === "IN") return { cost: 25+H, days: "4–8" };
  if (srcME && dstAf) return { cost: 40+H, days: "7–14" };

  // ── Turkey ───────────────────────────────────────────────────────────
  if (src === "TR" && (dstEU || dst === "GB")) return { cost: 20+H, days: "3–6" };
  if (src === "TR" && (dst === "US" || dst === "CA")) return { cost: 30+H, days: "5–9" };
  if (src === "TR" && dstME) return { cost: 22+H, days: "3–7" };

  // ── India ────────────────────────────────────────────────────────────
  if (src === "IN" && (dstEU || dst === "GB")) return { cost: 35+H, days: "5–9" };
  if (src === "IN" && (dst === "US" || dst === "CA")) return { cost: 32+H, days: "5–9" };
  if (src === "IN" && dstSEA) return { cost: 22+H, days: "4–8" };
  if (src === "IN" && dstME) return { cost: 25+H, days: "4–8" };
  if (src === "IN" && dst === "AU") return { cost: 30+H, days: "5–9" };

  // ── Latin America ────────────────────────────────────────────────────
  if (srcLA && dstLA) return { cost: 18+H, days: "5–12" };
  if (srcLA && (dstEU || dst === "GB")) return { cost: 50+H, days: "7–14" };
  if (srcLA && (dst === "US" || dst === "CA")) return { cost: src === "MX" ? 22+H : 42+H, days: src === "MX" ? "3–7" : "7–14" };
  if (srcLA && dstSEA) return { cost: 48+H, days: "10–18" };
  if (srcLA && dstAf) return { cost: 55+H, days: "14–25" };

  // ── Russia ───────────────────────────────────────────────────────────
  if (src === "RU" && (dstEU || dst === "GB")) return { cost: 28+H, days: "7–14" };
  if (src === "RU" && (dst === "US" || dst === "CA")) return { cost: 35+H, days: "8–15" };
  if (dst === "RU") return { cost: 30+H, days: "7–14" };

  // ── Africa ───────────────────────────────────────────────────────────
  if (srcAf && dstAf) return { cost: 22+H, days: "7–14" };
  if (srcAf && (dstEU || dst === "GB")) return { cost: 42+H, days: "8–18" };
  if (srcAf && (dst === "US" || dst === "CA")) return { cost: 50+H, days: "10–20" };
  if (srcAf && dstSEA) return { cost: 48+H, days: "10–18" };
  if (srcAf && dstME) return { cost: 38+H, days: "7–14" };
  if (srcAf && dstLA) return { cost: 55+H, days: "14–25" };

  // Generic fallback
  return { cost: 30+H, days: "10–21" };
}

const REGION_NAMES: Record<string,string> = {
  NG:"Nigeria",ZA:"RPA",KE:"Kenia",EG:"Egipt",GH:"Ghana",MA:"Maroko",TZ:"Tanzania",UG:"Uganda",
  IN:"Indie",SG:"Singapur",MY:"Malezja",TH:"Tajlandia",ID:"Indonezja",PH:"Filipiny",VN:"Wietnam",
  KR:"Korea Płd.",TW:"Tajwan",HK:"Hong Kong",PK:"Pakistan",BD:"Bangladesz",
  AE:"Emiraty",SA:"Arabia Saudyjska",IL:"Izrael",QA:"Katar",KW:"Kuwejt",
  BR:"Brazylia",MX:"Meksyk",AR:"Argentyna",CL:"Chile",CO:"Kolumbia",PE:"Peru",
  RU:"Rosja",TR:"Turcja",AU:"Australia",NZ:"Nowa Zelandia",CA:"Kanada",
};

function getShippingWarning(src: string | null, dst: string | null, url = ""): { level: "warn" | "ok" | "check"; text: string } | null {
  if (!src || !dst) return null;
  if (src === dst) return { level: "ok", text: "Wysyłka krajowa — bez problemu." };

  const dstName = REGION_NAMES[dst] ?? dst;
  const srcAf = AFRICA.includes(src), dstAf = AFRICA.includes(dst);
  const srcSEA = SEA.includes(src), dstSEA = SEA.includes(dst);
  const dstLA = LATAM.includes(dst);
  const dstME = MIDEAST.includes(dst);

  // ── Platform-specific warnings ──────────────────────────────────────
  // African local classifieds — mostly pickup
  if (url.includes("jiji.") || url.includes("olx.com.ng") || url.includes("olx.co.ke") || url.includes("olx.com.gh") || url.includes("pigiame") || url.includes("tonaton")) {
    return { level: "warn", text: "Uwaga: Jiji/OLX w Afryce to głównie sprzedaż lokalna (odbiór osobisty). Wysyłka zagraniczna jest wyjątkiem — weryfikuj każde ogłoszenie indywidualnie." };
  }
  if (url.includes("jumia.")) {
    return { level: "warn", text: "Uwaga: Jumia wysyła TYLKO w obrębie jednego kraju. Brak wysyłki zagranicznej." };
  }
  if (url.includes("konga.com")) {
    return { level: "warn", text: "Uwaga: Konga.com działa wyłącznie w Nigerii, brak wysyłki zagranicznej." };
  }
  if (url.includes("takealot.com")) {
    return { level: "warn", text: "Uwaga: Takealot wysyła tylko na terenie RPA. Brak opcji wysyłki zagranicznej." };
  }
  // SE Asia local platforms
  if (url.includes("tokopedia") || url.includes("bukalapak")) {
    return { level: "warn", text: "Uwaga: Tokopedia/Bukalapak obsługuje tylko rynek indonezyjski. Wysyłka zagraniczna jest bardzo rzadka." };
  }
  if (url.includes("shopee.") || url.includes("lazada.")) {
    return { level: "check", text: `Shopee/Lazada: sprzedawcy zazwyczaj wysyłają tylko lokalnie. Sprawdź czy oferta ma opcję wysyłki do ${dstName}.` };
  }
  if (url.includes("mercadolivre") || url.includes("mercadolibre")) {
    return { level: "warn", text: `Uwaga: Mercado Libre w większości krajów nie obsługuje wysyłki zagranicznej. Wysyłka do ${dstName} może być niemożliwa.` };
  }
  if (url.includes("avito.ru")) {
    return { level: "warn", text: "Uwaga: Avito.ru to rynek lokalny. Od 2022 r. wiele zachodnich kurierów (DHL, FedEx, UPS) wstrzymało wysyłki do/z Rosji. Sprawdź dostępność przed zakupem." };
  }
  if (url.includes("allegro.pl") || url.includes("olx.pl")) {
    return { level: "warn", text: `Uwaga: większość sprzedawców na Allegro wysyła TYLKO w Polsce. Sprawdź opcje wysyłki i zapytaj o możliwość wysyłki do ${dstName}.` };
  }
  if (url.includes("kleinanzeigen.de")) {
    return { level: "warn", text: "Uwaga: Kleinanzeigen.de to głównie sprzedaż lokalna (odbiór osobisty). Wielu sprzedawców nie wysyła paczek." };
  }
  if (url.includes("vinted.")) {
    return { level: "warn", text: "Uwaga: Vinted obsługuje tylko wysyłkę krajową. Upewnij się że sprzedawca wysyła za granicę." };
  }
  if (url.includes("facebook.com") || url.includes("fb.com")) {
    return { level: "warn", text: "Uwaga: Facebook Marketplace to głównie sprzedaż lokalna. Wysyłka zależy wyłącznie od sprzedawcy." };
  }
  if (url.includes("ebay.")) {
    return { level: "check", text: `Sprawdź czy sprzedawca wysyła do ${dstName} (opcja 'International shipping' w ofercie).` };
  }

  // ── Regional warnings ───────────────────────────────────────────────
  if (dst === "RU") {
    return { level: "warn", text: "Uwaga: od 2022 r. DHL, FedEx i UPS zawiesiły wysyłki do Rosji. Dostępne są opcje przez pośredników, ale są drogie i wolne (~4–6 tyg.). Sprawdź sankcje przed wysyłką." };
  }
  if (dst === "IR") {
    return { level: "warn", text: "Uwaga: Iran jest objęty sankcjami — wysyłka do Iranu jest nielegalna z większości krajów zachodnich." };
  }
  if (dst === "BR") {
    return { level: "check", text: "Uwaga: Brazylia ma bardzo wysokie cła importowe (~60% na elektronikę). Zamówienia powyżej $50 często zatrzymywane na granicy. Poinformuj kupującego o ryzyku cła." };
  }
  if (dst === "IN") {
    return { level: "check", text: "Uwaga: Indie mają wysokie cła na elektronikę (20–50%) i skomplikowane procedury celne. Dodaj informację o potencjalnych opłatach w ogłoszeniu." };
  }
  if (dstLA && dst !== "MX") {
    return { level: "check", text: `Wysyłka do ${dstName}: cła importowe w Ameryce Łacińskiej mogą być wysokie. Prześwietlenie paczek bywa długie. Użyj DHL/FedEx dla lepszego śledzenia.` };
  }
  if (dst === "MX") {
    return { level: "check", text: "Meksyk: cła na dobra używane do $50 USD są zazwyczaj zwolnione. Użyj DHL/FedEx — poczta meksykańska jest bardzo zawodna." };
  }

  // Africa
  if (srcAf && dstAf) {
    return { level: "check", text: `Wysyłka wewnątrz Afryki (${src}→${dst}): używaj DHL/FedEx — poczta lokalna jest bardzo zawodna. Cło może opóźnić przesyłkę.` };
  }
  if (!srcAf && dstAf) {
    return { level: "check", text: `Wysyłka do ${dstName}: użyj DHL/FedEx (~7–14 dni). Cła importowe mogą być wysokie (Nigeria 20–75%, Egipt 20–40%). Wlicz je do kalkulacji zysku.` };
  }
  if (srcAf && !dstAf) {
    return { level: "check", text: `Zakup z Afryki: większość lokalnych sprzedawców nie wysyła zagranicznie. Sprawdź czy platforma oferuje wysyłkę międzynarodową.` };
  }

  // SE Asia
  if (dstSEA || srcSEA) {
    return { level: "check", text: `Azja Płd.-Wsch. (${src}→${dst}): użyj DHL/FedEx lub J&T Express. Czas dostawy 5–10 dni. Lokalne platformy zazwyczaj wysyłają tylko krajowo.` };
  }

  // Middle East
  if (dstME) {
    return { level: "check", text: `Bliski Wschód (→${dstName}): DHL/FedEx 4–8 dni. Emiraty i Arabia Saudyjska mają sprawne odprawy celne. Sprawdź ograniczenia na wysyłane produkty (alkohol, niektóre elektronika).` };
  }

  return { level: "check", text: `Przesyłka ${src}→${dst}: upewnij się że sprzedawca oferuje wysyłkę zagraniczną. Użyj DHL/FedEx dla pewności dostarczenia.` };
}

const COUNTRY_NAMES: Record<string, string> = {
  US:"USA", GB:"UK", DE:"Niemcy", PL:"Polska", FR:"Francja", IT:"Włochy",
  ES:"Hiszpania", NL:"Holandia", JP:"Japonia", CA:"Kanada", AU:"Australia",
  NO:"Norwegia", SE:"Szwecja", DK:"Dania", CH:"Szwajcaria", RU:"Rosja",
  CN:"Chiny", HK:"Hong Kong", TW:"Tajwan", KR:"Korea Płd.",
  IN:"Indie", PK:"Pakistan", BD:"Bangladesz",
  SG:"Singapur", MY:"Malezja", TH:"Tajlandia", ID:"Indonezja", PH:"Filipiny", VN:"Wietnam",
  NZ:"Nowa Zelandia", TR:"Turcja",
  AE:"Emiraty", SA:"Arabia Saudyjska", IL:"Izrael", QA:"Katar", KW:"Kuwejt",
  BR:"Brazylia", MX:"Meksyk", AR:"Argentyna", CL:"Chile", CO:"Kolumbia", PE:"Peru",
  NG:"Nigeria", ZA:"RPA", KE:"Kenia", EG:"Egipt", GH:"Ghana",
  MA:"Maroko", TZ:"Tanzania", UG:"Uganda", ET:"Etiopia", SN:"Senegal",
};

// ─────────────────────────────────────────────────────────────────────────────

export function FulfillmentModal({ order, onClose, onProcessed }: Props) {
  const [step, setStep] = useState<Step>("buy");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formattedAddress = [order.buyerName, order.buyerAddress].filter(Boolean).join("\n");

  const buyerCountry  = detectBuyerCountry(order.buyerAddress || "");
  const sourceCountry = detectSourceCountry(order.sourceUrl, order.sourceMarket);
  const shipping      = estimateShipping(sourceCountry, buyerCountry, order.category);
  const warning       = getShippingWarning(sourceCountry, buyerCountry, order.sourceUrl || "");

  const copyAddress = () => {
    navigator.clipboard.writeText(formattedAddress).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  };

  const openSource = () => {
    if (order.sourceUrl) {
      window.open(order.sourceUrl, "_blank");
      setTimeout(() => setStep("tracking"), 1500);
    }
  };

  const submitTracking = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (order.orderId) {
        const res = await fetch(`/api/dropship/orders/${order.orderId}/process`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackingNumber: trackingNumber.trim() }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as any).error || `Server error ${res.status}`);
        }
      }
      // Persist earnings so they survive page reloads
      if (order.profit && order.profit > 0) {
        recordEarning({
          profit: order.profit,
          platform: order.platform ?? "unknown",
          product: order.productName ?? "product",
          sellPrice: order.sellPrice,
          buyPrice: order.buyPrice,
          orderId: order.orderId,
        });
      }
      setStep("done");
      onProcessed?.();
    } catch (err: any) {
      setSubmitError(err.message || "Błąd zapisu — spróbuj ponownie");
    } finally { setSubmitting(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 9, color: "#fff", fontSize: 14, padding: "10px 14px", outline: "none",
    fontFamily: "inherit",
  };


  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 480, background: "linear-gradient(135deg, #1a1030, #130d22)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 18, padding: 28, position: "relative" }}>

        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 7 }}>
          <X size={15} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #f5c842, #f59e0b)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={16} color="#000" />
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Fulfillment Assistant</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{order.productName?.slice(0, 50)}</div>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
          {[
            { key: "buy", label: "1. Buy" },
            { key: "tracking", label: "2. Tracking" },
            { key: "done", label: "3. Done" },
          ].map((s, i, arr) => {
            const isActive = s.key === step;
            const isDone = (step === "tracking" && s.key === "buy") || (step === "done" && s.key !== "done");
            return (
              <React.Fragment key={s.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0,
                    background: isDone ? "#4ade80" : isActive ? "#8b5cf6" : "rgba(255,255,255,0.08)",
                    color: isDone || isActive ? "#fff" : "rgba(255,255,255,0.3)",
                  }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "#fff" : "rgba(255,255,255,0.35)" }}>{s.label}</span>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)", margin: "0 8px" }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Step 1: Buy ── */}
        {step === "buy" && (
          <div>
            {/* Profit summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7, marginBottom: 20 }}>
              {[
                { label: "BUY", val: `$${order.buyPrice ?? "?"}`, color: "#60a5fa" },
                { label: "SELL", val: `$${order.sellPrice ?? "?"}`, color: "#a78bfa" },
                { label: "NET PROFIT", val: `+$${order.profit ?? "?"}`, color: "#4ade80" },
                { label: "SHIP EST", val: `~$${shipping.cost}`, color: "#f5c842", sub: shipping.days + "d" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "7px 6px", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 7, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ color: s.color, fontWeight: 900, fontSize: 13 }}>{s.val}</div>
                  {"sub" in s && s.sub && <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Shipping address — BIG and easy to copy */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
                📦 SHIP DIRECTLY TO THIS ADDRESS
              </div>
              <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.25)", borderRadius: 11, padding: 14, position: "relative" }}>
                <pre style={{ color: "#fff", fontSize: 13, fontWeight: 600, margin: 0, fontFamily: "inherit", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {formattedAddress || "No address provided"}
                </pre>
                {order.buyerEmail && (
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 6 }}>{order.buyerEmail}</div>
                )}
                <button
                  onClick={copyAddress}
                  style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                    background: copiedAddress ? "rgba(74,222,128,0.2)" : "rgba(245,200,66,0.15)",
                    color: copiedAddress ? "#4ade80" : "#f5c842",
                  }}>
                  {copiedAddress ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 6 }}>
                ↑ Paste this as the delivery address when ordering from the source
              </div>
            </div>

            {/* Shipping feasibility warning */}
            {warning && (
              <div style={{
                background: warning.level === "warn" ? "rgba(248,113,113,0.1)" : warning.level === "ok" ? "rgba(74,222,128,0.08)" : "rgba(245,200,66,0.08)",
                border: `1px solid ${warning.level === "warn" ? "rgba(248,113,113,0.3)" : warning.level === "ok" ? "rgba(74,222,128,0.25)" : "rgba(245,200,66,0.25)"}`,
                borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <AlertTriangle size={13} color={warning.level === "warn" ? "#f87171" : warning.level === "ok" ? "#4ade80" : "#f5c842"} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ color: warning.level === "warn" ? "#f87171" : warning.level === "ok" ? "#86efac" : "#fde68a", fontSize: 11, lineHeight: 1.55 }}>
                  {warning.text}
                  {(sourceCountry || buyerCountry) && (
                    <span style={{ display: "inline-block", marginTop: 4, color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                      {" "}({sourceCountry ?? "?"} → {buyerCountry ?? "?"}, ~{shipping.days} days)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>HOW TO COMPLETE THIS ORDER:</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.8 }}>
                1. Click <strong style={{ color: "#fff" }}>"Open Source & Buy"</strong> below<br />
                2. Find the item and add to cart<br />
                3. <strong style={{ color: "#f5c842" }}>Paste the buyer's address</strong> as the delivery address<br />
                4. Complete the purchase — the seller ships directly to your buyer<br />
                5. Come back here and enter the tracking number
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              {order.sourceUrl ? (
                <button onClick={openSource}
                  style={{ flex: 1, padding: "13px", borderRadius: 11, border: "none", background: "linear-gradient(135deg, #f5c842, #f59e0b)", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <ExternalLink size={15} /> Open Source & Buy
                </button>
              ) : (
                <button onClick={() => setStep("tracking")}
                  style={{ flex: 1, padding: "13px", borderRadius: 11, border: "none", background: "rgba(139,92,246,0.2)", color: "#a78bfa", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  I've already bought it →
                </button>
              )}
            </div>

            {order.sourceUrl && (
              <button onClick={() => setStep("tracking")}
                style={{ width: "100%", marginTop: 8, padding: "9px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                I've already placed the order →
              </button>
            )}
          </div>
        )}

        {/* ── Step 2: Tracking ── */}
        {step === "tracking" && (
          <div>
            <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 11, padding: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle size={18} color="#4ade80" />
              <div>
                <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>Purchase confirmed!</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>The seller will ship directly to your buyer's address</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>TRACKING NUMBER <span style={{ fontWeight: 400 }}>(optional)</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={trackingNumber}
                  onChange={e => setTrackingNumber(e.target.value)}
                  placeholder="e.g. PL123456789PL"
                  style={inputStyle}
                  onKeyDown={e => e.key === "Enter" && submitTracking()}
                />
                {trackingNumber && (
                  <button onClick={() => { navigator.clipboard.writeText(trackingNumber); setCopiedTracking(true); setTimeout(() => setCopiedTracking(false), 1500); }}
                    style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: copiedTracking ? "#4ade80" : "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                    {copiedTracking ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                )}
              </div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 6 }}>
                Enter the tracking number you received from the source seller
              </div>
            </div>

            {/* Buyer address reminder */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: 12, marginBottom: 20 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>SHIPPED TO</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 1.5 }}>{formattedAddress}</div>
            </div>

            {submitError && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 9, padding: "10px 14px", marginBottom: 12, color: "#f87171", fontSize: 12, fontWeight: 600 }}>
                ⚠ {submitError}
              </div>
            )}
            <button onClick={submitTracking} disabled={submitting}
              style={{ width: "100%", padding: "13px", borderRadius: 11, border: "none", background: "linear-gradient(135deg, #4ade80, #22c55e)", color: "#000", fontWeight: 800, fontSize: 14, cursor: submitting ? "default" : "pointer" }}>
              {submitting ? "Saving…" : trackingNumber ? "Save Tracking & Mark Done ✓" : "Mark as Fulfilled ✓"}
            </button>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "2px solid rgba(74,222,128,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Truck size={26} color="#4ade80" />
            </div>
            <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Order Fulfilled! 🎉</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 4 }}>
              The item is on its way to {order.buyerName}
            </div>
            {trackingNumber && (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 4 }}>
                Tracking: <strong style={{ color: "#fff" }}>{trackingNumber}</strong>
              </div>
            )}
            <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "10px 16px" }}>
              <DollarSign size={14} color="#4ade80" />
              <span style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>+${order.profit} profit earned</span>
            </div>
            <br />
            <button onClick={onClose}
              style={{ marginTop: 20, padding: "10px 28px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
