const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Database = require('better-sqlite3');
const path = require('path');

// Firebase Admin 초기화 (서비스 계정 키 사용)
const serviceAccount = require('./firebase-admin-key.json');

initializeApp({
  credential: cert(serviceAccount)
});

const firestore = getFirestore();

// SQLite DB 연결
const DB_PATH = '/Users/kangkukjin/Desktop/AI/indiebizOS/data/packages/installed/tools/blog/data/blog_insight.db';
const sqliteDb = new Database(DB_PATH, { readonly: true });

// 숨길 카테고리
const HIDDEN_CATEGORIES = ['임시보관함', '집자료들'];
const CATEGORY_REMAP = { '재검토 글들': '미분류' };

function shouldHide(category) {
  if (!category) return false;
  return HIDDEN_CATEGORIES.some(hidden => category.startsWith(hidden));
}

function remapCategory(category) {
  if (!category) return category;
  const mainCat = category.includes('/') ? category.split('/')[0] : category;
  if (CATEGORY_REMAP[mainCat]) {
    return category.replace(mainCat, CATEGORY_REMAP[mainCat]);
  }
  return category;
}

async function migrate() {
  console.log('마이그레이션 시작...\n');

  // 1. Posts 마이그레이션
  console.log('1. Posts 테이블 마이그레이션...');
  const posts = sqliteDb.prepare(`
    SELECT id, post_id, title, category, pub_date, content, char_count
    FROM posts
  `).all();

  let postCount = 0;
  let skippedCount = 0;
  const batch1 = firestore.batch();
  const batches = [batch1];
  let currentBatch = batch1;
  let batchCount = 0;

  for (const post of posts) {
    // 숨김 카테고리 필터링
    if (shouldHide(post.category)) {
      skippedCount++;
      continue;
    }

    const docRef = firestore.collection('posts').doc(post.post_id);
    currentBatch.set(docRef, {
      id: post.id,
      post_id: post.post_id,
      title: post.title,
      category: remapCategory(post.category),
      pub_date: post.pub_date,
      content: post.content,
      char_count: post.char_count,
      created_at: new Date()
    });

    postCount++;
    batchCount++;

    // Firestore batch는 500개 제한
    if (batchCount >= 400) {
      const newBatch = firestore.batch();
      batches.push(newBatch);
      currentBatch = newBatch;
      batchCount = 0;
      console.log(`  - ${postCount}개 처리중...`);
    }
  }

  console.log(`  - 총 ${postCount}개 글 준비 완료 (${skippedCount}개 스킵)`);

  // 2. Summaries 마이그레이션
  console.log('\n2. Summaries 테이블 마이그레이션...');
  const summaries = sqliteDb.prepare(`
    SELECT s.post_id, s.summary, s.keywords
    FROM summaries s
    INNER JOIN posts p ON s.post_id = p.post_id
  `).all();

  let summaryCount = 0;
  for (const summary of summaries) {
    // 해당 포스트가 숨김 카테고리인지 확인
    const post = posts.find(p => p.post_id === summary.post_id);
    if (post && shouldHide(post.category)) {
      continue;
    }

    const docRef = firestore.collection('summaries').doc(summary.post_id);
    currentBatch.set(docRef, {
      post_id: summary.post_id,
      summary: summary.summary,
      keywords: summary.keywords
    });

    summaryCount++;
    batchCount++;

    if (batchCount >= 400) {
      const newBatch = firestore.batch();
      batches.push(newBatch);
      currentBatch = newBatch;
      batchCount = 0;
    }
  }

  console.log(`  - 총 ${summaryCount}개 요약 준비 완료`);

  // 3. 배치 커밋
  console.log(`\n3. Firestore에 저장 중... (${batches.length}개 배치)`);
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`  - 배치 ${i + 1}/${batches.length} 완료`);
  }

  console.log('\n마이그레이션 완료!');
  console.log(`- Posts: ${postCount}개`);
  console.log(`- Summaries: ${summaryCount}개`);
}

migrate().catch(console.error);
