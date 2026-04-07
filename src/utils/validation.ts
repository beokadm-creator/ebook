import { z } from 'zod';

// 언어 값을 검증하는 스키마
export const bilingualValueSchema = z.object({
  ko: z.string().min(1, '한국어 텍스트는 필수입니다'),
  en: z.string().optional()
});

// 간행물 스키마
export const publicationSchema = z.object({
  title: bilingualValueSchema,
  type: z.enum(['abstract', 'poster', 'presentation'], {
    errorMap: () => ({ message: '유효하지 않은 간행물 타입입니다' })
  }),
  conferenceId: z.string().min(1, '학술대회 ID는 필수입니다'),
  coverImage: z.string().url('유효하지 않은 이미지 URL입니다').optional(),
  description: bilingualValueSchema.optional(),
  isbn: z.string().regex(/^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/, '유효하지 않은 ISBN 형식입니다').optional(),
  publishedDate: z.string().datetime().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type PublicationInput = z.infer<typeof publicationSchema>;

// 학술대회 스키마
export const conferenceSchema = z.object({
  title: bilingualValueSchema,
  acronym: z.string().min(2, '약어는 최소 2자 이상이어야 합니다').max(20, '약어는 최대 20자까지 가능합니다'),
  startDate: z.string().datetime('유효하지 않은 시작일 형식입니다'),
  endDate: z.string().datetime('유효하지 않은 종료일 형식입니다'),
  location: bilingualValueSchema,
  description: bilingualValueSchema.optional(),
  websiteUrl: z.string().url('유효하지 않은 웹사이트 URL입니다').optional(),
  coverImage: z.string().url('유효하지 않은 커버 이미지 URL입니다').optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: '종료일은 시작일 이후여야 합니다', path: ['endDate'] }
);

export type ConferenceInput = z.infer<typeof conferenceSchema>;

// 아티클 스키마
export const articleSchema = z.object({
  title: bilingualValueSchema,
  authors: z.array(z.object({
    name: z.string().min(1, '저자 이름은 필수입니다'),
    affiliation: z.string().optional(),
    email: z.string().email('유효하지 않은 이메일 형식입니다').optional()
  })).min(1, '최소 한 명의 저자가 필요합니다'),
  abstract: bilingualValueSchema.optional(),
  keywords: z.array(z.string()).optional(),
  order: z.number().int().nonnegative().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type ArticleInput = z.infer<typeof articleSchema>;

// 콘텐츠 블록 스키마
export const contentBlockSchema = z.object({
  type: z.enum(['heading', 'text', 'image', 'video', 'ad', 'list', 'footnote'], {
    errorMap: () => ({ message: '유효하지 않은 블록 타입입니다' })
  }),
  content: z.record(z.unknown()),
  order: z.number().int().nonnegative(),
  style: z.object({
    textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
    marginTop: z.number().optional(),
    marginBottom: z.number().optional()
  }).optional()
});

export type ContentBlockInput = z.infer<typeof contentBlockSchema>;

// 사용자 스키마
export const userSchema = z.object({
  email: z.string().email('유효하지 않은 이메일 형식입니다'),
  displayName: z.string().min(2, '이름은 최소 2자 이상이어야 합니다').optional(),
  role: z.enum(['admin', 'editor', 'user'], {
    errorMap: () => ({ message: '유효하지 않은 사용자 역할입니다' })
  }),
  preferences: z.object({
    darkMode: z.boolean().optional(),
    fontSize: z.number().min(12).max(32).optional(),
    lineHeight: z.number().min(1).max(3).optional(),
    fontFamily: z.string().optional()
  }).optional()
});

export type UserInput = z.infer<typeof userSchema>;

// 광고 스키마
export const advertisementSchema = z.object({
  title: z.string().min(1, '광고 제목은 필수입니다'),
  imageUrl: z.string().url('유효하지 않은 이미지 URL입니다'),
  targetUrl: z.string().url('유효하지 않은 타겟 URL입니다'),
  position: z.enum(['header', 'sidebar', 'interstitial', 'footer']),
  status: z.enum(['active', 'inactive']),
  startDate: z.string().datetime('유효하지 않은 시작일 형식입니다'),
  endDate: z.string().datetime('유효하지 않은 종료일 형식입니다').optional(),
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0)
}).refine(
  (data) => !data.endDate || new Date(data.startDate) <= new Date(data.endDate),
  { message: '종료일은 시작일 이후여야 합니다', path: ['endDate'] }
);

export type AdvertisementInput = z.infer<typeof advertisementSchema>;

// 독서 진행률 스키마
export const readingProgressSchema = z.object({
  userId: z.string().min(1, '사용자 ID는 필수입니다'),
  publicationId: z.string().min(1, '간행물 ID는 필수입니다'),
  progress: z.number().min(0).max(100, '진행률은 0-100 사이여야 합니다'),
  currentIndex: z.number().int().nonnegative().default(0),
  lastRead: z.date().optional()
});

export type ReadingProgressInput = z.infer<typeof readingProgressSchema>;

// 검증 유틸리티 함수
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
} {
  try {
    const validatedData = schema.parse(data);
    return {
      success: true,
      data: validatedData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error
      };
    }
    return {
      success: false,
      errors: undefined
    };
  }
}

export function getValidationErrors(errors: z.ZodError): string[] {
  return errors.errors.map(error => `${error.path.join('.')}: ${error.message}`);
}

// 파이어스토어 데이터 검증 헬퍼
export async function validateAndCreate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  createFn: (validatedData: T) => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  const validation = validateData(schema, data);
  
  if (!validation.success) {
    const errorMessages = getValidationErrors(validation.errors!);
    return {
      success: false,
      error: errorMessages.join(', ')
    };
  }

  try {
    await createFn(validation.data!);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
  }
}