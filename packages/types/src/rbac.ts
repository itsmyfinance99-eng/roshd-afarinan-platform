/** Platform roles (roadmap §6). One identity may hold several roles. */
export const ROLES = [
  'guest',
  'user',
  'student',
  'applicant',
  'investor',
  'expert',
  'instructor',
  'editor',
  'support',
  'finance',
  'admin',
  'super_admin',
] as const;

export type Role = (typeof ROLES)[number];

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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Default role → permission grants. Seeded into the database; the DB is authoritative. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  guest: [],
  user: [],
  student: [],
  applicant: [],
  investor: [],
  expert: ['requests:read-all'],
  instructor: [],
  editor: ['cms:write', 'cms:publish', 'catalog:manage'],
  support: ['requests:read-all', 'requests:manage', 'tickets:read-all', 'tickets:reply'],
  finance: ['orders:read-all'],
  admin: [...PERMISSIONS],
  super_admin: [...PERMISSIONS],
};

/** Roles that only a super_admin may grant. */
export const PRIVILEGED_ROLES: readonly Role[] = ['admin', 'super_admin'];
