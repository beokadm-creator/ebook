import mammoth from 'mammoth';
import { TextRole } from '@/types/publishing';
import { contentParser, ContentThread } from '../ai/contentParser';

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
  lines.findIndex((line) => prefixes.some((prefix) => line.toLowerCase().startsWith(prefix.toLowerCase())));

const collectSectionText = (lines: string[], startIndex: number, endIndex: number) =>
  lines
    .slice(startIndex, endIndex)
    .join('\n\n')
    .trim();

const buildBilingualAbstractSlots = (lines: string[]): ImportedSlotDraft[] => {
  const introKo = findIndexByPrefix(lines, ['서론']);
  const caseKo = findIndexByPrefix(lines, ['증례']);
  const discussionKo = findIndexByPrefix(lines, ['고찰']);
  const introEn = findIndexByPrefix(lines, ['introduction']);
  const caseEn = findIndexByPrefix(lines, ['case']);
  const discussionEn = findIndexByPrefix(lines, ['discussion']);

  const slots: ImportedSlotDraft[] = [];

  if (introKo > 2) {
    slots.push({ slotKey: 'title_ko', label: '국문 제목', text: lines[1] ?? '', role: 'title' });
    slots.push({ slotKey: 'authors_ko', label: '국문 저자', text: lines[2] ?? '', role: 'paragraph' });
    slots.push({ slotKey: 'affiliation_ko', label: '국문 소속', text: lines[3] ?? '', role: 'paragraph' });
  }

  if (introKo >= 0) {
    const koBody = [
      introKo >= 0 ? collectSectionText(lines, introKo, caseKo >= 0 ? caseKo : discussionKo >= 0 ? discussionKo : introEn >= 0 ? introEn : lines.length) : '',
      caseKo >= 0 ? collectSectionText(lines, caseKo, discussionKo >= 0 ? discussionKo : introEn >= 0 ? introEn : lines.length) : '',
      discussionKo >= 0 ? collectSectionText(lines, discussionKo, introEn >= 0 ? introEn : lines.length) : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (koBody) {
      slots.push({ slotKey: 'body_ko', label: '국문 본문', text: koBody, role: 'paragraph' });
    }
  }

  if (introEn > 2) {
    slots.push({ slotKey: 'title_en', label: '영문 제목', text: lines[introEn - 3] ?? '', role: 'title' });
    slots.push({ slotKey: 'authors_en', label: '영문 저자', text: lines[introEn - 2] ?? '', role: 'paragraph' });
    slots.push({ slotKey: 'affiliation_en', label: '영문 소속', text: lines[introEn - 1] ?? '', role: 'paragraph' });
  }

  if (introEn >= 0) {
    const enBody = [
      collectSectionText(lines, introEn, caseEn >= 0 ? caseEn : discussionEn >= 0 ? discussionEn : lines.length),
      caseEn >= 0 ? collectSectionText(lines, caseEn, discussionEn >= 0 ? discussionEn : lines.length) : '',
      discussionEn >= 0 ? collectSectionText(lines, discussionEn, lines.length) : '',
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

export const parseDocxManuscript = async (file: File): Promise<ParsedDocxManuscript> => {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  const rawText = value.trim();
  const lines = compactLines(rawText);

  return {
    rawText,
    slots: buildBilingualAbstractSlots(lines),
  };
};

export interface ParsedDocxManuscriptWithAI {
  rawText: string;
  slots: ImportedSlotDraft[];
  aiParsedContent?: ContentThread[];
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

  // 기본 파싱 결과
  const result: ParsedDocxManuscriptWithAI = {
    rawText,
    slots: buildBilingualAbstractSlots(lines),
  };

  // AI 파싱 시도
  if (useAI) {
    try {
      const parsedContent = await contentParser.parseDocumentContent(rawText);
      const threads = contentParser.convertToThreads(parsedContent);
      result.aiParsedContent = threads;
    } catch (error) {
      result.aiParsingError = error instanceof Error ? error.message : 'AI 파싱 중 알 수 없는 오류가 발생했습니다';
      console.warn('AI parsing failed, falling back to basic parsing:', error);
    }
  }

  return result;
};
