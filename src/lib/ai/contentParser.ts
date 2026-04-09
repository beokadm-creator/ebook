import { glmClient } from './glmClient';
import { TextRole } from '@/types/publishing';

export interface ParsedContent {
  title: string;
  authors: string;
  institution: string;
  koContent: string;
  enContent: string;
  captions: string[];
  images: string[];
}

export interface ContentThread {
  id: string;
  role: TextRole;
  text: string;
  language: 'ko' | 'en' | 'mixed';
}

const PARSING_PROMPT = `
다음 학술 발표 텍스트를 분석해서 구조화된 JSON으로 반환해줘.

요구사항:
1. 제목, 저자, 소속, 한국어 본문, 영문 본문, 그림 캡션을 분리해줘
2. 문맥이나 내용은 절대 변경하지 말고, 띄어쓰기나 오탈자만 최소한으로 수정해줘
3. 한국어와 영문 내용을 명확히 분리해줘

반환 형식 (JSON):
{
  "title": "제목 (한국어 우선, 없으면 영어)",
  "authors": "저자명 (모든 저자를 콤마로 구분)",
  "institution": "소속기관",
  "koContent": "한국어 본문 (섹션별로 자연스럽게 구성)",
  "enContent": "영문 본문 (섹션별로 자연스럽게 구성)",
  "captions": ["그림 캡션들", "표 캡션들"],
  "images": ["이미지 설명들"]
}

주의사항:
- 내용을 임의로 추가하거나 변경하지 마세요
- 원문의 의미를 그대로 유지하세요
- 한국어/영어 섞인 부분은 주언어에 따라 분류하세요
- 빈 필드는 빈 문자열("")로 반환하세요

텍스트:
`;

export class ContentParser {
  async parseDocumentContent(rawText: string): Promise<ParsedContent> {
    try {
      const response = await glmClient.createChatCompletion([
        {
          role: 'system',
          content: '당신은 학술 문서 분석 전문가입니다. 주어진 텍스트를 정확히 분석하여 구조화하세요. 내용을 변경하지 말고 오직 구조화만 수행하세요.',
        },
        {
          role: 'user',
          content: `${PARSING_PROMPT}\n\n${rawText}`,
        },
      ], {
        temperature: 0.1, // 일관성을 위해 낮은 temperature
        max_tokens: 4000,
      });

      // JSON 응답 파싱
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI response does not contain valid JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]) as ParsedContent;

      // 빈 배열 기본값 설정
      if (!Array.isArray(parsed.captions)) {
        parsed.captions = [];
      }
      if (!Array.isArray(parsed.images)) {
        parsed.images = [];
      }

      return parsed;
    } catch (error) {
      console.error('Content parsing error:', error);
      throw new Error(`AI 파싱 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  convertToThreads(parsed: ParsedContent): ContentThread[] {
    const threads: ContentThread[] = [];

    // 제목
    if (parsed.title) {
      threads.push({
        id: `title_${Date.now()}`,
        role: 'title',
        text: parsed.title,
        language: this.detectLanguage(parsed.title),
      });
    }

    // 저자
    if (parsed.authors) {
      threads.push({
        id: `authors_${Date.now()}`,
        role: 'paragraph',
        text: parsed.authors,
        language: this.detectLanguage(parsed.authors),
      });
    }

    // 소속
    if (parsed.institution) {
      threads.push({
        id: `institution_${Date.now()}`,
        role: 'paragraph',
        text: parsed.institution,
        language: this.detectLanguage(parsed.institution),
      });
    }

    // 한국어 본문
    if (parsed.koContent) {
      threads.push({
        id: `ko_content_${Date.now()}`,
        role: 'paragraph',
        text: parsed.koContent,
        language: 'ko',
      });
    }

    // 영문 본문
    if (parsed.enContent) {
      threads.push({
        id: `en_content_${Date.now()}`,
        role: 'paragraph',
        text: parsed.enContent,
        language: 'en',
      });
    }

    // 캡션들
    parsed.captions.forEach((caption, index) => {
      if (caption.trim()) {
        threads.push({
          id: `caption_${Date.now()}_${index}`,
          role: 'caption',
          text: caption,
          language: this.detectLanguage(caption),
        });
      }
    });

    return threads;
  }

  private detectLanguage(text: string): 'ko' | 'en' | 'mixed' {
    const koreanChars = (text.match(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const totalChars = koreanChars + englishChars;

    if (totalChars === 0) return 'mixed';

    const koreanRatio = koreanChars / totalChars;

    if (koreanRatio > 0.7) return 'ko';
    if (koreanRatio < 0.3) return 'en';
    return 'mixed';
  }
}

export const contentParser = new ContentParser();