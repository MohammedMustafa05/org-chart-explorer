import Papa from 'papaparse'

// Header aliases, normalised to lowercase letters and digits only
const ALIASES = {
  id: ['employeeid', 'empid', 'id', 'personid', 'userid', 'staffid', 'email', 'employeeemail', 'workemail'],
  manager: ['managerid', 'manager', 'reportsto', 'reportstoid', 'manageremail', 'supervisor', 'supervisorid', 'parentid', 'parent', 'linemanager'],
  name: ['name', 'fullname', 'employeename', 'displayname'],
  firstName: ['firstname', 'givenname'],
  lastName: ['lastname', 'surname', 'familyname'],
  title: ['jobtitle', 'title', 'position', 'role', 'designation'],
  department: ['department', 'dept', 'function', 'team', 'division', 'businessunit'],
  location: ['location', 'office', 'city', 'country', 'site'],
  salary: ['salary', 'basesalary', 'annualsalary', 'compensation', 'pay', 'cost', 'totalcost'],
  bonus: ['bonus', 'annualbonus', 'variablepay', 'incentive'],
  entity: ['entity', 'legalentity', 'company', 'subsidiary'],
  level: ['level', 'joblevel', 'grade', 'band'],
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Map semantic fields to the CSV's actual header names. */
function detectColumns(headers) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]))
  const cols = {}
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      if (byNorm.has(a)) {
        cols[field] = byNorm.get(a)
        break
      }
    }
  }
  // "manager" can collide with an id-like header in odd exports; never map both to one column
  if (cols.manager && cols.manager === cols.id) delete cols.manager
  return cols
}

export function parseCsv(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() })
  const headers = result.meta.fields ?? []
  const cols = detectColumns(headers)
  let rows = result.data
  // Synthesise a full name when the file splits it into first/last
  if (!cols.name && (cols.firstName || cols.lastName)) {
    rows = rows.map((r) => ({ ...r, __name: `${r[cols.firstName] ?? ''} ${r[cols.lastName] ?? ''}`.trim() }))
    cols.name = '__name'
  }
  const missing = ['id', 'manager'].filter((f) => !cols[f])
  return { rows, headers, cols, missing }
}
