const { initializeApp } = require("firebase-admin/app");
const { getFirestore, writeBatch, doc } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

const SRC = "publications/DDVAjJoe2cAAvFgELBRr/editor/state";
const DST = "publications/xqnmUaFi0eiFXqy9km8x/editor/state";

async function main() {
  // 1. Read source state
  const srcDoc = await db.doc(SRC).get();
  if (!srcDoc.exists) { console.log("SOURCE NOT FOUND"); return; }
  const data = srcDoc.data();
  console.log("Source loaded. threads:", data.threads?.length, "contributions:", data.contributions?.length, "masters:", data.masters?.items?.length);

  // 2. Reset all thread zoneSequence to single page (clean state)
  const cleanedThreads = (data.threads || []).map(t => ({
    ...t,
    zoneSequence: [{ pageId: t.sourcePageId, zoneId: t.sourceZoneId }]
  }));

  // 3. Remove pages from state (pages are in editorPages collection, not state)
  const cleanedData = { ...data, threads: cleanedThreads };
  delete cleanedData.pages; // just in case

  console.log("Threads reset to single-page. Writing to destination...");

  // 4. Write to destination
  await db.doc(DST).set(cleanedData);
  console.log("SUCCESS: State copied to " + DST);
  console.log("  threads:", cleanedData.threads.length);
  console.log("  contributions:", cleanedData.contributions.length);
  console.log("  masters:", cleanedData.masters?.items?.length);
  console.log("  JSON size:", JSON.stringify(cleanedData).length);

  // 5. Verify
  const dstDoc = await db.doc(DST).get();
  const verify = dstDoc.data();
  console.log("\nVerify: threads", verify.threads?.length, "zoneSequence[0].pages:", new Set(verify.threads?.[0]?.zoneSequence?.map(z => z.pageId)).size);
}

main().catch(console.error);
