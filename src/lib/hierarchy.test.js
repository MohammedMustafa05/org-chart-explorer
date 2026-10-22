import { describe, it, expect } from 'vitest';
import { buildOrg, mgmtCostRatio } from './hierarchy.js';
import { recordsFromCSV } from './csv.js';
import { generateGigaCorp } from './sampleData.js';

//        CEO (500)
//        /        \
//   VP A (200)   VP B (180)
//    /    \          \
//  E1(100) E2(90)   M1 (150)
//                     |
//                   E3 (80)
const records = [
  { id: 'ceo', name: 'CEO', salary: 500, managerId: '' },
  { id: 'a', name: 'VP A', salary: 200, managerId: 'ceo' },
  { id: 'b', name: 'VP B', salary: 180, managerId: 'ceo' },
  { id: 'e1', name: 'E1', salary: 100, managerId: 'a' },
  { id: 'e2', name: 'E2', salary: 90, managerId: 'a' },
  { id: 'm1', name: 'M1', salary: 150, managerId: 'b' },
  { id: 'e3', name: 'E3', salary: 80, managerId: 'm1' },
];

describe('buildOrg', () => {
  const org = buildOrg(records);
  const get = (id) => org.byId.get(id);

  it('finds the single root and assigns levels', () => {
    expect(org.root.id).toBe('ceo');
    expect(get('ceo').level).toBe(1);
    expect(get('e3').level).toBe(4);
  });

  it('counts descendants and non-leaf descendants', () => {
    expect(get('ceo').desc).toBe(6);
    expect(get('ceo').nonLeaf).toBe(3); // VP A, VP B, M1
    expect(get('b').desc).toBe(2);
    expect(get('b').nonLeaf).toBe(1);
    expect(get('e1').desc).toBe(0);
  });

  it('rolls up management, IC and total cost over descendants', () => {
    const ceo = get('ceo');
    expect(ceo.mgmt).toBe(200 + 180 + 150);
    expect(ceo.ic).toBe(100 + 90 + 80);
    expect(ceo.total).toBe(ceo.mgmt + ceo.ic);
    expect(get('b').mgmt).toBe(150);
    expect(get('b').ic).toBe(80);
  });

  it('computes the management cost ratio', () => {
    expect(mgmtCostRatio(get('a'))).toBe(0); // only ICs below
    expect(mgmtCostRatio(get('e1'))).toBeNull(); // nothing below
    expect(mgmtCostRatio(get('ceo'))).toBeCloseTo(530 / 270);
  });

  it('wraps multiple roots in a virtual root', () => {
    const multi = buildOrg([
      { id: '1', name: 'A', salary: 10 },
      { id: '2', name: 'B', salary: 20 },
      { id: '3', name: 'C', salary: 5, managerId: '1' },
    ]);
    expect(multi.root.virtual).toBe(true);
    expect(multi.root.desc).toBe(3);
    expect(multi.count).toBe(3);
  });

  it('skips rows caught in a reporting cycle instead of hanging', () => {
    const cyc = buildOrg([
      { id: 'r', name: 'Root', salary: 1 },
      { id: 'x', name: 'X', salary: 1, managerId: 'y' },
      { id: 'y', name: 'Y', salary: 1, managerId: 'x' },
    ]);
    expect(cyc.count).toBe(1);
    expect(cyc.orphans).toBe(2);
  });

  it('matches a brute-force recount on the 40k sample', () => {
    const big = buildOrg(generateGigaCorp(40000));
    expect(big.count).toBe(40000);
    // brute force for a few nodes: walk the subtree directly
    const brute = (n) => {
      let desc = 0, total = 0;
      const stack = [...n.children];
      while (stack.length) {
        const c = stack.pop();
        desc++;
        total += c.salary;
        stack.push(...c.children);
      }
      return { desc, total };
    };
    for (const n of [big.root, ...big.root.children.slice(0, 3)]) {
      expect(brute(n)).toEqual({ desc: n.desc, total: n.total });
    }
  });
});

describe('recordsFromCSV', () => {
  it('maps headers loosely and resolves managers by id, email or name', () => {
    const csv = [
      'Employee Id,Name,Email,Job Title,Department,Salary,Manager',
      '1,Ada,ada@x.com,CEO,Exec,"$300,000",',
      '2,Ben,ben@x.com,VP,Eng,200000,1',
      '3,Cy,cy@x.com,Eng,Eng,100000,ben@x.com',
      '4,Di,di@x.com,Eng,Eng,90000,Ben',
    ].join('\n');
    const org = buildOrg(recordsFromCSV(csv));
    expect(org.root.name).toBe('Ada');
    expect(org.byId.get('2').children.map((c) => c.name).sort()).toEqual(['Cy', 'Di']);
    expect(org.root.total).toBe(390000);
  });

  it('errors clearly when there is no manager column', () => {
    expect(() => recordsFromCSV('Name,Salary\nA,1')).toThrow(/manager column/);
  });
});
