export type Language = 'ko' | 'en';

export interface Translations {
  common: {
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    confirm: string;
    back: string;
    next: string;
    done: string;
    close: string;
  };
  nav: {
    home: string;
    conferences: string;
    myLibrary: string;
    myPage: string;
    admin: string;
    settings: string;
    login: string;
    logout: string;
    signup: string;
  };
  conference: {
    title: string;
    allConferences: string;
    ongoing: string;
    upcoming: string;
    past: string;
    venue: string;
    date: string;
    organizer: string;
    publications: string;
    noConferences: string;
    publicationCount: string;
    searchPlaceholder: string;
  };
  viewer: {
    settings: string;
    tableOfContents: string;
    darkMode: string;
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
    fontFamily: string;
    resetSettings: string;
    narrow: string;
    wide: string;
    px: string;
  };
  branding: {
    title: string;
    logoImage: string;
    logoUpload: string;
    selectLogo: string;
    pointColor: string;
    selectedColor: string;
    preview: string;
    primaryButton: string;
    badge: string;
    lightBadge: string;
    conferenceName: string;
    saveBranding: string;
    saving: string;
    logoUploadLimit: string;
  };
  auth: {
    email: string;
    password: string;
    confirmPassword: string;
    login: string;
    signup: string;
    forgotPassword: string;
    orContinueWith: string;
    noAccount: string;
    hasAccount: string;
    loginError: string;
    signupError: string;
  };
  upload: {
    title: string;
    selectFile: string;
    supportedFormats: string;
    parsing: string;
    parsingComplete: string;
    parsingError: string;
  };
  editor: {
    title: string;
    addBlock: string;
    blockType: string;
    text: string;
    heading: string;
    image: string;
    video: string;
    ad: string;
    list: string;
    footnote: string;
    properties: string;
    preview: string;
  };
}

export const translations: Record<Language, Translations> = {
  ko: {
    common: {
      loading: '로딩 중...',
      save: '저장',
      cancel: '취소',
      delete: '삭제',
      edit: '편집',
      confirm: '확인',
      back: '뒤로',
      next: '다음',
      done: '완료',
      close: '닫기',
    },
    nav: {
      home: '홈',
      conferences: '학술대회',
      myLibrary: '내 서재',
      myPage: '마이페이지',
      admin: '관리',
      settings: '설정',
      login: '로그인',
      logout: '로그아웃',
      signup: '회원가입',
    },
    conference: {
      title: '학술회의 eBook 라이브러리',
      allConferences: '모든 학술대회',
      ongoing: '진행 중인 세미나',
      upcoming: '예정된 학술대회',
      past: '지난 학술대회',
      venue: '장소',
      date: '날짜',
      organizer: '주최',
      publications: '간행물',
      noConferences: '등록된 학술대회가 없습니다',
      publicationCount: '{count}개의 간행물',
      searchPlaceholder: '학술대회, 간행물 검색...',
    },
    viewer: {
      settings: '독서 환경 설정',
      tableOfContents: '목차',
      darkMode: '다크 모드',
      fontSize: '글자 크기',
      lineHeight: '행간',
      letterSpacing: '자간',
      fontFamily: '글꼴',
      resetSettings: '기본 설정으로 초기화',
      narrow: '좁음',
      wide: '넓음',
      px: 'px',
    },
    branding: {
      title: '브랜딩 설정',
      logoImage: '로고 이미지',
      logoUpload: '로고 이미지를 업로드하세요',
      selectLogo: '로고 선택',
      pointColor: '포인트 컬러',
      selectedColor: '선택된 색상',
      preview: '미리보기',
      primaryButton: '기본 버튼 스타일',
      badge: '뱃지',
      lightBadge: '라이트 뱃지',
      conferenceName: '학술대회',
      saveBranding: '저장하기',
      saving: '저장 중...',
      logoUploadLimit: 'PNG, JPG (최대 5MB)',
    },
    auth: {
      email: '이메일',
      password: '비밀번호',
      confirmPassword: '비밀번호 확인',
      login: '로그인',
      signup: '회원가입',
      forgotPassword: '비밀번호 찾기',
      orContinueWith: '또는 다음으로 계속',
      noAccount: '계정이 없으신가요?',
      hasAccount: '이미 계정이 있으신가요?',
      loginError: '로그인에 실패했습니다.',
      signupError: '회원가입에 실패했습니다.',
    },
    upload: {
      title: '문서 업로드',
      selectFile: '파일 선택',
      supportedFormats: '지원 형식: .docx',
      parsing: '문서 분석 중...',
      parsingComplete: '분석 완료',
      parsingError: '분석 실패',
    },
    editor: {
      title: '블록 에디터',
      addBlock: '블록 추가',
      blockType: '블록 타입',
      text: '텍스트',
      heading: '제목',
      image: '이미지',
      video: '비디오',
      ad: '광고',
      list: '리스트',
      footnote: '각주',
      properties: '속성',
      preview: '미리보기',
    },
  },
  en: {
    common: {
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      done: 'Done',
      close: 'Close',
    },
    nav: {
      home: 'Home',
      conferences: 'Conferences',
      myLibrary: 'My Library',
      myPage: 'My Page',
      admin: 'Admin',
      settings: 'Settings',
      login: 'Login',
      logout: 'Logout',
      signup: 'Sign Up',
    },
    conference: {
      title: 'Academic Conference eBook Library',
      allConferences: 'All Conferences',
      ongoing: 'Ongoing Seminar',
      upcoming: 'Upcoming Conferences',
      past: 'Past Conferences',
      venue: 'Venue',
      date: 'Date',
      organizer: 'Organizer',
      publications: 'Publications',
      noConferences: 'No conferences registered',
      publicationCount: '{count} publications',
      searchPlaceholder: 'Search conferences, publications...',
    },
    viewer: {
      settings: 'Reading Settings',
      tableOfContents: 'Table of Contents',
      darkMode: 'Dark Mode',
      fontSize: 'Font Size',
      lineHeight: 'Line Height',
      letterSpacing: 'Letter Spacing',
      fontFamily: 'Font Family',
      resetSettings: 'Reset to Default',
      narrow: 'Narrow',
      wide: 'Wide',
      px: 'px',
    },
    branding: {
      title: 'Branding Settings',
      logoImage: 'Logo Image',
      logoUpload: 'Upload logo image',
      selectLogo: 'Select Logo',
      pointColor: 'Point Color',
      selectedColor: 'Selected Color',
      preview: 'Preview',
      primaryButton: 'Primary Button Style',
      badge: 'Badge',
      lightBadge: 'Light Badge',
      conferenceName: 'Conference',
      saveBranding: 'Save',
      saving: 'Saving...',
      logoUploadLimit: 'PNG, JPG (Max 5MB)',
    },
    auth: {
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      login: 'Login',
      signup: 'Sign Up',
      forgotPassword: 'Forgot Password',
      orContinueWith: 'Or continue with',
      noAccount: "Don't have an account?",
      hasAccount: 'Already have an account?',
      loginError: 'Login failed.',
      signupError: 'Sign up failed.',
    },
    upload: {
      title: 'Document Upload',
      selectFile: 'Select File',
      supportedFormats: 'Supported formats: .docx',
      parsing: 'Parsing document...',
      parsingComplete: 'Parsing complete',
      parsingError: 'Parsing failed',
    },
    editor: {
      title: 'Block Editor',
      addBlock: 'Add Block',
      blockType: 'Block Type',
      text: 'Text',
      heading: 'Heading',
      image: 'Image',
      video: 'Video',
      ad: 'Advertisement',
      list: 'List',
      footnote: 'Footnote',
      properties: 'Properties',
      preview: 'Preview',
    },
  },
};