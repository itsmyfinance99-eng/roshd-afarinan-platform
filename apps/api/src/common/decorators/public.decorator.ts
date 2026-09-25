import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'roshd:is-public';

/** Marks a route as reachable without authentication. Everything else is denied by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
