// Unit tests for the logic-layer business rules that stand in for
// smart-contract enforcement (see src/services/awardService.js).
// Run with: npm test  (from nodejs-api/)

jest.mock('../src/multichain/client', () => ({
  publish: jest.fn().mockResolvedValue('mock-txid'),
  listStreamKeyItems: jest.fn().mockResolvedValue([])
}));

jest.mock('../src/integrations/workdayClient', () => ({
  getQualifyingLifecycleEvents: jest.fn(),
  getEmployeeStatus: jest.fn()
}));

const awardService = require('../src/services/awardService');

describe('issueManagerAward (WF-3)', () => {
  it('rejects a manager awarding their own account (FR-4)', async () => {
    await expect(
      awardService.issueManagerAward({
        managerId: 'emp-001',
        employeeId: 'emp-001',
        reasonCode: 'great-work',
        points: 100
      })
    ).rejects.toThrow(/cannot award their own account/);
  });

  it('rejects an award exceeding the remaining discretionary budget (FR-3)', async () => {
    await expect(
      awardService.issueManagerAward({
        managerId: 'mgr-100',
        employeeId: 'emp-002',
        reasonCode: 'great-work',
        points: 999999
      })
    ).rejects.toThrow(/exceeds remaining discretionary budget/);
  });

  it('issues a valid award within budget', async () => {
    const result = await awardService.issueManagerAward({
      managerId: 'mgr-101',
      employeeId: 'emp-003',
      reasonCode: 'great-work',
      points: 250
    });
    expect(result.points).toBe(250);
    expect(result.workflow).toBe('WF-3');
  });
});
