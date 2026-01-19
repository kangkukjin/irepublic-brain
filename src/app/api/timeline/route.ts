import { NextResponse } from 'next/server';
import { getMonthlyStats, getPostsByDateRange } from '@/lib/firebase-db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  try {
    if (start && end) {
      // 특정 기간의 글 목록
      const posts = await getPostsByDateRange(start, end);
      return NextResponse.json({ posts });
    }

    // 월별 통계
    const monthlyStats = await getMonthlyStats();
    return NextResponse.json({ monthlyStats });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
