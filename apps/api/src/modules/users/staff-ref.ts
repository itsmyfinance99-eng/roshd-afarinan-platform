/** A staff member as shown in staff-only views (e.g. the assignee of a request or ticket). */
export interface StaffRef {
  id: string;
  fullName: string;
}

/** Builds a StaffRef from an id and a name lookup (see UsersService.namesByIds). */
export function staffRef(id: string | null, names: Map<string, string>): StaffRef | null {
  return id ? { id, fullName: names.get(id) ?? 'کارشناس' } : null;
}

/** Sorted picker entries from a name lookup. */
export function staffRefs(names: Map<string, string>): StaffRef[] {
  return [...names]
    .map(([id, fullName]) => ({ id, fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fa'));
}
