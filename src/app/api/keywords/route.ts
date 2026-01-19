import { NextResponse } from 'next/server';
import { getAllKeywords, getPostsByKeyword } from '@/lib/firebase-db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword');

  try {
    if (keyword) {
      // 특정 키워드의 글 목록
      const posts = await getPostsByKeyword(keyword);
      return NextResponse.json({ posts });
    }

    // 전체 키워드 통계
    const keywords = await getAllKeywords();
    return NextResponse.json({ keywords });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
