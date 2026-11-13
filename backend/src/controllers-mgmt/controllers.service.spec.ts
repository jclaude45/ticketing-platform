import { NotFoundException } from '@nestjs/common';
import { ControllersService } from './controllers.service';

// An invitation link works 7 days, as the e-mail says; inviting again sends a new one
describe('ControllersService invitations', () => {
  const DAY = 24 * 60 * 60 * 1000;

  function setup(controller: any) {
    const prisma: any = {
      controller: {
        findUnique: jest.fn().mockResolvedValue(controller),
        update: jest.fn(({ data }) => Promise.resolve({ ...controller, ...data })),
        create: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      event: { count: jest.fn() },
      controllerEvent: { createMany: jest.fn() },
    };
    const subscriptions: any = { assertCanAddController: jest.fn() };
    const config: any = { get: () => undefined };
    const service = new ControllersService(prisma, {} as any, {} as any, config, subscriptions);
    (service as any).mailer = { sendMail: jest.fn().mockResolvedValue({}) };
    return { service, prisma, subscriptions };
  }

  const pending = (age: number) => ({
    id: 'c1', name: 'Paul', email: 'paul@b.cd', isActive: false, invitationToken: 'tok', organizerId: 'org',
    invitedAt: new Date(Date.now() - age), organizer: { firstName: 'A', lastName: 'B' },
  });

  it('opens a link sent 6 days ago', async () => {
    const { service } = setup(pending(6 * DAY));
    await expect(service.getInvitation('tok')).resolves.toHaveProperty('email', 'paul@b.cd');
  });

  it('refuses a link older than 7 days, to read or to accept', async () => {
    const { service, prisma } = setup(pending(8 * DAY));
    await expect(service.getInvitation('tok')).rejects.toThrow(NotFoundException);
    await expect(service.acceptInvitation('tok', { password: 'Passw0rd!x' } as any)).rejects.toThrow(NotFoundException);
    expect(prisma.controller.update).not.toHaveBeenCalled();
  });

  it('sends a new link when the organizer invites a pending controller again', async () => {
    const { service, prisma, subscriptions } = setup(pending(8 * DAY));
    const res = await service.invite('org', { email: 'paul@b.cd', name: 'Paul' } as any);
    expect(res.message).toBe('Invitation sent');
    const data = prisma.controller.update.mock.calls[0][0].data;
    expect(data.invitationToken).not.toBe('tok');
    expect(Date.now() - data.invitedAt.getTime()).toBeLessThan(1000);
    expect(subscriptions.assertCanAddController).not.toHaveBeenCalled(); // already on the plan
  });
});
