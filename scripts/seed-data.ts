import admin from 'firebase-admin';
import { BilingualValue } from '../src/types/content';

// Firebase Admin 초기화 (Emulator용)
admin.initializeApp({
  projectId: 'demo-no-project',
});

// Firestore Emulator 연결
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const db = admin.firestore();

// 샘플 데이터 생성
const seedData = async () => {
  console.log('🌱 Seeding Firestore data...');

  try {
    // 1. 사용자 데이터
    const users = [
      {
        id: 'admin-user',
        email: 'admin@example.com',
        role: 'admin',
        name: 'Admin User',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'editor-user',
        email: 'editor@example.com',
        role: 'editor',
        name: 'Editor User',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'presenter-user',
        email: 'presenter@example.com',
        role: 'presenter',
        name: 'Presenter User',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    console.log('📝 Creating users...');
    for (const user of users) {
      await db.collection('users').doc(user.id).set(user);
    }

    // 2. 학술대회 데이터
    const conferences = [
      {
        id: 'conf-2024-dental',
        name: { ko: '2024년 대한치과학회 춘계학술대회', en: '2024 Korean Academy of Dental Science Spring Conference' },
        description: {
          ko: '대한치과학회 주최 2024년 춘계학술대회입니다. 최신 치의학 기술과 연구 발표가 진행됩니다.',
          en: '2024 Spring Conference hosted by Korean Academy of Dental Science. Latest dental technology and research presentations.'
        },
        startDate: '2024-04-15',
        endDate: '2024-04-17',
        venue: { ko: 'COEX 그랜드볼룸', en: 'COEX Grand Ballroom' },
        organizer: '대한치과학회',
        status: 'published',
        branding: {
          logoUrl: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=dental%20conference%20logo%20professional%20blue&image_size=square',
          eventName: { ko: '2024년 춘계학술대회', en: '2024 Spring Conference' },
          primaryColor: '#3b82f6',
          secondaryColor: '#8b5cf6',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'conf-2024-medical',
        name: { ko: '2024년 대한의사협회 학술대회', en: '2024 Korean Medical Association Conference' },
        description: {
          ko: '대한의사협회 주최 연례 학술대회입니다. 의학의 최신 동향과 연구 결과를 공유합니다.',
          en: 'Annual conference hosted by Korean Medical Association. Sharing latest medical trends and research results.'
        },
        startDate: '2024-06-20',
        endDate: '2024-06-22',
        venue: { ko: 'SETEC', en: 'SETEC Convention Center' },
        organizer: '대한의사협회',
        status: 'published',
        branding: {
          logoUrl: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=medical%20conference%20logo%20professional%20green&image_size=square',
          eventName: { ko: '2024년 학술대회', en: '2024 Conference' },
          primaryColor: '#10b981',
          secondaryColor: '#14b8a6',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    console.log('🎓 Creating conferences...');
    for (const conference of conferences) {
      await db.collection('conferences').doc(conference.id).set(conference);
    }

    // 3. 간행물 데이터
    const publications = [
      {
        id: 'pub-2024-dental-abstract',
        conferenceId: 'conf-2024-dental',
        type: 'abstract',
        title: { ko: '2024년 춘계학술대회 초록집', en: '2024 Spring Conference Abstracts' },
        coverImage: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=dental%20abstract%20book%20cover%20professional&image_size=portrait_4_3',
        status: 'published',
        order: 1,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    console.log('📚 Creating publications...');
    for (const publication of publications) {
      await db.collection('conferences').doc(publication.conferenceId)
        .collection('publications').doc(publication.id).set(publication);
    }

    // 4. 논문 데이터
    const articles = [
      {
        id: 'art-dental-001',
        publicationId: 'pub-2024-dental-abstract',
        title: { ko: '임플란트 주위염의 새로운 치료법 연구', en: 'Study on New Treatment for Peri-implantitis' },
        author: '김치과, 이치과',
        toc: [
          { id: 'toc-1', title: { ko: '서론', en: 'Introduction' }, level: 1, blockId: 'block-001' },
          { id: 'toc-2', title: { ko: '연구 방법', en: 'Methods' }, level: 1, blockId: 'block-002' },
        ],
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    console.log('📄 Creating articles...');
    for (const article of articles) {
      await db.collection('conferences').doc('conf-2024-dental')
        .collection('publications').doc(article.publicationId)
        .collection('articles').doc(article.id).set(article);
    }

    // 5. 콘텐츠 블록 데이터
    const contentBlocks = [
      {
        id: 'block-001',
        articleId: 'art-dental-001',
        type: 'heading',
        content: { text: { ko: '서론', en: 'Introduction' }, level: 1 },
        order: 1,
        createdAt: new Date(),
      },
      {
        id: 'block-002',
        articleId: 'art-dental-001',
        type: 'text',
        content: {
          html: {
            ko: '<p>임플란트 주위염은 임플란트 식립 후 발생하는 염증성 질환입니다.</p>',
            en: '<p>Peri-implantitis is an inflammatory disease that occurs after implant placement.</p>'
          }
        },
        order: 2,
        createdAt: new Date(),
      },
    ];

    console.log('📦 Creating content blocks...');
    for (const block of contentBlocks) {
      await db.collection('conferences').doc('conf-2024-dental')
        .collection('publications').doc('pub-2024-dental-abstract')
        .collection('articles').doc(block.articleId)
        .collection('contentBlocks').doc(block.id).set(block);
    }

    console.log('✅ Seeding completed successfully!');
    console.log(`📊 Created: ${users.length} users, ${conferences.length} conferences, ${publications.length} publications, ${articles.length} articles, ${contentBlocks.length} content blocks`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
};

// 실행
seedData().then(() => {
  console.log('🎉 All data seeded successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Seeding failed:', error);
  process.exit(1);
});