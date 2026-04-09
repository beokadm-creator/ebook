import { glmClient } from './glmClient';
import { ContributionLanguage, ContributionSlotContent, TextRole } from '@/types/publishing';

export interface ParsedContent {
  track: string;
  titleKo: string;
  authorsKo: string;
  affiliationKo: string;
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
  slotKey: string;
  label: string;
  role: TextRole;
  text: string;
  language: ContributionLanguage;
}

const PARSING_PROMPT = `
다음 학술 발표 텍스트를 분석해서 구조화된 JSON으로 반환해줘.

요구사항:
1. 제목, 저자, 소속, 한국어 본문, 영문 본문, 그림 캡션을 분리해줘
2. 문맥이나 내용은 절대 변경하지 말고, 띄어쓰기나 오탈자만 최소한으로 수정해줘
3. 한국어와 영문 내용을 명확히 분리해줘
4. 이 문서는 발표자용 통합 마스터 1개에 들어가며, 한국어 슬롯과 영문 슬롯이 따로 존재한다
5. 한국어 내용은 한국어 슬롯에만, 영문 내용은 영문 슬롯에만 넣어야 한다
6. 한글만 있는 문서는 한국어 필드만 채우고, 영문만 있는 문서는 영문 필드만 채운다
7. 영어가 없는데 영어 필드에 한국어를 복사해서 넣지 말고 반드시 빈 문자열로 둔다
8. 한국어가 없는데 한국어 필드에 영어를 복사해서 넣지 말고 반드시 빈 문자열로 둔다
9. 저자명에 붙은 소속 표기 숫자/기호(*, 1), 2), 1,2) 등)는 삭제하지 말고 그대로 유지한다
10. 본문에서 목적/방법/결과/결론 및 Introduction/Methods/Results/Conclusion 같은 섹션 라벨은 본문 첫머리에 보이도록 유지한다
11. 세션/트랙 문자열에 O1~O6 또는 P1~P7 접두가 보이면 track 필드에 그대로 유지한다

반환 형식 (JSON):
{
  "track": "세션/트랙명",
  "titleKo": "국문 제목",
  "authorsKo": "국문 저자",
  "affiliationKo": "국문 소속",
  "title": "영문 제목",
  "authors": "영문 저자명 (모든 저자를 콤마로 구분)",
  "institution": "영문 소속기관",
  "koContent": "한국어 본문",
  "enContent": "영문 본문",
  "captions": ["그림 캡션들", "표 캡션들"],
  "images": ["이미지 설명들"]
}

주의사항:
- 내용을 임의로 추가하거나 변경하지 마세요
- 원문의 의미를 그대로 유지하세요
- 한국어/영어 섞인 부분은 주언어에 따라 분류하세요
- 국문 제목/저자/소속/본문은 titleKo, authorsKo, affiliationKo, koContent에만 넣으세요
- 영문 제목/저자/소속/본문은 title, authors, institution, enContent에만 넣으세요
- 한국어 본문이 끝난 뒤 영어 본문이 시작되는 문서는 두 본문을 절대 합치지 마세요
- 저자 소속 번호나 기호를 임의로 삭제하거나 풀어쓰지 마세요
- 목적, 방법, 결과, 결론, 서론, 증례, 고찰, Introduction, Methods, Results, Conclusion 같은 라벨은 문장 앞에 유지하세요
- O1.Facial Deformity, O2.Oral Cancer & Reconstruction, O3.Oral Disease & Others, O4.Dental Implant, O5.TMJ, O6.Trauma & Dentoalveolar Surgery
- P1.Oral Cancer & Pathology, P2.Trauma & Dentoalveolar Surgery, P3.Dental Implant, P4.Orthognathic & Esthetic Surgery, P5.Tissue Engineering & Reconstruction, P6.TMJ & Cleft Lip Palate, P7.Infection & Others
- 빈 필드는 빈 문자열("")로 반환하세요

텍스트:
`;

const trimParsedContent = (parsed: ParsedContent): ParsedContent => ({
  ...parsed,
  track: parsed.track?.trim() ?? '',
  titleKo: parsed.titleKo?.trim() ?? '',
  authorsKo: parsed.authorsKo?.trim() ?? '',
  affiliationKo: parsed.affiliationKo?.trim() ?? '',
  title: parsed.title?.trim() ?? '',
  authors: parsed.authors?.trim() ?? '',
  institution: parsed.institution?.trim() ?? '',
  koContent: parsed.koContent?.trim() ?? '',
  enContent: parsed.enContent?.trim() ?? '',
  captions: Array.isArray(parsed.captions) ? parsed.captions.map((caption) => caption.trim()).filter(Boolean) : [],
  images: Array.isArray(parsed.images) ? parsed.images.map((image) => image.trim()).filter(Boolean) : [],
});

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

      const parsed = trimParsedContent(JSON.parse(jsonMatch[0]) as ParsedContent);
      return this.normalizeParsedContent(parsed);
    } catch (error) {
      console.error('Content parsing error:', error);
      throw new Error(`AI 파싱 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private normalizeParsedContent(parsed: ParsedContent): ParsedContent {
    const normalized = { ...parsed };
    const englishBodyExists = this.detectLanguage(normalized.enContent) === 'en';
    const englishMetaExists = [normalized.title, normalized.authors, normalized.institution]
      .some((value) => this.detectLanguage(value) === 'en');
    const koreanBodyExists = this.detectLanguage(normalized.koContent) === 'ko';
    const koreanMetaExists = [normalized.titleKo, normalized.authorsKo, normalized.affiliationKo]
      .some((value) => this.detectLanguage(value) === 'ko');

    if (normalized.title && this.detectLanguage(normalized.title) !== 'en' && normalized.title === normalized.titleKo) {
      normalized.title = '';
    }
    if (normalized.authors && this.detectLanguage(normalized.authors) !== 'en' && normalized.authors === normalized.authorsKo) {
      normalized.authors = '';
    }
    if (
      normalized.institution
      && this.detectLanguage(normalized.institution) !== 'en'
      && normalized.institution === normalized.affiliationKo
    ) {
      normalized.institution = '';
    }

    if (!englishBodyExists && !englishMetaExists) {
      normalized.title = '';
      normalized.authors = '';
      normalized.institution = '';
      normalized.enContent = '';
    }

    if (!koreanBodyExists && !koreanMetaExists) {
      normalized.titleKo = '';
      normalized.authorsKo = '';
      normalized.affiliationKo = '';
      normalized.koContent = '';
    }

    return normalized;
  }

  convertToThreads(parsed: ParsedContent): ContentThread[] {
    const threads: ContentThread[] = [];

    if (parsed.track) {
      threads.push({
        id: `track_${Date.now()}`,
        slotKey: 'track',
        label: '세션/트랙',
        role: 'subheading',
        text: parsed.track,
        language: this.detectLanguage(parsed.track),
      });
    }

    if (parsed.titleKo) {
      threads.push({
        id: `title_ko_${Date.now()}`,
        slotKey: 'title_ko',
        label: '국문 제목',
        role: 'title',
        text: parsed.titleKo,
        language: 'ko',
      });
    }

    if (parsed.authorsKo) {
      threads.push({
        id: `authors_ko_${Date.now()}`,
        slotKey: 'authors_ko',
        label: '국문 저자',
        role: 'paragraph',
        text: parsed.authorsKo,
        language: 'ko',
      });
    }

    if (parsed.affiliationKo) {
      threads.push({
        id: `affiliation_ko_${Date.now()}`,
        slotKey: 'affiliation_ko',
        label: '국문 소속',
        role: 'paragraph',
        text: parsed.affiliationKo,
        language: 'ko',
      });
    }

    // 제목
    if (parsed.title) {
      threads.push({
        id: `title_${Date.now()}`,
        slotKey: 'title_en',
        label: '영문 제목',
        role: 'title',
        text: parsed.title,
        language: this.detectLanguage(parsed.title),
      });
    }

    // 저자
    if (parsed.authors) {
      threads.push({
        id: `authors_${Date.now()}`,
        slotKey: 'authors_en',
        label: '영문 저자',
        role: 'paragraph',
        text: parsed.authors,
        language: this.detectLanguage(parsed.authors),
      });
    }

    // 소속
    if (parsed.institution) {
      threads.push({
        id: `institution_${Date.now()}`,
        slotKey: 'affiliation_en',
        label: '영문 소속',
        role: 'paragraph',
        text: parsed.institution,
        language: this.detectLanguage(parsed.institution),
      });
    }

    // 한국어 본문
    if (parsed.koContent) {
      threads.push({
        id: `ko_content_${Date.now()}`,
        slotKey: 'body_ko',
        label: '국문 본문',
        role: 'paragraph',
        text: parsed.koContent,
        language: 'ko',
      });
    }

    // 영문 본문
    if (parsed.enContent) {
      threads.push({
        id: `en_content_${Date.now()}`,
        slotKey: 'body_en',
        label: '영문 본문',
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
          slotKey: 'captions',
          label: '캡션',
          role: 'caption',
          text: caption,
          language: this.detectLanguage(caption),
        });
      }
    });

    return threads;
  }

  convertToSlots(parsed: ParsedContent): ContributionSlotContent[] {
    return this.convertToThreads(parsed).map((thread) => ({
      slotKey: thread.slotKey,
      label: thread.label,
      role: thread.role,
      text: thread.text,
      language: thread.language,
    }));
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
