import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  QueryConstraint,
} from 'firebase/firestore';

// 타입 정의
export interface Post {
  id: number;
  post_id: string;
  title: string;
  category: string;
  pub_date: string;
  content?: string;
  char_count: number;
}

export interface Summary {
  post_id: string;
  summary: string;
  keywords: string;
}

export interface CategoryGroup {
  category: string;
  count: number;
}

export interface YearGroup {
  year: string;
  count: number;
}

export interface MonthStat {
  yearMonth: string;
  count: number;
}

export interface CategoryHierarchy {
  main: string;
  sub: string | null;
  count: number;
}

export interface KeywordStat {
  keyword: string;
  count: number;
}

// 전체 통계
export async function getStats() {
  const postsRef = collection(db, 'posts');
  const snapshot = await getDocs(postsRef);
  return {
    totalPosts: snapshot.size,
    years: 17,
  };
}

// 카테고리 목록
export async function getCategories(): Promise<CategoryGroup[]> {
  const postsRef = collection(db, 'posts');
  const snapshot = await getDocs(postsRef);

  const categoryCount: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const post = doc.data() as Post;
    if (post.category) {
      categoryCount[post.category] = (categoryCount[post.category] || 0) + 1;
    }
  });

  return Object.entries(categoryCount)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

// 연도 목록
export async function getYears(): Promise<YearGroup[]> {
  const postsRef = collection(db, 'posts');
  const snapshot = await getDocs(postsRef);

  const yearCount: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const post = doc.data() as Post;
    if (post.pub_date) {
      const year = post.pub_date.slice(0, 4);
      yearCount[year] = (yearCount[year] || 0) + 1;
    }
  });

  return Object.entries(yearCount)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

// 최근 글 목록
export async function getRecentPosts(limitCount: number = 20): Promise<Post[]> {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    orderBy('pub_date', 'desc'),
    firestoreLimit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as Post);
}

// 카테고리별 글 목록
export async function getPostsByCategory(category: string, limitCount: number = 50): Promise<Post[]> {
  const postsRef = collection(db, 'posts');

  // 메인 카테고리 또는 서브카테고리 매칭
  const q = query(
    postsRef,
    where('category', '>=', category),
    where('category', '<=', category + '\uf8ff'),
    orderBy('category'),
    orderBy('pub_date', 'desc'),
    firestoreLimit(limitCount)
  );

  const snapshot = await getDocs(q);
  const posts = snapshot.docs.map(doc => doc.data() as Post);

  // 정확한 카테고리 매칭 필터링
  return posts.filter(p =>
    p.category === category || p.category.startsWith(category + '/')
  );
}

// 연도별 글 목록
export async function getPostsByYear(year: string, limitCount: number = 100): Promise<Post[]> {
  const postsRef = collection(db, 'posts');
  const startDate = `${year}-01-01`;
  const endDate = `${parseInt(year) + 1}-01-01`;

  const q = query(
    postsRef,
    where('pub_date', '>=', startDate),
    where('pub_date', '<', endDate),
    orderBy('pub_date', 'desc'),
    firestoreLimit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as Post);
}

// 단일 글 조회 (본문 포함)
export async function getPost(postId: string): Promise<(Post & { summary?: Summary }) | null> {
  const postRef = doc(db, 'posts', postId);
  const postSnap = await getDoc(postRef);

  if (!postSnap.exists()) return null;

  const post = postSnap.data() as Post;

  // 요약 가져오기
  const summaryRef = doc(db, 'summaries', postId);
  const summarySnap = await getDoc(summaryRef);
  const summary = summarySnap.exists() ? summarySnap.data() as Summary : undefined;

  return { ...post, summary };
}

// 검색
export async function searchPosts(searchQuery: string, limitCount: number = 30): Promise<Post[]> {
  // Firestore는 full-text search를 지원하지 않으므로 제목 prefix 검색만 가능
  // 더 나은 검색을 위해서는 Algolia 등을 사용해야 함
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    orderBy('pub_date', 'desc'),
    firestoreLimit(500) // 클라이언트에서 필터링
  );

  const snapshot = await getDocs(q);
  const posts = snapshot.docs.map(doc => doc.data() as Post);

  const searchLower = searchQuery.toLowerCase();
  return posts
    .filter(p => p.title.toLowerCase().includes(searchLower))
    .slice(0, limitCount);
}

// 월별 글 개수 (타임라인용)
export async function getMonthlyStats(): Promise<MonthStat[]> {
  const postsRef = collection(db, 'posts');
  const q = query(postsRef, orderBy('pub_date', 'asc'));
  const snapshot = await getDocs(q);

  const monthCounts: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const post = doc.data() as Post;
    if (post.pub_date) {
      const yearMonth = post.pub_date.slice(0, 7); // "YYYY-MM"
      monthCounts[yearMonth] = (monthCounts[yearMonth] || 0) + 1;
    }
  });

  return Object.entries(monthCounts)
    .map(([yearMonth, count]) => ({ yearMonth, count }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

// 특정 기간의 글 가져오기
export async function getPostsByDateRange(startDate: string, endDate: string): Promise<Post[]> {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    where('pub_date', '>=', startDate),
    where('pub_date', '<', endDate),
    orderBy('pub_date', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as Post);
}

// 카테고리 계층 구조 (지도용)
export async function getCategoryHierarchy(): Promise<CategoryHierarchy[]> {
  const postsRef = collection(db, 'posts');
  const snapshot = await getDocs(postsRef);

  const hierarchy: Record<string, Record<string, number>> = {};

  snapshot.docs.forEach(doc => {
    const post = doc.data() as Post;
    if (!post.category) return;

    let main: string;
    let sub: string | null;

    if (post.category.includes('/')) {
      const parts = post.category.split('/');
      main = parts[0];
      sub = parts[1];
    } else {
      main = post.category;
      sub = null;
    }

    if (!hierarchy[main]) {
      hierarchy[main] = {};
    }
    const subKey = sub || '__null__';
    hierarchy[main][subKey] = (hierarchy[main][subKey] || 0) + 1;
  });

  const result: CategoryHierarchy[] = [];
  Object.entries(hierarchy).forEach(([main, subs]) => {
    Object.entries(subs).forEach(([sub, count]) => {
      result.push({
        main,
        sub: sub === '__null__' ? null : sub,
        count
      });
    });
  });

  return result.sort((a, b) => b.count - a.count);
}

// 모든 키워드 통계
export async function getAllKeywords(): Promise<KeywordStat[]> {
  const summariesRef = collection(db, 'summaries');
  const snapshot = await getDocs(summariesRef);

  const keywordCount: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const summary = doc.data() as Summary;
    if (summary.keywords) {
      const keywords = summary.keywords.split(',').map(k => k.trim()).filter(k => k);
      keywords.forEach(kw => {
        keywordCount[kw] = (keywordCount[kw] || 0) + 1;
      });
    }
  });

  return Object.entries(keywordCount)
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count);
}

// 특정 키워드를 가진 글 찾기
export async function getPostsByKeyword(keyword: string, limitCount: number = 100): Promise<Post[]> {
  // 먼저 해당 키워드를 가진 summary들 찾기
  const summariesRef = collection(db, 'summaries');
  const snapshot = await getDocs(summariesRef);

  const matchingPostIds: string[] = [];
  snapshot.docs.forEach(doc => {
    const summary = doc.data() as Summary;
    if (summary.keywords && summary.keywords.includes(keyword)) {
      matchingPostIds.push(summary.post_id);
    }
  });

  // 해당 post들 가져오기
  const posts: Post[] = [];
  for (const postId of matchingPostIds.slice(0, limitCount)) {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      posts.push(postSnap.data() as Post);
    }
  }

  return posts.sort((a, b) => b.pub_date.localeCompare(a.pub_date));
}

// 유사한 글 찾기
export async function getSimilarPosts(postId: string, limitCount: number = 5): Promise<Post[]> {
  const post = await getPost(postId);
  if (!post) return [];

  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    where('category', '==', post.category),
    firestoreLimit(limitCount + 1)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => doc.data() as Post)
    .filter(p => p.post_id !== postId)
    .slice(0, limitCount);
}
