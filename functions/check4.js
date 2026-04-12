const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

async function main() {
  const DOC = "xqnmUaFi0eiFXqy9km8x";
  const stateDoc = await db.doc(`publications/${DOC}/editor/state`).get();
  const state = stateDoc.data();

  const pagesSnap = await db.collection(`publications/${DOC}/editorPages`).orderBy("pageNumber").get();
  
  // get all blocks with their thread refs
  const allBlocks = [];
  pagesSnap.docs.forEach(d => {
    const data = d.data();
    (data.zones || []).forEach(z => {
      (z.blocks || []).forEach(b => {
        if (b.flow?.sourceThreadId) {
          allBlocks.push({
            page: data.pageNumber,
            pageId: d.id,
            zoneId: z.zoneId,
            threadId: b.flow.sourceThreadId,
            segIdx: b.flow.segmentIndex,
            text: b.text || "",
            blockType: b.type
          });
        }
      });
    });
  });

  console.log("pages:", pagesSnap.size, "blocks:", allBlocks.length);

  // check if same text appears on multiple pages (content duplication)
  const textPages = {};
  allBlocks.forEach(b => {
    if (!b.text) return;
    if (!textPages[b.text]) textPages[b.text] = [];
    textPages[b.text].push(b.page);
  });

  let contentDupes = 0;
  Object.entries(textPages).forEach(([text, pages]) => {
    const uniquePages = [...new Set(pages)];
    if (uniquePages.length > 1) {
      contentDupes++;
      if (contentDupes <= 10) {
        console.log(`CONTENT DUPE: "${text.substring(0,50)}" on pages ${uniquePages.join(",")}`);
      }
    }
  });
  console.log("total content duplicates:", contentDupes);

  // check contribution 1 pages in detail
  const c1 = state.contributions?.[0];
  if (c1) {
    const c1Pages = pagesSnap.docs.filter(d => {
      // check if this page belongs to contribution 1 chain
      return (d.data().zones || []).some(z => 
        (z.blocks || []).some(b => {
          const thread = state.threads.find(t => t.id === b.flow?.sourceThreadId);
          return thread?.sourcePageId === c1.pageId;
        })
      );
    });
    console.log("\n=== C1 pages:", c1Pages.length, "===");
    c1Pages.forEach(d => {
      const pn = d.data().pageNumber;
      const blocks = [];
      (d.data().zones || []).forEach(z => {
        (z.blocks || []).forEach(b => {
          const thread = state.threads.find(t => t.id === b.flow?.sourceThreadId);
          blocks.push({
            zone: z.zoneId?.substring(0,15),
            slotKey: thread?.slotKey || "?",
            segIdx: b.flow?.segmentIndex,
            textLen: (b.text || "").length,
            text: (b.text || "").substring(0,60)
          });
        });
      });
      console.log(`  page ${pn}: ${blocks.length} blocks`);
      blocks.forEach(b => console.log(`    ${b.zone} ${b.slotKey} seg${b.segIdx} len=${b.textLen} "${b.text}"`));
    });
  }

  // summary: how many unique pages per contribution
  console.log("\n=== Pages per contribution ===");
  let totalPages = 0;
  state.contributions.forEach((c, i) => {
    const cPages = pagesSnap.docs.filter(d => 
      (d.data().zones || []).some(z => 
        (z.blocks || []).some(b => {
          const thread = state.threads.find(t => t.id === b.flow?.sourceThreadId);
          return thread?.sourcePageId === c.pageId;
        })
      )
    );
    totalPages += cPages.length;
    console.log(`  ${(i+1)}. ${cPages.length}p`);
  });
  console.log("sum:", totalPages, "actual:", pagesSnap.size);
}

main().catch(console.error);
