import { NextResponse } from 'next/server';
import { getCategoryHierarchy, getPostsByCategory } from '@/lib/firebase-db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  try {
    if (category) {
      // 특정 카테고리의 글 목록
      const posts = await getPostsByCategory(category, 200);
      return NextResponse.json({ posts });
    }

    // 카테고리 계층 구조
    const hierarchy = await getCategoryHierarchy();

    // 메인 카테고리별로 그룹화
    const grouped: Record<string, { total: number; subs: { name: string | null; count: number }[] }> = {};

    hierarchy.forEach(item => {
      if (!grouped[item.main]) {
        grouped[item.main] = { total: 0, subs: [] };
      }
      grouped[item.main].total += item.count;
      grouped[item.main].subs.push({ name: item.sub, count: item.count });
    });

    // 정렬된 배열로 변환
    const categories = Object.entries(grouped)
      .map(([main, data]) => ({
        main,
        total: data.total,
        subs: data.subs.sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
