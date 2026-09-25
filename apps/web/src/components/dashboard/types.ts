import type { Permission, Role } from '@roshd/types';
import type { ServiceRequestStatus, ServiceRequestType } from '@roshd/validation';

/** Mirrors GET /api/v1/auth/me. */
export interface Me {
  id: string;
  email: string;
  mobile: string | null;
  fullName: string;
  roles: Role[];
  permissions: Permission[];
  createdAt: string;
}

/** Mirrors the service request views of the API. */
export interface ServiceRequestItem {
  id: string;
  trackingCode: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  fullName: string;
  mobile: string;
  email: string | null;
  subject: string | null;
  message: string;
  details: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestDetail extends ServiceRequestItem {
  attachments: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
  }[];
  events: {
    fromStatus: ServiceRequestStatus | null;
    toStatus: ServiceRequestStatus;
    note: string | null;
    createdAt: string;
  }[];
}
