import { AttendanceService } from "./attendance.service";

describe("AttendanceService", () => {
  let prisma: any;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn() },
      attendanceDay: { groupBy: jest.fn() },
    };
    service = new AttendanceService(prisma);
  });

  describe("getMonthlyAttendance", () => {
    it("returns an empty array when no agents match the team scope", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.getMonthlyAttendance("2026-07", "team-1");
      expect(result).toEqual([]);
      expect(prisma.attendanceDay.groupBy).not.toHaveBeenCalled();
    });

    it("rolls up work/break seconds and status counts per agent for the given month", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "agent-1", fullName: "Agent One" }]);
      prisma.attendanceDay.groupBy
        .mockResolvedValueOnce([
          {
            userId: "agent-1",
            _sum: { totalWorkSeconds: 28800, totalBreakSeconds: 1800, manualBreakSeconds: 1200, idleBreakSeconds: 600 },
            _count: { _all: 20 },
          },
        ])
        .mockResolvedValueOnce([
          { userId: "agent-1", status: "PRESENT", _count: { _all: 18 } },
          { userId: "agent-1", status: "WORKED_NO_BREAK", _count: { _all: 2 } },
        ]);

      const result = await service.getMonthlyAttendance("2026-07");

      expect(result).toEqual([
        {
          userId: "agent-1",
          fullName: "Agent One",
          daysRecorded: 20,
          totalWorkSeconds: 28800,
          totalBreakSeconds: 1800,
          manualBreakSeconds: 1200,
          idleBreakSeconds: 600,
          statusCounts: { PRESENT: 18, WORKED_NO_BREAK: 2 },
        },
      ]);
    });

    it("scopes to the requested team", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.getMonthlyAttendance("2026-07", "team-1");
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: "team-1" }) }),
      );
    });
  });
});
