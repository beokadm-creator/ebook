const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

async function main() {
  const stateDoc = await db.doc("publications/DDVAjJoe2cAAvFgELBRr/editor/state").get();
  const state = stateDoc.data();
  const contributions = state.contributions || [];
  const threads = state.threads || [];

  console.log("=== CONTRIBUTIONS: " + contributions.length + "개 ===");
  console.log("=== THREADS: " + threads.length + "개 ===\n");

  let totalSlots = 0;
  let filledSlots = 0;
  let emptySlots = 0;
  
  contributions.forEach((c, i) => {
    const slots = c.slots || [];
    totalSlots += slots.length;
    
    console.log((i+1) + ". " + (c.title || "NO TITLE").substring(0, 50));
    console.log("   pageId: " + (c.pageId || "NONE") + " masterId: " + (c.masterId || "NONE"));
    console.log("   slots (" + slots.length + "):");
    
    slots.forEach(s => {
      const text = (s.text || "").trim();
      const len = text.length;
      const isFilled = len > 0;
      if (isFilled) filledSlots++; else emptySlots++;
      
      // 이 slot에 해당하는 thread가 있는지 확인
      const matchingThread = threads.find(t => t.sourcePageId === c.pageId);
      const threadForSlot = matchingThread ? null : "check needed";
      
      console.log("     " + s.slotKey + ": " + (isFilled ? len + " chars" : "EMPTY") + " (filled: " + isFilled + ")");
    });
  });

  console.log("\n=== 요약 ===");
  console.log("contributions:", contributions.length);
  console.log("total slots:", totalSlots);
  console.log("filled slots:", filledSlots);
  console.log("empty slots:", emptySlots);
  console.log("threads:", threads.length);
  console.log("expected threads (filled slots):", filledSlots);
  console.log("gap:", threads.length - filledSlots);

  // 각 contribution의 sourcePageId별로 thread grouping
  const pageThreadMap = {};
  threads.forEach(t => {
    if (!pageThreadMap[t.sourcePageId]) pageThreadMap[t.sourcePageId] = [];
    pageThreadMap[t.sourcePageId].push(t);
  });
  
  console.log("\n=== CONTRIBUTIONS별 THREAD 매핑 ===");
  contributions.forEach((c, i) => {
    const pageThreads = pageThreadMap[c.pageId] || [];
    const pageSlotKeys = new Set();
    pageThreads.forEach(t => {
      // sourceZoneId로부터 slotKey 유추
      const zone = state.masters?.items?.[0]?.contentZones?.find(z => z.id === t.sourceZoneId);
      if (zone?.slotKey) pageSlotKeys.add(zone.slotKey);
    });
    const slotKeys = (c.slots || []).map(s => s.slotKey).filter(s => s.text?.trim());
    const missing = slotKeys.filter(k => !pageSlotKeys.has(k));
    
    console.log((i+1) + ". threads:" + pageThreads.length + " zones:" + [...pageSlotKeys] + (missing.length > 0 ? " MISSING:" + missing : " OK"));
  });
}

main().catch(console.error);
