/**
 * Minimal RFC 4180 CSV parser + header mapping.
 * Headers are matched loosely so the real Giga Corp export works without edits.
 */
export function parseCSV(text){
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (q){
      if (ch === '"'){ if (text[i+1] === '"'){ field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ','){ row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r'){
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = ''; if (row.some(v => v !== '')) rows.push(row); row = [];
    } else field += ch;
  }
  row.push(field); if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

export function recordsFromCSV(text){
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('That file has no data rows.');
  const norm = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => { for (const nm of names){ const i = norm.indexOf(nm); if (i >= 0) return i; } return -1; };
  const c = {
    id: col('employeeid','empid','id','employeenumber','userid','personid','workerid'),
    email: col('email','emailaddress','workemail'),
    mgr: col('managerid','manageremployeeid','reportsto','reportstoid','manager','manageremail','supervisorid','supervisor','reportingmanager','managername'),
    name: col('name','fullname','employeename','employee'),
    first: col('firstname','givenname'), last: col('lastname','surname','familyname'),
    title: col('jobtitle','title','role','position','designation'),
    dept: col('department','dept','function','businessunit','team','division'),
    loc: col('location','office','city','worklocation','country'),
    sal: col('salary','basesalary','annualsalary','compensation','totalcompensation','pay','cost'),
  };
  if (c.mgr < 0) throw new Error('Could not find a manager column (e.g. "Manager", "Manager ID", "Reports To").');
  const get = (r, i) => (i >= 0 && r[i] != null ? r[i].trim() : '');
  const body = rows.slice(1);
  const recs = body.map((r, k) => ({
    id: get(r, c.id) || get(r, c.email) || 'row' + k,
    email: get(r, c.email).toLowerCase(),
    name: get(r, c.name) || [get(r, c.first), get(r, c.last)].filter(Boolean).join(' '),
    title: get(r, c.title), dept: get(r, c.dept), location: get(r, c.loc),
    salary: parseFloat(get(r, c.sal).replace(/[^0-9.\-]/g, '')) || 0,
    mgrRaw: get(r, c.mgr),
  }));
  // Manager column may hold an id, an email, or a name: resolve against all three.
  const ids = new Set(recs.map(r => r.id)), byEmail = new Map(), byName = new Map();
  for (const r of recs){ if (r.email) byEmail.set(r.email, r.id); if (r.name) byName.set(r.name.toLowerCase(), r.id); }
  for (const r of recs){
    const m = r.mgrRaw;
    r.managerId = !m ? '' : ids.has(m) ? m : byEmail.get(m.toLowerCase()) || byName.get(m.toLowerCase()) || '';
  }
  return recs;
}
