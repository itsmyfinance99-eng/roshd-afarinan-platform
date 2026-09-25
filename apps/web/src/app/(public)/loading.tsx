import { Container, Skeleton } from '@roshd/ui';

export default function Loading() {
  return (
    <Container className="py-16" aria-busy="true" aria-label="در حال بارگذاری">
      <Skeleton className="mb-6 h-12 w-2/3" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </Container>
  );
}
