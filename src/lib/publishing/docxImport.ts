import mammoth from 'mammoth';
import { ContributionLanguage, ContributionSlotContent, TextRole } from '@/types/publishing';
import { contentParser } from '../ai/contentParser';
import { normalizeAuthorText, startsWithStructuredLabel } from './structuredLabels';

export interface ImportedSlotDraft {
  slotKey: string;
  label: string;
  text: string;
  role: TextRole;
}

export interface ParsedDocxManuscript {
  rawText: string;
  slots: ImportedSlotDraft[];
}

export interface ImportedContributionDraft {
  sourceFileName?: string;
  track: string;
  title: string;
  slots: ContributionSlotContent[];
}

const normalizeLine = (line: string) =>
  line
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

const compactLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

const findIndexByPrefix = (lines: string[], prefixes: string[]) =>
  lines.findIndex((line) => {
    const normalized = line.toLowerCase().replace(/^[:\-\s]+/, '');
    return prefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
  });

const getLanguageCharacterCounts = (text: string) => ({
  ko: (text.match(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g) || []).length,
  en: (text.match(/[A-Za-z]/g) || []).length,
});

const detectLineLanguage = (text: string): ContributionLanguage => {
  const { ko, en } = getLanguageCharacterCounts(text);
  const total = ko + en;
  if (!total) return 'mixed';
  if (ko / total > 0.7) return 'ko';
  if (en / total > 0.7) return 'en';
  return 'mixed';
};

const looksLikeAffiliationLine = (line: string) =>
  /(department|division|college|school|university|hospital|center|centre|clinic|faculty|institute|laboratory|lab)/i.test(line)
  || /(대학교|대학병원|병원|교실|구강악안면외과|의과대학|치과대학|센터|연구소)/.test(line);

const looksLikeAuthorLine = (line: string) => {
  if (looksLikeAffiliationLine(line)) {
    return false;
  }

  const separators = (line.match(/,|·|;|\*|\d+\)|\d+\s/g) || []).length;
  const words = line.split(/\s+/).filter(Boolean).length;
  return separators >= 1 || words >= 2;
};

const looksLikeEnglishHeading = (line: string) =>
  detectLineLanguage(line) === 'en'
  && (startsWithStructuredLabel(line) || /^(abstract|keywords?)\b/i.test(line));

const findEnglishTitleIndex = (lines: string[]) => {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (detectLineLanguage(line) !== 'en') {
      continue;
    }
    if (looksLikeAffiliationLine(line) || looksLikeEnglishHeading(line)) {
      continue;
    }

    let score = 0;
    if (line.length >= 24) score += 2;
    if (/[,:-]/.test(line)) score += 1;
    if (/[A-Z]/.test(line)) score += 1;
    if (index > 3) score += 1;
    if (detectLineLanguage(lines[index - 1] ?? '') === 'ko') score += 2;
    if (looksLikeAuthorLine(lines[index + 1] ?? '')) score += 2;
    if (looksLikeAffiliationLine(lines[index + 2] ?? '')) score += 3;
    if (looksLikeEnglishHeading(lines[index + 3] ?? '') || looksLikeEnglishHeading(lines[index + 1] ?? '')) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore >= 4 ? bestIndex : -1;
};

const collectSectionText = (lines: string[], startIndex: number, endIndex: number) =>
  lines
    .slice(startIndex, endIndex)
    .join('\n\n')
    .trim();

const buildBilingualAbstractSlots = (lines: string[]): ImportedSlotDraft[] => {
  const introKo = findIndexByPrefix(lines, ['서론', '배경', '목적']);
  const caseKo = findIndexByPrefix(lines, ['증례', '증례 보고', '증례보고']);
  const discussionKo = findIndexByPrefix(lines, ['고찰', '결론', '문헌 고찰', '문헌 고찰 및 결론']);
  const introEn = findIndexByPrefix(lines, ['introduction', 'background', 'backgrounds', 'abstract', 'purpose']);
  const caseEn = findIndexByPrefix(lines, ['case', 'cases', 'case report', 'case presentation']);
  const discussionEn = findIndexByPrefix(lines, ['discussion', 'conclusion', 'conclusions', 'literature review', 'literature review and conclusion']);
  const englishTitleIndex = findEnglishTitleIndex(lines);

  const slots: ImportedSlotDraft[] = [];

  if (introKo > 2) {
    slots.push({ slotKey: 'title_ko', label: '국문 제목', text: lines[1] ?? '', role: 'title' });
    slots.push({ slotKey: 'authors_ko', label: '국문 저자', text: lines[2] ?? '', role: 'paragraph' });
    slots.push({ slotKey: 'affiliation_ko', label: '국문 소속', text: lines[3] ?? '', role: 'paragraph' });
  }

  if (introKo >= 0) {
    const koBody = [
      introKo >= 0 ? collectSectionText(lines, introKo, caseKo >= 0 ? caseKo : discussionKo >= 0 ? discussionKo : englishTitleIndex >= 0 ? englishTitleIndex : introEn >= 0 ? introEn : lines.length) : '',
      caseKo >= 0 ? collectSectionText(lines, caseKo, discussionKo >= 0 ? discussionKo : englishTitleIndex >= 0 ? englishTitleIndex : introEn >= 0 ? introEn : lines.length) : '',
      discussionKo >= 0 ? collectSectionText(lines, discussionKo, englishTitleIndex >= 0 ? englishTitleIndex : introEn >= 0 ? introEn : lines.length) : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (koBody) {
      slots.push({ slotKey: 'body_ko', label: '국문 본문', text: koBody, role: 'paragraph' });
    }
  }

  const englishMetaStart = englishTitleIndex >= 0
    ? englishTitleIndex
    : introEn > 2
      ? introEn - 3
      : -1;

  if (englishMetaStart >= 0) {
    slots.push({ slotKey: 'title_en', label: '영문 제목', text: lines[englishMetaStart] ?? '', role: 'title' });
    slots.push({ slotKey: 'authors_en', label: '영문 저자', text: lines[englishMetaStart + 1] ?? '', role: 'paragraph' });
    slots.push({ slotKey: 'affiliation_en', label: '영문 소속', text: lines[englishMetaStart + 2] ?? '', role: 'paragraph' });
  }

  const englishBodyStart = introEn >= 0
    ? introEn
    : englishMetaStart >= 0
      ? englishMetaStart + 3
      : -1;

  if (englishBodyStart >= 0) {
    const enBody = [
      collectSectionText(lines, englishBodyStart, caseEn >= 0 && caseEn > englishBodyStart ? caseEn : discussionEn >= 0 && discussionEn > englishBodyStart ? discussionEn : lines.length),
      caseEn >= 0 && caseEn > englishBodyStart ? collectSectionText(lines, caseEn, discussionEn >= 0 && discussionEn > caseEn ? discussionEn : lines.length) : '',
      discussionEn >= 0 && discussionEn > englishBodyStart ? collectSectionText(lines, discussionEn, lines.length) : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (enBody) {
      slots.push({ slotKey: 'body_en', label: '영문 본문', text: enBody, role: 'paragraph' });
    }
  }

  if (!slots.length) {
    const body = lines.join('\n\n').trim();
    if (body) {
      slots.push({ slotKey: 'body', label: '본문', text: body, role: 'paragraph' });
    }
  }

  return slots.filter((slot) => slot.text.trim());
};

const detectSlotLanguage = (slotKey: string): ContributionLanguage => {
  if (slotKey.endsWith('_ko')) return 'ko';
  if (slotKey.endsWith('_en')) return 'en';
  return 'mixed';
};

const buildContributionDraftFromSlots = (slots: ImportedSlotDraft[], sourceFileName?: string): ImportedContributionDraft => {
  const normalizedSlots: ContributionSlotContent[] = slots
    .filter((slot) => slot.text.trim())
    .map((slot) => ({
      slotKey: slot.slotKey,
      label: slot.label,
      text: (slot.slotKey === 'authors_ko' || slot.slotKey === 'authors_en') 
        ? normalizeAuthorText(slot.text.trim()) 
        : slot.text.trim(),
      role: slot.role,
      language: detectSlotLanguage(slot.slotKey),
    }));

  const title =
    normalizedSlots.find((slot) => slot.slotKey === 'title_ko')?.text
    ?? normalizedSlots.find((slot) => slot.slotKey === 'title_en')?.text
    ?? normalizedSlots.find((slot) => slot.slotKey === 'body')?.text.slice(0, 80)
    ?? 'Untitled contribution';
  const track = normalizedSlots.find((slot) => slot.slotKey === 'track')?.text ?? '';

  return {
    sourceFileName,
    track,
    title,
    slots: normalizedSlots,
  };
};

const buildStructuredSlotsFromLines = (lines: string[]): ImportedSlotDraft[] => {
  const slots = buildBilingualAbstractSlots(lines);
  if (!lines.length) {
    return slots;
  }

  const hasTrack = slots.some((slot) => slot.slotKey === 'track');
  const hasKoTitle = slots.some((slot) => slot.slotKey === 'title_ko');
  const hasEnTitle = slots.some((slot) => slot.slotKey === 'title_en');

  const enriched: ImportedSlotDraft[] = [];
  const trackLine = lines[0]?.trim();
  if (trackLine && !hasTrack) {
    enriched.push({ slotKey: 'track', label: '세션/트랙', text: trackLine, role: 'subheading' });
  }

  if (lines[1]?.trim() && !hasKoTitle) {
    enriched.push({ slotKey: 'title_ko', label: '국문 제목', text: lines[1].trim(), role: 'title' });
  }

  if (lines[2]?.trim() && !slots.some((slot) => slot.slotKey === 'authors_ko')) {
    enriched.push({ slotKey: 'authors_ko', label: '국문 저자', text: lines[2].trim(), role: 'paragraph' });
  }

  if (lines[3]?.trim() && !slots.some((slot) => slot.slotKey === 'affiliation_ko')) {
    enriched.push({ slotKey: 'affiliation_ko', label: '국문 소속', text: lines[3].trim(), role: 'paragraph' });
  }

  const firstEnglishTitleIndex = findEnglishTitleIndex(lines);
  if (firstEnglishTitleIndex >= 0) {
    if (!hasEnTitle) {
      enriched.push({ slotKey: 'title_en', label: '영문 제목', text: lines[firstEnglishTitleIndex], role: 'title' });
    }
    if (lines[firstEnglishTitleIndex + 1] && !slots.some((slot) => slot.slotKey === 'authors_en')) {
      enriched.push({ slotKey: 'authors_en', label: '영문 저자', text: lines[firstEnglishTitleIndex + 1], role: 'paragraph' });
    }
    if (lines[firstEnglishTitleIndex + 2] && !slots.some((slot) => slot.slotKey === 'affiliation_en')) {
      enriched.push({ slotKey: 'affiliation_en', label: '영문 소속', text: lines[firstEnglishTitleIndex + 2], role: 'paragraph' });
    }
  }

  return [...enriched, ...slots].filter((slot, index, array) =>
    array.findIndex((item) => item.slotKey === slot.slotKey) === index,
  );
};

export interface ParsedDocxManuscriptWithAI {
  rawText: string;
  slots: ImportedSlotDraft[];
  contributionDraft: ImportedContributionDraft;
  aiParsedSlots?: ContributionSlotContent[];
  aiParsingError?: string;
}

export const parseDocxManuscriptWithAI = async (
  file: File,
  useAI: boolean = true
): Promise<ParsedDocxManuscriptWithAI> => {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  const rawText = value.trim();
  const lines = compactLines(rawText);
  const structuredSlots = buildStructuredSlotsFromLines(lines);

  // 기본 파싱 결과
  const result: ParsedDocxManuscriptWithAI = {
    rawText,
    slots: structuredSlots,
    contributionDraft: buildContributionDraftFromSlots(structuredSlots, file.name),
  };

  // AI 파싱 시도
  if (useAI) {
    try {
      const parsedContent = await contentParser.parseDocumentContent(rawText);
      const aiParsedSlots = contentParser.convertToSlots(parsedContent);
      result.aiParsedSlots = aiParsedSlots;
      result.contributionDraft = {
        sourceFileName: file.name,
        track: aiParsedSlots.find((slot) => slot.slotKey === 'track')?.text ?? result.contributionDraft.track,
        title:
          aiParsedSlots.find((slot) => slot.slotKey === 'title_ko')?.text
          ?? aiParsedSlots.find((slot) => slot.slotKey === 'title_en')?.text
          ?? result.contributionDraft.title,
        slots: aiParsedSlots.length ? aiParsedSlots : result.contributionDraft.slots,
      };
    } catch (error) {
      result.aiParsingError = error instanceof Error ? error.message : 'AI 파싱 중 알 수 없는 오류가 발생했습니다';
      console.warn('AI parsing failed, falling back to basic parsing:', error);
    }
  }

  return result;
};
