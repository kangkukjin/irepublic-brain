import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface PostMeta {
  id: string;
  title: string;
  category: string;
  pub_date: string;
}

interface SimilarityEntry {
  id: string;
  similar: { id: string; score: number }[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataDir = path.join(process.cwd(), 'public/data');

    // 유사도 매트릭스 로드
    const simPath = path.join(dataDir, 'similarity-matrix.json');
    const simData = await fs.readFile(simPath, 'utf-8');
    const similarities: SimilarityEntry[] = JSON.parse(simData);

    // 해당 글의 유사 글 찾기
    const entry = similarities.find(s => s.id === id);
    if (!entry) {
      return NextResponse.json({ similar: [] });
    }

    // 메타데이터 로드
    const metaPath = path.join(dataDir, 'posts-meta.json');
    const metaData = await fs.readFile(metaPath, 'utf-8');
    const posts: PostMeta[] = JSON.parse(metaData);

    // 메타데이터 맵 생성
    const postMap = new Map<string, PostMeta>();
    for (const post of posts) {
      postMap.set(post.id, post);
    }

    // 유사 글 정보 조합
    const similarPosts = entry.similar
      .filter(s => s.score >= 0.4) // 유사도 0.4 이상
      .slice(0, 10)
      .map(s => {
        const meta = postMap.get(s.id);
        return {
          post_id: s.id,
          title: meta?.title || '제목 없음',
          category: meta?.category || '미분류',
          pub_date: meta?.pub_date || '',
          similarity: s.score,
        };
      });

    return NextResponse.json({ similar: similarPosts });
  } catch (error) {
    console.error('Similar API Error:', error);
    return NextResponse.json({ similar: [], error: 'Failed to load similar posts' });
  }
}
