import type { Metadata } from 'next';
import { loadCourse } from '@/components/courses/course-pages';
import { RequestCard } from '@/components/content/detail-layout';
import { ServiceRequestForm } from '@/components/forms/service-request-form';
import { PageIntro } from '@/components/layout/page-shell';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourse((await params).slug);
  return {
    title: `درخواست ثبت‌نام: ${course.title}`,
    alternates: { canonical: `/training/${course.slug}/enroll` },
    robots: { index: false, follow: true },
  };
}

/** Enrollment enquiry. Phase 1 captures requests only; enrollment and payment come with the LMS. */
export default async function EnrollPage({ params }: { params: Params }) {
  const course = await loadCourse((await params).slug);
  return (
    <>
      <PageIntro
        path={`/training/${course.slug}/enroll`}
        crumb="درخواست ثبت‌نام"
        parent={{ label: course.title, href: `/training/${course.slug}` }}
        title={`درخواست ثبت‌نام در «${course.title}»`}
        lead="مشخصات تماس خود را وارد کنید؛ کارشناسان آموزش برای هماهنگی ثبت‌نام با شما تماس می‌گیرند."
      />
      <RequestCard>
        <ServiceRequestForm type="TRAINING" reference={course.slug} />
      </RequestCard>
    </>
  );
}
