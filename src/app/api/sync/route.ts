import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin 초기화 (서버사이드)
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const adminDb = getFirestore();

// RSS 파싱 함수
async function parseRSS(url: string) {
  const response = await fetch(url);
  const xml = await response.text();

  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
    category: string;
  }> = [];

  // 간단한 XML 파싱 (item 태그 추출)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const getTagContent = (tag: string) => {
      const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
      const m = itemXml.match(regex);
      return m ? (m[1] || m[2] || '').trim() : '';
    };

    items.push({
      title: getTagContent('title'),
      link: getTagContent('link'),
      pubDate: getTagContent('pubDate'),
      description: getTagContent('description'),
      category: getTagContent('category') || '미분류',
    });
  }

  return items;
}

// 링크에서 post_id 추출
function extractPostId(link: string): string {
  // https://irepublic.tistory.com/1234 -> 1234
  const match = link.match(/\/(\d+)$/);
  return match ? match[1] : link;
}

export async function GET(request: NextRequest) {
  // Cron 인증 확인
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 티스토리 RSS 가져오기
    const rssUrl = 'https://irepublic.tistory.com/rss';
    const posts = await parseRSS(rssUrl);

    let newCount = 0;
    let updatedCount = 0;

    for (const post of posts) {
      const postId = extractPostId(post.link);
      const docRef = adminDb.collection('posts').doc(postId);
      const docSnap = await docRef.get();

      // 날짜 변환
      const pubDate = new Date(post.pubDate).toISOString().slice(0, 19).replace('T', ' ');

      const postData = {
        post_id: postId,
        title: post.title,
        category: post.category,
        pub_date: pubDate,
        content: post.description,
        char_count: post.description.length,
        updated_at: new Date(),
      };

      if (!docSnap.exists) {
        // 새 글 추가
        await docRef.set({
          ...postData,
          id: parseInt(postId) || Date.now(),
          created_at: new Date(),
        });
        newCount++;
      } else {
        // 기존 글 업데이트 (제목이나 내용이 변경된 경우)
        const existing = docSnap.data();
        if (existing?.title !== post.title || existing?.content !== post.description) {
          await docRef.update(postData);
          updatedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `동기화 완료: ${newCount}개 추가, ${updatedCount}개 업데이트`,
      totalChecked: posts.length,
      newCount,
      updatedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}
