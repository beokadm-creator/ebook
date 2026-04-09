interface AppError {
  code: string;
  message: string;
  statusCode: number;
  isOperational: boolean;
}

class CustomError extends Error implements AppError {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

const FIREBASE_ERROR_CODES: Record<string, AppError> = {
  'unauthenticated': {
    code: 'AUTH_001',
    message: '로그인이 필요합니다.',
    statusCode: 401,
    isOperational: true
  },
  'permission-denied': {
    code: 'AUTH_002',
    message: '접근 권한이 없습니다.',
    statusCode: 403,
    isOperational: true
  },
  'not-found': {
    code: 'DATA_001',
    message: '요청하신 데이터를 찾을 수 없습니다.',
    statusCode: 404,
    isOperational: true
  },
  'already-exists': {
    code: 'DATA_002',
    message: '이미 존재하는 데이터입니다.',
    statusCode: 409,
    isOperational: true
  },
  'aborted': {
    code: 'NETWORK_001',
    message: '요청이 중단되었습니다. 다시 시도해주세요.',
    statusCode: 409,
    isOperational: true
  },
  'unavailable': {
    code: 'NETWORK_002',
    message: '서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.',
    statusCode: 503,
    isOperational: true
  },
  'deadline-exceeded': {
    code: 'NETWORK_003',
    message: '요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.',
    statusCode: 504,
    isOperational: true
  },
  'invalid-argument': {
    code: 'VALIDATION_001',
    message: '잘못된 요청입니다.',
    statusCode: 400,
    isOperational: true
  },
  'failed-precondition': {
    code: 'VALIDATION_002',
    message: '요청을 수행할 수 없는 상태입니다.',
    statusCode: 400,
    isOperational: true
  },
  'out-of-range': {
    code: 'VALIDATION_003',
    message: '잘못된 범위의 값입니다.',
    statusCode: 400,
    isOperational: true
  },
  'unimplemented': {
    code: 'SYSTEM_001',
    message: '구현되지 않은 기능입니다.',
    statusCode: 501,
    isOperational: true
  },
  'internal': {
    code: 'SYSTEM_002',
    message: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    statusCode: 500,
    isOperational: false
  },
  'unknown': {
    code: 'SYSTEM_003',
    message: '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    statusCode: 500,
    isOperational: false
  },
  'resource-exhausted': {
    code: 'QUOTA_001',
    message: '사용 가능한 리소스를 초과했습니다.',
    statusCode: 429,
    isOperational: true
  },
  'cancelled': {
    code: 'USER_001',
    message: '작업이 취소되었습니다.',
    statusCode: 499,
    isOperational: true
  },
  'data-loss': {
    code: 'SYSTEM_004',
    message: '데이터 손실이 발생했습니다. 관리자에게 문의해주세요.',
    statusCode: 500,
    isOperational: false
  }
};

export function parseFirebaseError(error: unknown): AppError {
  if (error instanceof CustomError) {
    return error;
  }

  if (error instanceof Error) {
    const firebaseCode = error instanceof Error && 'code' in error ? (error as { code: string }).code : undefined;

    if (firebaseCode && FIREBASE_ERROR_CODES[firebaseCode]) {
      return FIREBASE_ERROR_CODES[firebaseCode];
    }

    return {
      code: 'UNKNOWN',
      message: error.message || '알 수 없는 오류가 발생했습니다.',
      statusCode: 500,
      isOperational: false
    };
  }

  return {
    code: 'UNKNOWN',
    message: '알 수 없는 오류가 발생했습니다.',
    statusCode: 500,
    isOperational: false
  };
}

export function logError(error: unknown, context?: string): void {
  const parsedError = parseFirebaseError(error);

  console.group(`🚨 Error ${context ? `in ${context}` : ''}`);
  console.error(`Code: ${parsedError.code}`);
  console.error(`Message: ${parsedError.message}`);
  console.error(`Status: ${parsedError.statusCode}`);
  console.error(`Operational: ${parsedError.isOperational}`);

  if (error instanceof Error && error.stack) {
    console.error(`Stack:`, error.stack);
  }

  console.groupEnd();
}

const DEFAULT_ERROR_MESSAGE = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

export function getSafeErrorMessage(error: unknown): string {
  try {
    const parsedError = parseFirebaseError(error);
    return parsedError.message;
  } catch {
    return DEFAULT_ERROR_MESSAGE;
  }
}
