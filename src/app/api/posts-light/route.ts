import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

// 경량 글 목록 API - 제목, 날짜, 카테고리만 반환 (content 제외)
export async function GET(request: NextRequest) {
  try {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('pub_date', 'desc'));
    const snapshot = await getDocs(q);

    // 필요한 필드만 추출 (content 제외)
    const posts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        post_id: data.post_id,
        title: data.title,
        category: data.category,
        pub_date: data.pub_date,
        char_count: data.char_count || 0,
      };
    });

    return NextResponse.json({
      posts,
      stats: {
        totalPosts: posts.length,
        years: 17
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
