const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

async function main() {
  const DOC = "xqnmUaFi0eiFXqy9km8x";
  const stateDoc = await db.doc(`publications/${DOC}/editor/state`).get();
  const state = stateDoc.data();
  
  const contributions = state.contributions || [];
  const threads = state.threads || [];
  
  // unique titles
  const titles = contributions.map(c => (c.title || "NO TITLE").trim());
  const uniqueTitles = [...new Set(titles)];
  console.log("contributions:", contributions.length);
  console.log("unique titles:", uniqueTitles.length);
  
  if (uniqueTitles.length !== titles.length) {
    const seen = {};
    titles.forEach((t, i) => {
      if (!seen[t]) seen[t] = [];
      seen[t].push(i+1);
    });
    Object.entries(seen).filter(([,v]) => v.length > 1).forEach(([t, idxs]) => {
      console.log(`DUPE TITLE: "${t.substring(0,40)}" at #${idxs.join(",")}`);
    });
  }

  // unique pageIds
  const pageIds = contributions.map(c => c.pageId);
  const uniquePageIds = [...new Set(pageIds)];
  console.log("unique pageIds:", uniquePageIds.length);

  // check thread sourcePageId distribution
  const threadSourceMap = {};
  threads.forEach(t => {
    const src = t.sourcePageId || "NONE";
    if (!threadSourceMap[src]) threadSourceMap[src] = 0;
    threadSourceMap[src]++;
  });
  console.log("unique sourcePageIds in threads:", Object.keys(threadSourceMap).length);
  console.log("threads per pageId:", Object.values(threadSourceMap).join(","));
  
  // check if content is actually there (sample a few)
  console.log("\n=== CONTENT SAMPLE (first 3 contributions) ===");
  contributions.slice(0, 3).forEach((c, i) => {
    const cThreads = threads.filter(t => t.sourcePageId === c.pageId);
    const bodyThread = cThreads.find(t => t.slotKey?.includes("body"));
    const bodyText = bodyThread?.canonicalText;
    console.log(`\n#${i+1} ${c.title?.substring(0,40)}`);
    console.log(`  slots filled: ${(c.slots||[]).filter(s => s.text?.trim()).length}/${(c.slots||[]).length}`);
    console.log(`  threads: ${cThreads.length}`);
    console.log(`  body text type: ${typeof bodyText}, len: ${typeof bodyText === 'string' ? bodyText.length : 'N/A'}`);
    if (typeof bodyText === 'string' && bodyText.length > 0) {
      console.log(`  body preview: "${bodyText.substring(0,80)}..."`);
    } else if (Array.isArray(bodyText)) {
      console.log(`  body is array, len: ${bodyText.length}`);
    } else {
      // check slots
      const bodySlot = (c.slots||[]).find(s => s.slotKey?.includes("body"));
      console.log(`  body slot text type: ${typeof bodySlot?.text}, len: ${typeof bodySlot?.text === 'string' ? bodySlot?.text.length : 'N/A'}`);
      if (typeof bodySlot?.text === 'string') {
        console.log(`  slot preview: "${bodySlot.text.substring(0,80)}..."`);
      }
    }
  });
}

main().catch(console.error);
