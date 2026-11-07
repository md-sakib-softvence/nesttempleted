import { NotFoundException } from '@nestjs/common';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from '../service/employee.service';

describe('GET /employee/:id/analytics', () => {
  let prisma: any;
  let service: EmployeeService;
  let controller: EmployeeController;

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          employeeId: 'employee-1',
          showEmployeeId: 'EMP-00001',
        }),
      },
      tournamentStaffAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            matchId: 'match-complete',
            tournament: {
              schedule: {
                structure: {
                  matches: [
                    { id: 'match-complete', status: 'COMPLETED' },
                    { id: 'match-live', status: 'IN_PROGRESS' },
                  ],
                },
              },
            },
          },
          {
            matchId: 'match-live',
            tournament: {
              schedule: {
                matches: [{ id: 'match-live', status: 'IN_PROGRESS' }],
              },
            },
          },
        ]),
      },
      ticketScanLog: {
        count: jest.fn(({ where }) =>
          where.status === 'VALID' ? Promise.resolve(3) : Promise.resolve(4),
        ),
        findMany: jest
          .fn()
          .mockResolvedValue([{ ticketId: 'ticket-1' }, { ticketId: 'ticket-2' }]),
      },
      matchDispute: { count: jest.fn().mockResolvedValue(2) },
    };

    service = new EmployeeService(prisma, {} as any, {} as any);
    controller = new EmployeeController(service);
  });

  it('returns database-backed staff analytics in the API response envelope', async () => {
    const response = await controller.getEmployeeAnalytics('EMP-00001');

    expect(response).toEqual({
      success: true,
      message: 'Employee analytics retrieved successfully',
      data: {
        employeeId: 'employee-1',
        matchesOfficiated: 1,
        playersScanned: 2,
        reliabilityScore: 75,
        disputesRaised: 2,
      },
    });
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { employeeId: 'EMP-00001' },
            { showEmployeeId: 'EMP-00001' },
          ],
          isDeleted: false,
        },
      }),
    );
  });

  it('returns not found for an unknown employee', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(service.getEmployeeAnalytics('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.tournamentStaffAssignment.findMany).not.toHaveBeenCalled();
  });
});
