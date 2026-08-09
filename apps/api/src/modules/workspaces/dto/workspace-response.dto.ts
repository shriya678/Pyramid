import type { Role } from '@prisma/client';

/** Public shape returned by all workspace endpoints. */
export interface WorkspaceResponse {
  id: string;
  slug: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}
