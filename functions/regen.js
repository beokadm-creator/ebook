const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

const SRC = "publications/DDVAjJoe2cAAvFgELBRr/editor/state";
const DST = "publications/xqnmUaFi0eiFXqy9km8x/editor/state";
const PAGES_DST = "publications/xqnmUaFi0eiFXqy9km8x/editorPages";

const SLOT_STYLES = {
  track:     { semanticRole: "subheading", style: { fontSize: 18, lineHeight: 1.5, fontWeight: 700 } },
  title_ko:  { semanticRole: "title",      style: { fontSize: 30, lineHeight: 1.4, fontWeight: 700 } },
  title_en:  { semanticRole: "title",      style: { fontSize: 30, lineHeight: 1.4, fontWeight: 700 } },
  authors_ko:{ semanticRole: "paragraph",  style: null },
  authors_en:{ semanticRole: "paragraph",  style: null },
  affiliation_ko:{ semanticRole: "paragraph", style: null },
  affiliation_en:{ semanticRole: "paragraph", style: null },
  body_ko:   { semanticRole: "paragraph",  style: null },
  body_en:   { semanticRole: "paragraph",  style: null },
};

async function main() {
  console.log('START');
  const srcDoc = await db.doc(SRC).get();
  const state = srcDoc.data();
  const contributions = state.contributions || [];
  const threads = state.threads || [];
  const master = state.masters?.items?.[0];

  if (!master) { console.log("NO MASTER"); return; }
  console.log(`Master: ${master.id} mode:${master.mode} zones:${master.contentZones?.length}`);

  // Clean threads: reset zoneSequence
  const cleanedThreads = threads.map(t => ({
    ...t,
    zoneSequence: [{ pageId: t.sourcePageId, zoneId: t.sourceZoneId }]
  }));
  const cleanedState = { ...state, threads: cleanedThreads };
  delete cleanedState.pages;

  // Delete existing editorPages
  console.log("Deleting existing editorPages...");
  const existingPages = await db.collection(PAGES_DST).listDocuments();
  if (existingPages.length > 0) {
    const batch1 = db.batch();
    existingPages.forEach(doc => batch1.delete(doc));
    await batch1.commit();
    console.log(`Deleted ${existingPages.length} pages`);
  }

  console.log("Building pages...");
  const pages = [];

  const zoneSlotMap = {};
  master.contentZones.forEach(z => { zoneSlotMap[z.id] = z.slotKey; });

  function findZone(slotKey) {
    return master.contentZones.find(z => z.slotKey === slotKey);
  }

  function findThread(contribution, slotKey) {
    const zoneId = Object.keys(zoneSlotMap).find(zid => zoneSlotMap[zid] === slotKey);
    return cleanedThreads.find(t => t.sourcePageId === contribution.pageId && t.sourceZoneId === zoneId);
  }

  function estimateCapacity(zone) {
    const style = zone.style || { fontSize: 14, lineHeight: 1.6 };
    const padding = zone.constraints?.padding || { top: 0, bottom: 0, left: 0, right: 0 };
    const w = Math.max(48, zone.frame.width - padding.left - padding.right);
    const h = Math.max(48, zone.frame.height - padding.top - padding.bottom);
    const lineH = Math.max(1, style.fontSize * style.lineHeight);
    const lines = Math.max(1, Math.floor(h / lineH));
    const charsPerLine = Math.max(8, w / Math.max(1, style.fontSize * 0.55));
    return Math.max(700, Math.floor(lines * charsPerLine * 0.28));
  }

  function splitText(text, capacity) {
    if (!text.trim()) return [];
    if (text.length <= capacity) return [text];
    const segs = [];
    let rem = text;
    while (rem.length > capacity) {
      let cut = rem.lastIndexOf('\n\n', capacity);
      if (cut < capacity * 0.45) cut = rem.lastIndexOf('. ', capacity);
      if (cut < capacity * 0.45) cut = rem.lastIndexOf(' ', capacity);
      if (cut < capacity * 0.45) cut = capacity;
      const seg = rem.slice(0, cut).trim();
      if (seg) segs.push(seg);
      rem = rem.slice(cut).trim();
    }
    if (rem) segs.push(rem);
    return segs;
  }

  let pageCounter = 0;
  function createPage(prevPageId) {
    pageCounter++;
    const page = {
      id: `page_regen_${Date.now()}_${pageCounter}`,
      pageNumber: pageCounter,
      masterId: master.id,
      pageRole: 'body',
      derivedFrom: prevPageId ? { previousPageId: prevPageId, reason: 'auto-pagination' } : null,
      zones: master.contentZones.map(z => ({
        zoneId: z.id,
        blocks: []
      }))
    };
    pages.push(page);
    return page;
  }

  function makeBlock(threadId, segIdx, text, slotKey, isTerminal) {
    const config = SLOT_STYLES[slotKey] || { semanticRole: "paragraph", style: null };
    const block = {
      id: `${threadId}_seg_${String(segIdx).padStart(3, '0')}`,
      type: "text",
      semanticRole: config.semanticRole,
      locked: false,
      scope: "page-editable",
      visible: true,
      flow: {
        sourceThreadId: threadId,
        segmentIndex: segIdx,
        isContinuation: segIdx > 0,
        isTerminal: isTerminal
      },
      content: { runs: [{ text }] },
      ebook: { include: true, toc: { enabled: false } }
    };
    if (config.style) block.styleOverride = config.style;
    if (slotKey === 'track') {
      block.ebook.toc = {
        enabled: true,
        level: 2,
        tocId: `toc_${threadId}`,
        label: { en: "", ko: text }
      };
    }
    return block;
  }

  // Process each contribution
  contributions.forEach((contribution, ci) => {
    const slots = contribution.slots || [];
    const trackSlot = slots.find(s => s.slotKey === 'track');
    const koSlots = slots.filter(s => s.slotKey.endsWith('_ko'));
    const enSlots = slots.filter(s => s.slotKey.endsWith('_en'));
    const hasKo = koSlots.some(s => s.text?.trim());
    const hasEn = enSlots.some(s => s.text?.trim());

    const pageLanguages = [];
    if (hasKo) pageLanguages.push('ko');
    if (hasEn) pageLanguages.push('en');

    let currentOffset = pages.length;

    pageLanguages.forEach(language => {
      const langSlots = language === 'ko' ? koSlots : enSlots;
      const bodySlotKey = language === 'ko' ? 'body_ko' : 'body_en';
      const bodySlot = langSlots.find(s => s.slotKey === bodySlotKey);
      const frontmatterSlots = langSlots.filter(s => s.slotKey !== bodySlotKey);
      const startPageIdx = currentOffset;

      while (pages.length <= startPageIdx) {
        createPage(pages.length > 0 ? pages[pages.length - 1].id : null);
      }

      // Track on first page
      if (trackSlot?.text?.trim()) {
        const thread = findThread(contribution, 'track');
        const zone = findZone('track');
        if (thread && zone) {
          const pageZone = pages[startPageIdx].zones.find(z => z.zoneId === zone.id);
          if (pageZone) {
            pageZone.blocks.push(makeBlock(thread.id, 0, trackSlot.text, 'track', true));
            thread.zoneSequence = [{ pageId: pages[startPageIdx].id, zoneId: zone.id }];
          }
        }
      }

      // Frontmatter slots on first page
      frontmatterSlots.forEach(slot => {
        if (!slot.text?.trim()) return;
        const thread = findThread(contribution, slot.slotKey);
        const zone = findZone(slot.slotKey);
        if (thread && zone) {
          const pageZone = pages[startPageIdx].zones.find(z => z.zoneId === zone.id);
          if (pageZone) {
            pageZone.blocks.push(makeBlock(thread.id, 0, slot.text, slot.slotKey, true));
            thread.zoneSequence = [{ pageId: pages[startPageIdx].id, zoneId: zone.id }];
          }
        }
      });

      // Body: split across pages
      if (bodySlot?.text?.trim()) {
        const thread = findThread(contribution, bodySlotKey);
        const zone = findZone(bodySlotKey);
        if (thread && zone) {
          const capacity = estimateCapacity(zone);
          const segments = splitText(bodySlot.text, capacity);
          thread.zoneSequence = [];

          segments.forEach((segText, segIdx) => {
            const targetIdx = startPageIdx + segIdx;
            while (pages.length <= targetIdx) {
              createPage(pages[pages.length - 1].id);
            }
            const pageZone = pages[targetIdx].zones.find(z => z.zoneId === zone.id);
            if (pageZone) {
              pageZone.blocks.push(makeBlock(thread.id, segIdx, segText, bodySlotKey, segIdx === segments.length - 1));
              thread.zoneSequence.push({ pageId: pages[targetIdx].id, zoneId: zone.id });
            }
          });
          currentOffset = startPageIdx + Math.max(1, segments.length);
        } else {
          currentOffset = startPageIdx + 1;
        }
      } else {
        currentOffset = startPageIdx + 1;
      }
    });

    if (ci % 10 === 0) console.log(`  Processed ${ci + 1}/${contributions.length}: ${contribution.title?.substring(0, 40)}`);
  });

  pages.forEach((p, i) => { p.pageNumber = i + 1; });
  console.log(`\nTotal pages: ${pages.length}`);

  // Write pages
  console.log("Writing pages to Firestore...");
  const BATCH_SIZE = 500;
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = pages.slice(i, i + BATCH_SIZE);
    chunk.forEach(p => {
      const { id, ...data } = p;
      batch.set(db.doc(`${PAGES_DST}/${id}`), data);
    });
    await batch.commit();
    console.log(`  Written ${i + chunk.length}/${pages.length}`);
  }

  // Save state
  console.log("Saving state...");
  await db.doc(DST).set(cleanedState);
  console.log("Done!");

  // Verify
  let totalBlocks = 0;
  pages.forEach(p => p.zones.forEach(z => z.blocks.forEach(b => { totalBlocks++; })));
  console.log(`Verification: ${pages.length} pages, ${totalBlocks} blocks`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
