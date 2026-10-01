import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Account collaborators ("espaces de travail").
 *
 * A collaborator signs in with their own account and picks an organizer's workspace;
 * the web client then sends the owner's id in the X-Workspace header. For non-personal
 * routes the request runs *as the owner* (so every existing `organizerId === user.id`
 * check keeps working) and JwtAuthGuard restricts it to the collaborator's permission.
 */
export const WORKSPACE_HEADER = 'x-workspace';

export const WORKSPACE_PERMISSIONS = ['ADMIN', 'MANAGER', 'TICKETING', 'VIEWER'] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

const RANK: Record<WorkspacePermission, number> = { VIEWER: 0, TICKETING: 1, MANAGER: 2, ADMIN: 3 };

export const hasPermission = (granted: WorkspacePermission, needed: WorkspacePermission) =>
  RANK[granted] >= RANK[needed];

/** Request path without the global /api/v1 prefix and query string. */
export function routePath(req: Request): string {
  const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
  return path.replace(/^\/api\/v\d+/, '') || '/';
}

// Routes about the signed-in person themselves: never run inside a workspace
const PERSONAL_PREFIXES = ['/auth', '/notifications', '/workspaces', '/users/me', '/controller-space'];

export const isPersonalRoute = (path: string) =>
  PERSONAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

// Ticketing operations allowed to the TICKETING level
const TICKETING_PATTERNS = [
  /^\/events\/[^/]+\/tickets(\/|$)/,
  /^\/events\/[^/]+\/invitations(\/|$)/,
  /^\/validation\//,
];

/**
 * Minimum permission a collaborator needs for a request, or null when only the account
 * owner may do it (billing, platform admin, user management).
 */
export function requiredPermission(method: string, path: string): WorkspacePermission | null {
  const isRead = method === 'GET' || method === 'HEAD';

  if (path === '/admin' || path.startsWith('/admin/')) return null;
  if (path === '/users' || path.startsWith('/users/')) return null;
  if (path.startsWith('/subscriptions')) return isRead ? 'VIEWER' : null;

  if (path.startsWith('/account/collaborators')) return 'ADMIN';
  if (path.startsWith('/account/zones')) return isRead ? 'VIEWER' : 'ADMIN';

  if (isRead) return 'VIEWER';
  if (method === 'DELETE' && /^\/events\/[^/]+$/.test(path)) return 'ADMIN';
  if (TICKETING_PATTERNS.some((re) => re.test(path))) return 'TICKETING';
  return 'MANAGER';
}

export interface WorkspaceMembership {
  ownerId: string;
  permission: WorkspacePermission;
}

/**
 * The collaborator's membership in the owner's account, or throws. Invitations made before
 * the person had an account are matched by email and linked on first use.
 */
export async function resolveMembership(
  prisma: PrismaService,
  user: { id: string; email: string },
  ownerId: string,
): Promise<WorkspaceMembership> {
  const member = await prisma.accountMember.findFirst({
    where: {
      ownerId,
      OR: [{ userId: user.id }, { userId: null, email: user.email.toLowerCase() }],
      owner: { isActive: true },
    },
    select: { id: true, userId: true, permission: true },
  });
  if (!member) throw new ForbiddenException('Accès à cet espace de travail refusé');
  if (!member.userId) {
    await prisma.accountMember.update({ where: { id: member.id }, data: { userId: user.id } });
  }
  return { ownerId, permission: member.permission as WorkspacePermission };
}
