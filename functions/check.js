const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

async function main() {
  const stateDoc = await db.doc("publications/DDVAjJoe2cAAvFgELBRr/editor/state").get();
  const state = stateDoc.data();
  const threads = state.threads || [];
  const contributions = state.contributions || [];

  const pagesSnap = await db.collection("publications/DDVAjJoe2cAAvFgELBRr/editorPages").orderBy("pageNumber").get();
  console.log("total pages:", pagesSnap.size);

  // Check threads zoneSequence vs editorPages
  let totalZoneSeqEntries = 0;
  let pagesInZoneSeq = new Set();
  threads.forEach(t => {
    (t.zoneSequence || []).forEach(z => {
      totalZoneSeqEntries++;
      pagesInZoneSeq.add(z.pageId);
    });
  });
  console.log("total zoneSequence entries:", totalZoneSeqEntries);
  console.log("unique pages in zoneSequence:", pagesInZoneSeq.size);

  const storedPageIds = new Set(pagesSnap.docs.map(d => d.id));
  const zoneSeqMissing = [...pagesInZoneSeq].filter(p => !storedPageIds.has(p));
  console.log("zoneSequence pages missing from editorPages:", zoneSeqMissing.length);

  // Check editorPages that have no thread blocks
  let emptyPages = 0;
  let dupes = 0;
  const pageContent = new Map();
  pagesSnap.docs.forEach(d => {
    const data = d.data();
    const blockThreads = [];
    (data.zones || []).forEach(z => {
      (z.blocks || []).forEach(b => {
        if (b.flow?.sourceThreadId) blockThreads.push(b.flow.sourceThreadId);
      });
    });
    if (blockThreads.length === 0) emptyPages++;
    const key = blockThreads.sort().join(",");
    const prev = pageContent.get(key);
    if (prev) dupes++;
    else pageContent.set(key, true);
    pageContent.set(d.id + ":" + data.pageNumber, { threads: blockThreads, blocks: (data.zones||[]).reduce((s,z) => s + (z.blocks?.length||0), 0) });
  });
  console.log("pages with no thread blocks:", emptyPages);
  console.log("pages with identical thread set:", dupes);

  // Show pages 85-100
  console.log("\n=== PAGES 85-100 ===");
  pagesSnap.docs.forEach(d => {
    const pn = d.data().pageNumber;
    if (pn >= 85 && pn <= 100) {
      const blockThreads = [];
      (d.data().zones || []).forEach(z => {
        (z.blocks || []).forEach(b => {
          if (b.flow?.sourceThreadId) blockThreads.push(b.flow.sourceThreadId.substring(0, 12));
        });
      });
      const blocks = (d.data().zones||[]).reduce((s,z) => s + (z.blocks?.length||0), 0);
      console.log("  page " + pn + " (" + d.id.substring(0,12) + "): " + blocks + " blocks, threads: " + blockThreads.slice(0,3).join(",") + (blockThreads.length > 3 ? "..." : ""));
    }
  });

  // Count multi-page threads
  let multi = 0;
  threads.forEach(t => {
    const pages = new Set((t.zoneSequence || []).map(z => z.pageId));
    if (pages.size > 1) multi++;
  });
  console.log("\nmulti-page threads now:", multi);
  
  // Check contributions: how many pages each one spans
  console.log("\n=== CONTRIBUTION PAGE SPANS ===");
  contributions.forEach((c, i) => {
    const rootPage = c.pageId;
    // Find all pages derived from this root
    const chain = [];
    pagesSnap.docs.forEach(d => {
      const data = d.data();
      if (data.derivedFrom?.previousPageId === rootPage || d.id === rootPage) chain.push(d.data().pageNumber);
      // Also check chains
      const prev = data.derivedFrom?.previousPageId;
      if (prev && prev !== rootPage) {
        // trace
      }
    });
    // Simpler: count unique thread sourcePageIds on this page and continuations
    const contribThreads = threads.filter(t => t.sourcePageId === rootPage);
    const contribPageIds = new Set(contribThreads.flatMap(t => (t.zoneSequence||[]).map(z => z.pageId)));
    console.log("  " + (i+1) + ". " + (c.title||'').substring(0,35) + ": " + contribPageIds.size + " pages");
  });
}

main().catch(console.error);
