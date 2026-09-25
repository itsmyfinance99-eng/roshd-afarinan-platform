import type { Metadata } from 'next';
import { ContentDetailPage, contentMetadata } from '@/components/content/content-pages';

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return contentMetadata('KNOWLEDGE', (await params).slug);
}

export default async function KnowledgeEntryPage({ params }: { params: Params }) {
  return <ContentDetailPage kind="KNOWLEDGE" slug={(await params).slug} />;
}
