/**
 * Deterministic (seeded) generator for a realistic 40k-person company.
 * Used only when the real Giga Corp CSV isn't loaded. Output matches the
 * record shape that csv.js produces, so both go through the same buildOrg().
 */
export function generateGigaCorp(N = 40000, seed = 20240622){
  let a = seed;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const FIRST = ['Meggy','Anjum','Bram','Cheryl','Dave','Dorothy','Jennifer','Sven','Trent','Holly','Kevin','Norma','Paige','Amara','Bilal','Chen','Diego','Elif','Farah','Gabriel','Hana','Ibrahim','Jun','Keira','Liam','Maya','Noor','Omar','Priya','Quinn','Rafael','Sana','Tomas','Uma','Victor','Wen','Yusuf','Zara','Aisha','Mateo','Leah','Arjun','Sofia','Kofi','Ingrid','Nadia','Ravi','Celeste'];
  const LAST = ['Jones','Bandra','Saito','Barnet','Kim','Chou','Caldwell','Nilsen','Walsh','Hartley','Reed','Rasmussen','Okafor','Haddad','Novak','Silva','Kowalski','Tanaka','Mensah','Ahmed','Fischer','Rossi','Dubois','Petrov','Singh','Park','Moreau','Larsen','Costa','Nguyen','Brennan','Iyer','Zhou','Khan','Alvarez','Murphy','Lindqvist','Osei','Varga','Bauer','Ortega','Hughes'];
  const LOCS = [['Toronto, ON',22],['Vancouver, BC',10],['Montréal, QC',8],['London, ON',5],['New York, NY',14],['Austin, TX',9],['London, UK',10],['Berlin, DE',6],['Bengaluru, IN',11],['Remote',5]];
  const locTotal = LOCS.reduce((s, l) => s + l[1], 0);
  const loc = () => { let x = rnd() * locTotal; for (const [n, w] of LOCS){ if ((x -= w) < 0) return n; } return 'Remote'; };
  const DEPTS = [
    { name:'Engineering', w:.30, vp:'VP of Engineering', mult:1.15, ic:['Software Engineer','Senior Software Engineer','Staff Engineer','QA Engineer','Site Reliability Engineer','Data Engineer'] },
    { name:'Sales', w:.19, vp:'VP of Sales', mult:1.0, ic:['Account Executive','Sales Development Rep','Senior Account Executive','Solutions Consultant'] },
    { name:'Customer Success', w:.14, vp:'VP of Customer Success', mult:.8, ic:['Customer Success Manager','Support Specialist','Implementation Consultant','Technical Support Engineer'] },
    { name:'Operations', w:.12, vp:'Chief Operating Officer', mult:.85, ic:['Operations Analyst','Program Coordinator','Supply Planner','Procurement Specialist'] },
    { name:'Product', w:.08, vp:'VP of Product', mult:1.1, ic:['Product Manager','Product Designer','UX Researcher','Senior Product Manager'] },
    { name:'Marketing', w:.08, vp:'VP of Marketing', mult:.95, ic:['Content Marketer','Growth Marketer','Brand Designer','Marketing Analyst'] },
    { name:'Finance', w:.05, vp:'Chief Financial Officer', mult:1.0, ic:['Financial Analyst','Accountant','FP&A Analyst','Payroll Specialist'] },
    { name:'People', w:.04, vp:'VP of People', mult:.9, ic:['Recruiter','HR Business Partner','People Ops Specialist','L&D Specialist'] },
  ];
  const mgrProb = lvl => lvl <= 3 ? 1 : lvl === 4 ? .75 : lvl === 5 ? .4 : lvl === 6 ? .22 : lvl === 7 ? .1 : .04;
  let seq = 0;
  const people = [];
  const mk = (level, dept, managerId) => { const p = { id:'E' + String(++seq).padStart(5, '0'), name:pick(FIRST) + ' ' + pick(LAST), dept, location:loc(), level, managerId, kids:0 }; people.push(p); return p; };

  const ceo = mk(1, 'Executive', ''); ceo.title = 'Chief Executive Officer'; ceo.salary = 520000; ceo.location = 'Toronto, ON';
  const remaining = N - 1 - DEPTS.length;
  for (const d of DEPTS){
    const vp = mk(2, d.name, ceo.id); ceo.kids++; vp.title = d.vp; d.people = [vp];
    const target = Math.round(remaining * d.w) + 1;
    const queue = [vp], leaves = []; let count = 1, li = 0;
    const wideP = d.name === 'Sales' || d.name === 'Customer Success' || d.name === 'Operations' ? .07 : .02;
    while (count < target){
      if (!queue.length) queue.push(leaves[li++]);   // promote the shallowest IC so the tree stays wide, not deep
      const m = queue.shift();
      const r = rnd();
      const span = m.level === 2 ? int(5, 8) : r < .06 ? int(1, 2) : r < .06 + wideP ? int(15, 24) : m.level === 3 ? int(4, 9) : int(3, 10);
      for (let k = 0; k < span && count < target; k++){
        const c = mk(m.level + 1, d.name, m.id); m.kids++; count++; d.people.push(c);
        if (rnd() < mgrProb(c.level)) queue.push(c); else if (c.level >= 4) leaves.push(c);
      }
    }
  }
  // Fill up / trim to exactly N with ICs under random line managers.
  while (people.length < N){ const d = DEPTS[0]; const host = d.people[int(1, d.people.length - 1)]; if (host.level < 4) continue; const c = mk(host.level + 1, d.name, host.id); host.kids++; d.people.push(c); }

  const round = v => Math.round(v / 500) * 500;
  const deptBy = Object.fromEntries(DEPTS.map(d => [d.name, d]));
  for (const p of people){
    if (p.title) { if (p.level === 2) p.salary = round(int(260, 360) * 1000); continue; }
    const d = deptBy[p.dept];
    if (p.kids > 0){
      p.title = p.level === 3 ? `Director, ${p.dept}` : p.level === 4 ? `Senior Manager, ${p.dept}` : rnd() < .5 ? `Manager, ${p.dept}` : `Team Lead, ${p.dept}`;
      p.salary = round((p.level === 3 ? int(185, 245) : p.level === 4 ? int(150, 195) : int(118, 165)) * 1000 * (0.9 + d.mult * 0.1));
    } else {
      p.title = pick(d.ic);
      p.salary = round(int(72, 155) * 1000 * d.mult);
    }
  }
  return people.map(p => ({ id:p.id, name:p.name, title:p.title, dept:p.dept, location:p.location, salary:p.salary, managerId:p.managerId }));
}
