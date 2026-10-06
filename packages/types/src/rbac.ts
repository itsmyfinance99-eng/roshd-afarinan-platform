/** Platform roles (roadmap §6). One identity may hold several roles. */
export const ROLES = [
  'guest',
  'user',
  'student',
  'applicant',
  'investor',
  'expert',
  'feasibility_officer',
  'instructor',
  'editor',
  'support',
  'finance',
  'admin',
  'super_admin',
] as const;

export type Role = (typeof ROLES)[number];

/** Persian display names for roles. */
export const ROLE_LABELS_FA: Record<Role, string> = {
  guest: 'مهمان',
  user: 'کاربر',
  student: 'دانشجو',
  applicant: 'متقاضی',
  investor: 'سرمایه‌گذار',
  expert: 'کارشناس',
  feasibility_officer: 'مسئول امکان‌سنجی',
  instructor: 'مدرس',
  editor: 'ویراستار',
  support: 'پشتیبانی',
  finance: 'مالی',
  admin: 'مدیر',
  super_admin: 'مدیر ارشد',
};

/** Permission strings use the `resource:action` convention. */
export const PERMISSIONS = [
  'users:read',
  'users:manage-roles',
  'audit:read',
  'cms:write',
  'cms:publish',
  'requests:read-all',
  'requests:manage',
  'tickets:read-all',
  'tickets:reply',
  'files:read-all',
  'orders:read-all',
  'catalog:manage',
  /** Full access to every financial model: read, edit, calculate, assign the expert, approve. */
  'financial-models:manage',
  /** May be assigned to a financial model as its expert: edit it, run and approve calculations. */
  'financial-models:work',
  /** Staff of the feasibility platform: every project, its transitions and its experts (ADR-0010). */
  'feasibility:manage',
  /** May be assigned to a feasibility project as one of its experts. */
  'feasibility:work',
  /** First approval of a feasibility report (the feasibility officer, OQ-37). */
  'feasibility:approve-report',
  /** Final approval of a feasibility report, after the first one (admins only, OQ-37). */
  'feasibility:final-approve',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Default role → permission grants. Seeded into the database; the DB is authoritative. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  guest: [],
  user: [],
  student: [],
  applicant: [],
  investor: [],
  expert: ['requests:read-all', 'financial-models:work', 'feasibility:work'],
  feasibility_officer: ['feasibility:manage', 'feasibility:approve-report'],
  instructor: [],
  editor: ['cms:write', 'cms:publish', 'catalog:manage'],
  support: ['requests:read-all', 'requests:manage', 'tickets:read-all', 'tickets:reply'],
  finance: ['orders:read-all'],
  admin: [...PERMISSIONS],
  super_admin: [...PERMISSIONS],
};

/** Roles that only a super_admin may grant. */
export const PRIVILEGED_ROLES: readonly Role[] = ['admin', 'super_admin'];
