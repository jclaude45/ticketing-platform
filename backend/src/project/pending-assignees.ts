import { PrismaService } from '../prisma/prisma.service';

/**
 * Tasks assigned to an email before that person had an account (pending invitation)
 * become real assignments once they sign in or accept the invitation.
 */
export async function claimPendingTaskAssignments(prisma: PrismaService, userId: string, email: string) {
  const pending = await prisma.taskPendingAssignee.findMany({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, taskId: true },
  });
  if (!pending.length) return 0;
  await prisma.$transaction([
    prisma.taskAssignee.createMany({
      data: pending.map((p) => ({ taskId: p.taskId, userId })),
      skipDuplicates: true,
    }),
    prisma.taskPendingAssignee.deleteMany({ where: { id: { in: pending.map((p) => p.id) } } }),
  ]);
  return pending.length;
}
