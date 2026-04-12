const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

try { admin.initializeApp({ projectId: "ebook-c74b2" }); } catch(e) {}
const db = getFirestore();

async function main() {
  const stateDoc = await db.doc("publications/DDVAjJoe2cAAvFgELBRr/editor/state").get();
  const state = stateDoc.data();
  
  const masters = state.masters?.items || [];
  console.log("masters count:", masters.length);
  console.log("default master:", state.masters?.defaultMasterId);
  masters.forEach(m => {
    console.log("  " + m.id + ": " + m.name + " mode:" + m.mode + " zones:" + m.contentZones?.length + " deco:" + m.decorations?.length);
  });
  console.log("\nstate JSON size:", JSON.stringify(state).length);
}

main().catch(console.error);
