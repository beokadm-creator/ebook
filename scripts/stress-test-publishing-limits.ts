import admin from 'firebase-admin';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';
import {
  createInitialPublishingDocument,
  DEFAULT_PRESENTATION_TRACKS,
} from '../src/lib/publishing/defaultDocument';
import {
  findZoneForContributionSlot,
  getFlowStartZoneId,
  rebuildAllContributionLayouts,
} from '../src/lib/publishing/contributionLayout';
import type { ContributionItem, ContributionSlotContent, PublishingDocument, TextThread } from '../src/types/publishing';

const args = process.argv.slice(2);

const getFlag = (name: string) => args.includes(name);
const getArg = (name: string) => {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
};

const projectId = getArg('--project') ?? 'demo-no-project';
const emulatorHost = getArg('--emulatorHost') ?? 'localhost:8080';
const sizesArg = getArg('--sizes') ?? '100,300,600';
const sizes = sizesArg.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v > 0);
const bodyChars = Number(getArg('--bodyChars') ?? '5000');
const seedOnly = getFlag('--seedOnly');
const readBack = !getFlag('--noRead');

process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const isoNow = () => new Date().toISOString();

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

const commitBatches = async (ops: Array<(batch: admin.firestore.WriteBatch) => void>, batchSize = 450) => {
  for (const group of chunk(ops, batchSize)) {
    const batch = db.batch();
    group.forEach((apply) => apply(batch));
    await batch.commit();
  }
};

const repeatToLength = (unit: string, length: number) => {
  if (length <= 0) return '';
  const repeats = Math.ceil(length / unit.length);
  return unit.repeat(repeats).slice(0, length);
};

const buildBodyKo = (length: number) =>
  repeatToLength('이 문장은 스트레스 테스트용 본문입니다. 여러 줄을 만들어 페이지가 분할되도록 합니다.\n', length);
const buildBodyEn = (length: number) =>
  repeatToLength('This is stress-test body text. It is intentionally long to trigger pagination.\n', length);

const createPageFromMaster = (
  document: PublishingDocument,
  masterId: string,
  pageNumber: number,
): PublishingDocument['pages'][number] | null => {
  const master = document.masters.items.find((item) => item.id === masterId);
  if (!master) return null;
  return {
    id: `page_${crypto.randomBytes(8).toString('hex')}`,
    pageNumber,
    masterId,
    pageRole: 'body',
    zones: master.contentZones.map((zone) => ({ zoneId: zone.id, blocks: [] })),
  };
};

const slotDefs: Array<Pick<ContributionSlotContent, 'slotKey' | 'label' | 'role' | 'language'>> = [
  { slotKey: 'track', label: '세션/트랙', role: 'subheading', language: 'mixed' },
  { slotKey: 'title_ko', label: '국문 제목', role: 'title', language: 'ko' },
  { slotKey: 'authors_ko', label: '국문 저자', role: 'paragraph', language: 'ko' },
  { slotKey: 'affiliation_ko', label: '국문 소속', role: 'paragraph', language: 'ko' },
  { slotKey: 'body_ko', label: '국문 본문', role: 'paragraph', language: 'ko' },
  { slotKey: 'title_en', label: '영문 제목', role: 'heading', language: 'en' },
  { slotKey: 'authors_en', label: '영문 저자', role: 'paragraph', language: 'en' },
  { slotKey: 'affiliation_en', label: '영문 소속', role: 'paragraph', language: 'en' },
  { slotKey: 'body_en', label: '영문 본문', role: 'paragraph', language: 'en' },
];

const buildContributionSlots = (index: number, bodyLength: number): ContributionSlotContent[] => ([
  { ...slotDefs[0], text: DEFAULT_PRESENTATION_TRACKS[index % DEFAULT_PRESENTATION_TRACKS.length].label },
  { ...slotDefs[1], text: `스트레스 테스트 제목 ${index + 1}` },
  { ...slotDefs[2], text: `홍길동, 김철수, Jane Doe` },
  { ...slotDefs[3], text: `테스트대학교 치의학과` },
  { ...slotDefs[4], text: buildBodyKo(bodyLength) },
  { ...slotDefs[5], text: `Stress Test Title ${index + 1}` },
  { ...slotDefs[6], text: `John Smith, Alex Kim` },
  { ...slotDefs[7], text: `Test University, Department` },
  { ...slotDefs[8], text: buildBodyEn(bodyLength) },
] satisfies ContributionSlotContent[]);

const ensureThreadsForContribution = (document: PublishingDocument, contribution: ContributionItem) => {
  contribution.slots.forEach((slot) => {
    if (!slot.text.trim()) return;
    const zone = findZoneForContributionSlot(document, contribution.masterId, slot.slotKey);
    if (!zone) return;
    const sourceZoneId = getFlowStartZoneId(document, contribution.masterId, zone.id);
    const threadId = `thread_${contribution.id}_${slot.slotKey}`;
    const originBlockId = `${threadId}_seg_000`;
    const thread: TextThread = {
      id: threadId,
      type: 'text-flow',
      canonicalText: [{ text: slot.text }],
      semanticRole: slot.role,
      ebook: {
        include: true,
        toc: { enabled: slot.role === 'heading' || slot.role === 'subheading' },
      },
      originBlockId,
      sourceZoneId,
      sourcePageId: contribution.pageId,
      zoneSequence: [{ pageId: contribution.pageId, zoneId: sourceZoneId }],
    };
    document.threads.push(thread);
  });
};

async function writeCollection<T extends { id: string }>(
  col: admin.firestore.CollectionReference,
  docs: T[],
) {
  const ops: Array<(batch: admin.firestore.WriteBatch) => void> = [];
  docs.forEach(({ id, ...data }) => {
    ops.push((batch) => batch.set(col.doc(id), data));
  });
  await commitBatches(ops, 450);
}

async function runOne(size: number) {
  const runId = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const publicationId = `stress_${size}_${runId}`;

  const document = createInitialPublishingDocument(publicationId);
  document.meta.title = { ko: `스트레스 테스트 ${size}`, en: `Stress Test ${size}` };
  document.meta.status = 'draft';
  document.meta.updatedAt = isoNow();

  document.contributions = [];
  document.pages = [];
  document.threads = [];
  document.assets = [];
  document.toc = { items: [] };

  for (let i = 0; i < size; i += 1) {
    const contributionId = `c_${String(i + 1).padStart(6, '0')}`;
    const pageId = `page_root_${contributionId}`;
    const slots = buildContributionSlots(i, bodyChars);
    const contribution: ContributionItem = {
      id: contributionId,
      order: i + 1,
      masterId: document.masters.defaultMasterId,
      pageId,
      title: `Stress ${i + 1}`,
      track: slots[0].text,
      status: 'draft',
      createdAt: isoNow(),
      updatedAt: isoNow(),
      slots,
    };
    document.contributions.push(contribution);
    ensureThreadsForContribution(document, contribution);
  }

  rebuildAllContributionLayouts(document, createPageFromMaster);

  const expected = {
    publicationId,
    contributions: document.contributions.length,
    masters: document.masters.items.length,
    threads: document.threads.length,
    pages: document.pages.length,
    assets: document.assets.length,
  };

  const pubRef = db.collection('publications').doc(publicationId);

  const startedAt = performance.now();
  await pubRef.set({
    id: publicationId,
    title: document.meta.title,
    status: document.meta.status,
    type: 'presentation',
    conferenceId: 'stress',
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });

  await pubRef.collection('editor').doc('state').set({
    version: document.version,
    meta: document.meta,
    layout: document.layout,
    toc: document.toc,
    contributionCount: document.contributions.length,
    contributionStorageVersion: 1,
    defaultMasterId: document.masters.defaultMasterId,
    masterCount: document.masters.items.length,
    masterStorageVersion: 1,
    updatedAt: isoNow(),
  });

  const t0 = performance.now();
  await writeCollection(pubRef.collection('editorMasters'), document.masters.items.map((m, idx) => ({ ...m, order: idx } as any)));
  const t1 = performance.now();
  await writeCollection(pubRef.collection('editorContributions'), document.contributions as any);
  const t2 = performance.now();
  await writeCollection(pubRef.collection('editorThreads'), document.threads as any);
  const t3 = performance.now();
  await writeCollection(pubRef.collection('editorPages'), document.pages as any);
  const t4 = performance.now();

  const timings = {
    writeMastersMs: Number((t1 - t0).toFixed(1)),
    writeContributionsMs: Number((t2 - t1).toFixed(1)),
    writeThreadsMs: Number((t3 - t2).toFixed(1)),
    writePagesMs: Number((t4 - t3).toFixed(1)),
    totalWriteMs: Number((t4 - startedAt).toFixed(1)),
  };

  let read = null as null | Record<string, number>;
  if (!seedOnly && readBack) {
    const r0 = performance.now();
    const [mastersSnap, contributionsSnap, threadsSnap, pagesSnap] = await Promise.all([
      pubRef.collection('editorMasters').get(),
      pubRef.collection('editorContributions').get(),
      pubRef.collection('editorThreads').get(),
      pubRef.collection('editorPages').get(),
    ]);
    const r1 = performance.now();
    read = {
      masters: mastersSnap.size,
      contributions: contributionsSnap.size,
      threads: threadsSnap.size,
      pages: pagesSnap.size,
      readAllMs: Number((r1 - r0).toFixed(1)),
    };
  }

  return { expected, timings, read };
}

async function main() {
  if (!sizes.length) {
    throw new Error('sizes 인자가 비었습니다. 예: --sizes 100,300,600');
  }

  console.log(JSON.stringify({
    projectId,
    emulatorHost,
    sizes,
    bodyChars,
    seedOnly,
    readBack,
    startedAt: isoNow(),
  }, null, 2));

  const results = [];
  for (const size of sizes) {
    const result = await runOne(size);
    results.push(result);
    console.log(JSON.stringify(result));
  }

  console.log(JSON.stringify({
    finishedAt: isoNow(),
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

