const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

async function main() {
  const orig = (await db.doc("publications/DDVAjJoe2cAAvFgELBRr/editor/state").get()).data();
  const copy = (await db.doc("publications/xqnmUaFi0eiFXqy9km8x/editor/state").get()).data();

  // compare contribution 1
  const o = orig.contributions[0];
  const c = copy.contributions[0];
  
  console.log("=== ORIG C1 ===");
  (o.slots || []).forEach(s => console.log(`  ${s.slotKey}: ${s.text?.length || 0} chars`));
  
  console.log("\n=== COPY C1 ===");
  (c.slots || []).forEach(s => console.log(`  ${s.slotKey}: ${s.text?.length || 0} chars`));

  // compare overall slot text totals
  let origTotal = 0, copyTotal = 0;
  orig.contributions.forEach(c => c.slots?.forEach(s => { origTotal += (s.text || "").length; }));
  copy.contributions.forEach(c => c.slots?.forEach(s => { copyTotal += (s.text || "").length; }));
  console.log(`\nTotal slot text: orig=${origTotal} copy=${copyTotal}`);

  // compare thread canonicalText
  let origThreadTotal = 0, copyThreadTotal = 0;
  orig.threads?.forEach(t => { origThreadTotal += typeof t.canonicalText === 'string' ? t.canonicalText.length : 0; });
  copy.threads?.forEach(t => { copyThreadTotal += typeof t.canonicalText === 'string' ? t.canonicalText.length : 0; });
  console.log(`Total thread text: orig=${origThreadTotal} copy=${copyThreadTotal}`);
  
  // check if canonicalText is object in copy
  const sampleThread = copy.threads?.[4]; // should be body_en for C1
  console.log(`\nCopy body_en thread type: ${typeof sampleThread?.canonicalText}`);
  console.log(`Copy body_en thread keys: ${typeof sampleThread?.canonicalText === 'object' && sampleThread?.canonicalText ? Object.keys(sampleThread.canonicalText).join(",") : "N/A"}`);
  if (typeof sampleThread?.canonicalText === 'object' && sampleThread?.canonicalText) {
    console.log(`Copy body_en thread preview: ${JSON.stringify(sampleThread.canonicalText).substring(0,200)}`);
  }
}

main().catch(console.error);
