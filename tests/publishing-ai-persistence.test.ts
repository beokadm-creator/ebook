import test from 'node:test';
import assert from 'node:assert/strict';

import { contentParser } from '../src/lib/ai/contentParser';
import { createInitialPublishingDocument } from '../src/lib/publishing/defaultDocument';
import {
  compactContributionThreadText,
  rehydrateContributionThreadText,
} from '../src/lib/publishing/threadTextSerialization';

const createSpeakerThreadFixture = () => {
  const document = createInitialPublishingDocument('test-publication');
  const rootPage = document.pages[0];
  const master = document.masters.items.find((item) => item.id === rootPage.masterId);

  assert.ok(master, 'default speaker-thread master should exist');

  const zoneBySlotKey = (slotKey: string) => {
    const zone = master.contentZones.find((item) => item.slotKey === slotKey);
    assert.ok(zone, `zone for slot ${slotKey} should exist`);
    return zone;
  };

  document.contributions = [
    {
      id: 'contribution_1',
      order: 1,
      masterId: rootPage.masterId,
      pageId: rootPage.id,
      status: 'draft',
      title: '국문 제목',
      track: 'O1.Sample Track',
      createdAt: '2026-04-12T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
      slots: [
        { slotKey: 'track', label: '세션/트랙', role: 'subheading', language: 'mixed', text: 'O1.Sample Track' },
        { slotKey: 'title_ko', label: '국문 제목', role: 'title', language: 'ko', text: '국문 제목' },
        { slotKey: 'body_ko', label: '국문 본문', role: 'paragraph', language: 'ko', text: '국문 본문 내용입니다.' },
        { slotKey: 'title_en', label: '영문 제목', role: 'title', language: 'en', text: 'English Title' },
        { slotKey: 'body_en', label: '영문 본문', role: 'paragraph', language: 'en', text: 'English body content.' },
      ],
    },
  ];

  document.threads = [
    {
      id: 'thread_title_ko',
      type: 'text-flow',
      canonicalText: [{ text: '국문 제목' }],
      semanticRole: 'title',
      styleOverride: null,
      ebook: { include: true, toc: { enabled: true } },
      originBlockId: 'thread_title_ko_seg_000',
      sourceZoneId: zoneBySlotKey('title_ko').id,
      sourcePageId: rootPage.id,
      zoneSequence: [{ pageId: rootPage.id, zoneId: zoneBySlotKey('title_ko').id }],
    },
    {
      id: 'thread_body_ko',
      type: 'text-flow',
      canonicalText: [{ text: '국문 본문 내용입니다.' }],
      semanticRole: 'paragraph',
      styleOverride: null,
      ebook: { include: true, toc: { enabled: false } },
      originBlockId: 'thread_body_ko_seg_000',
      sourceZoneId: zoneBySlotKey('body_ko').id,
      sourcePageId: rootPage.id,
      zoneSequence: [{ pageId: rootPage.id, zoneId: zoneBySlotKey('body_ko').id }],
    },
    {
      id: 'thread_body_en',
      type: 'text-flow',
      canonicalText: [{ text: 'English body content.' }],
      semanticRole: 'paragraph',
      styleOverride: null,
      ebook: { include: true, toc: { enabled: false } },
      originBlockId: 'thread_body_en_seg_000',
      sourceZoneId: zoneBySlotKey('body_en').id,
      sourcePageId: rootPage.id,
      zoneSequence: [{ pageId: rootPage.id, zoneId: zoneBySlotKey('body_en').id }],
    },
  ];

  return document;
};

test('AI slot text is compacted from threads and rehydrated from contributions on load', () => {
  const document = createSpeakerThreadFixture();

  const compactedThreads = compactContributionThreadText(document);
  assert.equal(compactedThreads.length, 3);
  compactedThreads.forEach((thread) => {
    assert.equal(thread.canonicalText, undefined);
  });

  const rehydratedThreads = rehydrateContributionThreadText(document, compactedThreads);
  assert.deepEqual(
    rehydratedThreads.map((thread) => thread.canonicalText.map((run) => run.text).join('')),
    ['국문 제목', '국문 본문 내용입니다.', 'English body content.'],
  );
});

test('threads with text that differs from contribution slots are preserved without compaction', () => {
  const document = createSpeakerThreadFixture();
  document.threads[1].canonicalText = [{ text: '국문 본문 내용입니다.\n\n편집 메모가 추가됨.' }];

  const compactedThreads = compactContributionThreadText(document);
  assert.deepEqual(
    compactedThreads[1].canonicalText,
    [{ text: '국문 본문 내용입니다.\n\n편집 메모가 추가됨.' }],
  );

  const rehydratedThreads = rehydrateContributionThreadText(document, compactedThreads);
  assert.deepEqual(
    rehydratedThreads[1].canonicalText,
    [{ text: '국문 본문 내용입니다.\n\n편집 메모가 추가됨.' }],
  );
});

test('threads with bold marks are preserved even when plain text matches contribution slots', () => {
  const document = createSpeakerThreadFixture();
  document.threads[1].canonicalText = [
    { text: '국문 본문 ', marks: { bold: true } },
    { text: '내용입니다.' },
  ];

  const compactedThreads = compactContributionThreadText(document);
  assert.deepEqual(compactedThreads[1].canonicalText, [
    { text: '국문 본문 ', marks: { bold: true } },
    { text: '내용입니다.' },
  ]);
});

test('AI parsed bilingual fields are mapped to contribution slots without cross-copying languages', () => {
  const slots = contentParser.convertToSlots({
    track: 'O2.Oral Cancer & Reconstruction',
    titleKo: '국문 제목',
    authorsKo: '홍길동1, 김영희2',
    affiliationKo: '서울 어딘가 병원',
    title: 'English Title',
    authors: 'John Doe1, Jane Kim2',
    institution: 'Some Medical Center',
    koContent: '목적: 국문 본문입니다.',
    enContent: 'Background: This is the English body.',
    captions: [],
    images: [],
  });

  assert.equal(slots.find((slot) => slot.slotKey === 'title_ko')?.text, '국문 제목');
  assert.equal(slots.find((slot) => slot.slotKey === 'body_ko')?.text, '목적: 국문 본문입니다.');
  assert.equal(slots.find((slot) => slot.slotKey === 'title_en')?.text, 'English Title');
  assert.equal(slots.find((slot) => slot.slotKey === 'body_en')?.text, 'Background: This is the English body.');
  assert.equal(slots.filter((slot) => slot.slotKey === 'body_ko').length, 1);
  assert.equal(slots.filter((slot) => slot.slotKey === 'body_en').length, 1);
});
