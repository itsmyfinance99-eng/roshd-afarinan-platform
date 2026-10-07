import { DEFAULT_ROLE_PERMISSIONS, ROLES, type Permission } from '@roshd/types';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_NAV, visibleNav } from '@/components/dashboard/nav';
import { DASHBOARD_HELP_FA, ROLE_HELP_FA, visibleSteps } from './dashboard-help';

describe('guide of the dashboard', () => {
  it('describes every item of the menu and nothing else', () => {
    expect(Object.keys(DASHBOARD_HELP_FA).sort()).toEqual(
      DASHBOARD_NAV.map((item) => item.href).sort(),
    );
    for (const section of Object.values(DASHBOARD_HELP_FA)) {
      expect(section.summary.trim()).not.toBe('');
      expect(section.steps.length).toBeGreaterThan(0);
    }
  });

  it('leaves no part without a step for anybody who sees it', () => {
    for (const role of ROLES) {
      const permissions = DEFAULT_ROLE_PERMISSIONS[role];
      for (const item of visibleNav(permissions)) {
        const section = DASHBOARD_HELP_FA[item.href];
        expect(section && visibleSteps(section, permissions).length, item.href).toBeGreaterThan(0);
      }
    }
  });

  it('names a step that needs a permission only to its holders', () => {
    const section = DASHBOARD_HELP_FA['/dashboard/manage/requests'];
    if (!section) throw new Error('missing section');
    const convert = (permissions: readonly Permission[]) =>
      visibleSteps(section, permissions).some((step) => step.includes('تبدیل'));
    expect(convert(DEFAULT_ROLE_PERMISSIONS.support)).toBe(false);
    expect(convert(DEFAULT_ROLE_PERMISSIONS.expert)).toBe(false);
    expect(convert(DEFAULT_ROLE_PERMISSIONS.admin)).toBe(true);
    expect(visibleSteps(section, DEFAULT_ROLE_PERMISSIONS.expert)).toHaveLength(1);
  });

  it('describes every role that has permissions of its own', () => {
    for (const role of ROLES) {
      if (DEFAULT_ROLE_PERMISSIONS[role].length > 0) expect(ROLE_HELP_FA[role]).toBeTruthy();
    }
  });

  it('shows a member the common parts only, and the guide to everybody', () => {
    const member = visibleNav([]).map((item) => item.href);
    expect(member).toContain('/dashboard/help');
    expect(member.some((href) => href.startsWith('/dashboard/manage'))).toBe(false);
    expect(member).not.toContain('/dashboard/models');
    expect(visibleNav(DEFAULT_ROLE_PERMISSIONS.admin)).toHaveLength(DASHBOARD_NAV.length);
  });
});
