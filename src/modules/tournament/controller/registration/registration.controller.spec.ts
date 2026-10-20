import { Test, TestingModule } from '@nestjs/testing';
import { AdminRegistrationController } from './registration.controller';
import { TournamentService } from '../../service/tournament.service';

describe('AdminRegistrationController (Unit & Success Message Tests)', () => {
  let controller: AdminRegistrationController;
  let tournamentService: any;

  beforeEach(async () => {
    tournamentService = {
      confirmRegistrationPayment: jest.fn().mockResolvedValue({
        registration: { id: 'reg-1', status: 'Confirmed', paymentStatus: 'PAID' },
        assignedSlot: { slotNumber: 1, participantId: 'p1' },
      }),
      refundRegistration: jest.fn().mockResolvedValue({
        registrationId: 'reg-1',
        status: 'Waitlisted',
        refundTransactionId: 'tx-ref-123456',
        releasedSlotNumber: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRegistrationController],
      providers: [
        { provide: TournamentService, useValue: tournamentService },
      ],
    }).compile();

    controller = module.get<AdminRegistrationController>(AdminRegistrationController);
  });

  it('confirmPayment should return success: true and proper message', async () => {
    const res = await controller.confirmPayment('reg-1', {
      expectedVersion: 1,
      notes: 'Cash verified',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Participant payment confirmed and slot assigned successfully',
    );
    expect(res.data.registration.status).toBe('Confirmed');
  });

  it('refund should return success: true and proper message', async () => {
    const res = await controller.refund('reg-1', {
      expectedVersion: 2,
      reason: 'Medical withdrawal',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Entry fee refunded and slot released successfully');
    expect(res.data.status).toBe('Waitlisted');
  });
});
