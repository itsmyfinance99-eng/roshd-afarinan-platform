import 'server-only';
import { site } from '@/content/site';
import { siteUrl } from '@/lib/env';
import { getCourse, type CourseDetail } from '@/lib/learning-api';
import { requireFound } from '@/lib/server-api';

const COURSE_MODE: Record<CourseDetail['deliveryMode'], string> = {
  ONLINE: 'online',
  IN_PERSON: 'onsite',
  HYBRID: 'blended',
};

/** Loads a published course for a page (real 404 for missing, unpublished or malformed slugs). */
export function loadCourse(slug: string): Promise<CourseDetail> {
  return requireFound(getCourse(slug));
}

/** schema.org Course (Google course info); `offers` only when the price is actually known. */
export function courseJsonLd(course: CourseDetail) {
  const url = `${siteUrl}/training/${course.slug}`;
  const price = course.isFree ? '0' : course.priceRials;
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.metaDescription ?? course.summary,
    url,
    inLanguage: 'fa-IR',
    isAccessibleForFree: course.isFree,
    educationalLevel: course.level.toLowerCase(),
    provider: { '@type': 'Organization', name: site.name, sameAs: siteUrl },
    ...(price !== null
      ? {
          offers: {
            '@type': 'Offer',
            category: course.isFree ? 'Free' : 'Paid',
            price,
            priceCurrency: 'IRR',
            url,
          },
        }
      : {}),
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: COURSE_MODE[course.deliveryMode],
      ...(course.durationHours ? { courseWorkload: `PT${course.durationHours}H` } : {}),
      ...(course.startsAt ? { startDate: course.startsAt } : {}),
      ...(course.instructor
        ? { instructor: { '@type': 'Person', name: course.instructor.name } }
        : {}),
    },
  };
}
