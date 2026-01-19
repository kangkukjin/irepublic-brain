'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface Post {
  id: number;
  post_id: string;
  title: string;
  category: string;
  pub_date: string;
  content: string;
  char_count: number;
  summary?: {
    summary: string;
    keywords: string;
  };
}

interface RelatedPost {
  post_id: string;
  title: string;
  category: string;
  pub_date: string;
  similarity?: number;
  score?: number; // 유사도 API에서 score로 오는 경우
}

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [post, setPost] = useState<Post | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [prevPost, setPrevPost] = useState<RelatedPost | null>(null);
  const [nextPost, setNextPost] = useState<RelatedPost | null>(null);

  useEffect(() => {
    // 현재 글 로드
    fetch(`/api/posts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setPost(data.post);
        setLoading(false);

        // 벡터 유사도 기반 관련 글 로드
        fetch(`/api/similar/${id}`)
          .then(r => r.json())
          .then(simData => {
            if (simData.similar?.length > 0) {
              setRelatedPosts(simData.similar.slice(0, 5));
            } else if (data.post?.category) {
              // 유사도 데이터 없으면 같은 카테고리로 폴백
              fetch(`/api/posts?category=${encodeURIComponent(data.post.category)}&limit=6`)
                .then(r => r.json())
                .then(relData => {
                  const filtered = (relData.posts || [])
                    .filter((p: RelatedPost) => p.post_id !== id)
                    .slice(0, 5);
                  setRelatedPosts(filtered);
                });
            }
          });

        // 이전/다음 글 로드 (시간순)
        if (data.post?.pub_date) {
          // 이전 글 (더 오래된 글)
          fetch(`/api/posts?before=${encodeURIComponent(data.post.pub_date)}&limit=1`)
            .then(r => r.json())
            .then(navData => {
              if (navData.posts?.[0]) setPrevPost(navData.posts[0]);
            });

          // 다음 글 (더 최신 글)
          fetch(`/api/posts?after=${encodeURIComponent(data.post.pub_date)}&limit=1`)
            .then(r => r.json())
            .then(navData => {
              if (navData.posts?.[0]) setNextPost(navData.posts[0]);
            });
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-slate-500 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          뉴런 연결 중...
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🧠</div>
          <p className="text-slate-500 mb-4">이 뉴런은 찾을 수 없습니다</p>
          <Link href="/" className="text-indigo-600 hover:underline">
            뇌로 돌아가기 →
          </Link>
        </div>
      </div>
    );
  }

  // 키워드 파싱
  const keywords = post.summary?.keywords?.split(',').map((k) => k.trim()).filter(Boolean) || [];
  const year = post.pub_date?.slice(0, 4);

  // 카테고리 색상
  const categoryColors: Record<string, string> = {
    '주제별 글모음': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    '여행': 'bg-amber-100 text-amber-700 border-amber-200',
    '독서와 글쓰기': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    '연작 에세이들': 'bg-pink-100 text-pink-700 border-pink-200',
    'AI 학교': 'bg-violet-100 text-violet-700 border-violet-200',
    'default': 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const getCategoryStyle = (cat: string) => {
    for (const key of Object.keys(categoryColors)) {
      if (cat?.startsWith(key)) return categoryColors[key];
    }
    return categoryColors.default;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* 아티클 헤더 이미지 */}
      <div className="relative h-48 md:h-64 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/article-header.png)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-slate-900/30 to-slate-50" />

        {/* 상단 네비게이션 */}
        <div className="absolute top-0 left-0 right-0 z-20">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-white/90 hover:text-white transition-colors drop-shadow"
            >
              <span className="text-lg">🧠</span>
              <span>사유의 뇌로</span>
            </Link>

            <Link
              href={`/?year=${year}`}
              className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-white/90 text-sm hover:bg-white/30 transition-colors"
            >
              {year}년의 다른 글들
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 -mt-16 relative z-10">
        <article className="bg-white rounded-2xl shadow-xl border border-slate-200/50 overflow-hidden">
          {/* 메타 정보 */}
          <header className="px-6 md:px-12 lg:px-16 pt-10 pb-8 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-3 text-sm mb-6">
              <time className="font-mono text-slate-500 tracking-tight">
                {post.pub_date?.slice(0, 10)}
              </time>
              {post.category && (
                <span className={`px-3 py-1 rounded-full border text-xs font-medium ${getCategoryStyle(post.category)}`}>
                  {post.category}
                </span>
              )}
              <span className="text-slate-400">
                약 {Math.ceil((post.char_count || 0) / 500)}분 읽기
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-slate-900 leading-[1.25] tracking-tight">
              {post.title}
            </h1>
          </header>

          {/* AI 요약 (키워드 기반 연결) */}
          {post.summary && (
            <div className="mx-6 md:mx-12 lg:mx-16 mt-8 mb-10 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">✨</span>
                <h3 className="text-sm font-semibold text-indigo-700">AI가 분석한 이 글</h3>
              </div>
              <p className="text-slate-700 leading-relaxed">{post.summary.summary}</p>

              {keywords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {keywords.map((kw) => (
                    <Link
                      key={kw}
                      href={`/?q=${encodeURIComponent(kw)}`}
                      className="text-xs px-3 py-1.5 bg-white rounded-full text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-colors"
                    >
                      #{kw}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 본문 */}
          <div className="article-content px-6 md:px-12 lg:px-16 pb-12">
            {(() => {
              // 줄바꿈이 거의 없는 긴 글인지 확인
              const lines = post.content.split('\n').filter(l => l.trim());
              const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / Math.max(lines.length, 1);
              const needsAutoBreak = lines.length < 5 && avgLineLength > 500;

              // 긴 글이면 마침표 기준으로 단락 분리
              let paragraphs: string[];
              if (needsAutoBreak) {
                paragraphs = post.content
                  .split(/(?<=[.!?。])\s+/)
                  .reduce((acc: string[], sentence, idx) => {
                    // 3-4문장마다 단락 구분
                    if (idx % 3 === 0) {
                      acc.push(sentence);
                    } else {
                      acc[acc.length - 1] += ' ' + sentence;
                    }
                    return acc;
                  }, [])
                  .filter(p => p.trim());
              } else {
                paragraphs = post.content.split('\n');
              }

              return paragraphs.map((paragraph, i) => {
                const trimmed = paragraph.trim();

                // 빈 줄은 여백으로
                if (!trimmed) {
                  return <div key={i} className="h-6" />;
                }

                // 짧은 문장이고 문장 부호로 끝나지 않으면 소제목으로 처리
                const isHeading = trimmed.length < 50 &&
                  !trimmed.endsWith('.') &&
                  !trimmed.endsWith(',') &&
                  !trimmed.endsWith('다') &&
                  !trimmed.endsWith('요') &&
                  !trimmed.endsWith('까') &&
                  !trimmed.endsWith(')') &&
                  !trimmed.endsWith('!') &&
                  !trimmed.endsWith('?');

                if (isHeading) {
                  return (
                    <h3
                      key={i}
                      className="text-xl md:text-2xl font-semibold text-slate-800 mt-12 mb-6 leading-snug"
                    >
                      {trimmed}
                    </h3>
                  );
                }

                return (
                  <p
                    key={i}
                    className="text-lg md:text-xl text-slate-700 leading-[2] mb-8 tracking-[-0.01em]"
                    style={{ wordBreak: 'keep-all' }}
                  >
                    {paragraph}
                  </p>
                );
              });
            })()}
          </div>

          {/* 원본 링크 */}
          <div className="mx-6 md:mx-12 lg:mx-16 mb-8 pt-8 border-t border-slate-200">
            <a
              href={`https://irepublic.tistory.com/${post.post_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <span>📝</span>
              티스토리에서 원본 보기
              <span>→</span>
            </a>
          </div>
        </article>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6">

        {/* 관련 글 (같은 카테고리) */}
        {relatedPosts.length > 0 && (
          <section className="mt-16 pt-8 border-t border-slate-200">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-6">
              <span>🔗</span>
              연결된 사유들
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {relatedPosts.map((p) => (
                <Link
                  key={p.post_id}
                  href={`/post/${p.post_id}`}
                  className="block p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all group"
                >
                  <h3 className="font-medium text-slate-700 group-hover:text-indigo-600 line-clamp-2 transition-colors">
                    {p.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono">{p.pub_date?.slice(0, 10)}</span>
                    {(p.similarity || p.score) && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">
                        {Math.round((p.similarity || p.score || 0) * 100)}% 유사
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 이전/다음 글 네비게이션 */}
        <nav className="mt-12 pt-8 border-t border-slate-200">
          <div className="grid md:grid-cols-2 gap-4">
            {prevPost ? (
              <Link
                href={`/post/${prevPost.post_id}`}
                className="group p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all"
              >
                <div className="text-xs text-slate-400 mb-1">← 이전 글</div>
                <div className="font-medium text-slate-700 group-hover:text-indigo-600 line-clamp-1 transition-colors">
                  {prevPost.title}
                </div>
              </Link>
            ) : (
              <div />
            )}
            {nextPost ? (
              <Link
                href={`/post/${nextPost.post_id}`}
                className="group p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all text-right"
              >
                <div className="text-xs text-slate-400 mb-1">다음 글 →</div>
                <div className="font-medium text-slate-700 group-hover:text-indigo-600 line-clamp-1 transition-colors">
                  {nextPost.title}
                </div>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </nav>
      </div>

      {/* 푸터 */}
      <footer className="mt-16 py-8 border-t border-slate-200 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
        >
          <span>🧠</span>
          뇌 탐험으로 돌아가기
        </Link>
      </footer>
    </div>
  );
}
