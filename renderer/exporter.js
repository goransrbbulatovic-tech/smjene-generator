/* exporter.js — v5: Beautiful multi-person Excel + PDF */

const Exporter = (() => {

  const SHIFT_META = {
    night:     { label:'Noćna',          icon:'🌙', color:'#3b82f6', text:'#bfdbfe', bg:'#1e3a5f', hex:'3B82F6', bgHex:'1E3A5F' },
    morning:   { label:'Jutarnja',        icon:'🌅', color:'#f59e0b', text:'#fde68a', bg:'#451a03', hex:'F59E0B', bgHex:'451A03' },
    afternoon: { label:'Poslijepodnevna', icon:'☀',  color:'#06b6d4', text:'#a5f3fc', bg:'#0c4a6e', hex:'06B6D4', bgHex:'0C4A6E' },
    evening:   { label:'Večernja',        icon:'★',  color:'#8b5cf6', text:'#ddd6fe', bg:'#2e1065', hex:'8B5CF6', bgHex:'2E1065' },
    custom:    { label:'Prilagođena',     icon:'◆',  color:'#10b981', text:'#a7f3d0', bg:'#064e3b', hex:'10B981', bgHex:'064E3B' }
  };
  const SM = t => SHIFT_META[t] || SHIFT_META.custom;

  const DAY_HR   = ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'];
  const DAY_S    = ['Ned','Pon','Uto','Sri','Čet','Pet','Sub'];
  const MONTH_HR = ['Januar','Februar','Mart','April','Maj','Juni',
                    'Juli','August','Septembar','Oktobar','Novembar','Decembar'];

  function pad(n) { return String(n).padStart(2,'0'); }

  // ── Person color palette (matches app) ───────────────────────────
  const PALETTE = ['06B6D4','F59E0B','8B5CF6','22C55E','F43F5E','FB923C',
                   '34D399','A78BFA','FBBF24','38BDF8','F472B6','4ADE80'];

  function personHex(name, personList) {
    const idx = personList.indexOf(name);
    return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
  }

  // ══════════════════════════════════════════════════════════════════
  //  EXCEL EXPORT
  // ══════════════════════════════════════════════════════════════════
  function exportExcel(shifts, selectedPerson, opts = {}, allPersons = []) {
    const wb = XLSX.utils.book_new();

    // Which persons to export
    const persons = opts.allPersons
      ? (allPersons.length ? allPersons : [...new Set(shifts.map(s => s.person))].sort())
      : [selectedPerson];

    // ── Sheet 1: Summary overview (all selected persons) ─────────────
    const summaryRows = [];
    summaryRows.push(['RASPORED SMJENA', '', '', '', '', '', '', '']);
    summaryRows.push([`Generisano: ${new Date().toLocaleDateString('hr-HR')}`, '', '', '', '', '', '', '']);
    summaryRows.push([`Osobe: ${persons.join(', ')}`, '', '', '', '', '', '', '']);
    summaryRows.push([]);
    summaryRows.push(['OSOBA', 'UKUPNO SMJENA', 'UKUPNO SATI', 'NOĆNIH', 'JUTARNJIH', 'POSLIJEPODNEVNIH', 'VEČERNJIH', 'PRILAGOĐENIH']);

    persons.forEach(person => {
      const psh = shifts.filter(s => s.person === person);
      summaryRows.push([
        person,
        psh.length,
        psh.reduce((s,x) => s+(x.hours||0), 0).toFixed(1),
        psh.filter(s=>s.shiftType==='night').length,
        psh.filter(s=>s.shiftType==='morning').length,
        psh.filter(s=>s.shiftType==='afternoon').length,
        psh.filter(s=>s.shiftType==='evening').length,
        psh.filter(s=>s.shiftType==='custom').length,
      ]);
    });

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{wch:18},{wch:15},{wch:14},{wch:10},{wch:12},{wch:18},{wch:12},{wch:12}];

    // Merge title cells
    wsSummary['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:7} },
      { s:{r:1,c:0}, e:{r:1,c:7} },
      { s:{r:2,c:0}, e:{r:2,c:7} },
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Pregled');

    // ── Sheet per person ──────────────────────────────────────────────
    persons.forEach(person => {
      const psh = shifts.filter(s => s.person === person)
                        .sort((a,b) => a.date.localeCompare(b.date));
      if (!psh.length) return;

      const rows = [];

      // Header block
      rows.push([`SMJENE — ${person}`, '', '', '', '', '', '']);
      rows.push([`Ukupno: ${psh.length} smjena · ${psh.reduce((s,x)=>s+(x.hours||0),0).toFixed(1)}h rada`, '', '', '', '', '', '']);
      rows.push([]);
      rows.push(['#', 'DATUM', 'DAN', 'POČETAK', 'KRAJ', 'TIP SMJENE', 'SATI', 'NAPOMENA']);

      const dataStartRow = rows.length; // 0-based
      psh.forEach((s, i) => {
        const d = new Date(s.date + 'T00:00:00');
        rows.push([
          i + 1,
          s.date,
          DAY_HR[d.getDay()],
          s.startTime,
          s.endTime,
          SM(s.shiftType).label,
          s.hours,
          s.note || ''
        ]);
      });

      // Monthly stats block
      if (opts.stats) {
        rows.push([]);
        rows.push(['STATISTIKE PO MJESECU', '', '', '', '', '', '', '']);
        rows.push(['Mjesec', 'Smjena', 'Noćnih', 'Jutarnjih', 'Poslijepodnevnih', 'Večernjih', 'Sati']);
        const months = {};
        psh.forEach(s => {
          const k = s.date.slice(0,7);
          (months[k] = months[k]||[]).push(s);
        });
        Object.entries(months).sort().forEach(([k,ms]) => {
          const [y,m] = k.split('-');
          rows.push([
            `${MONTH_HR[parseInt(m)-1]} ${y}`,
            ms.length,
            ms.filter(s=>s.shiftType==='night').length,
            ms.filter(s=>s.shiftType==='morning').length,
            ms.filter(s=>s.shiftType==='afternoon').length,
            ms.filter(s=>s.shiftType==='evening').length,
            ms.reduce((s,x)=>s+(x.hours||0),0).toFixed(1)
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{wch:4},{wch:12},{wch:14},{wch:9},{wch:9},{wch:20},{wch:7},{wch:22}];

      // Merges for header
      ws['!merges'] = [
        { s:{r:0,c:0}, e:{r:0,c:7} },
        { s:{r:1,c:0}, e:{r:1,c:7} },
      ];

      const sheetName = person.slice(0,28).replace(/[:\\\/\?\*\[\]]/g,'_');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // ── All-persons combined sheet ────────────────────────────────────
    const allRows = [];
    allRows.push(['SVE SMJENE — KOMBINIRANO', '', '', '', '', '', '', '']);
    allRows.push([`Generisano: ${new Date().toLocaleDateString('hr-HR')}`, '', '', '', '', '', '', '']);
    allRows.push([]);
    allRows.push(['OSOBA', 'DATUM', 'DAN', 'POČETAK', 'KRAJ', 'TIP SMJENE', 'SATI', 'NAPOMENA']);

    const allSorted = shifts
      .filter(s => persons.includes(s.person))
      .sort((a,b) => a.date.localeCompare(b.date) || a.person.localeCompare(b.person));

    allSorted.forEach(s => {
      const d = new Date(s.date+'T00:00:00');
      allRows.push([s.person, s.date, DAY_HR[d.getDay()], s.startTime, s.endTime,
                    SM(s.shiftType).label, s.hours, s.note||'']);
    });

    const wsAll = XLSX.utils.aoa_to_sheet(allRows);
    wsAll['!cols'] = [{wch:14},{wch:12},{wch:14},{wch:9},{wch:9},{wch:20},{wch:7},{wch:22}];
    wsAll['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:7} },
      { s:{r:1,c:0}, e:{r:1,c:7} },
    ];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Sve Smjene');

    return XLSX.write(wb, { type:'base64', bookType:'xlsx' });
  }

  // ══════════════════════════════════════════════════════════════════
  //  PDF PRINT HTML
  // ══════════════════════════════════════════════════════════════════
  function buildPrintHTML(shifts, selectedPerson, year, month, avatarDataUrl, opts = {}, allPersons = []) {
    const persons = opts.allPersons
      ? (allPersons.length ? allPersons : [...new Set(shifts.map(s=>s.person))].sort())
      : [selectedPerson];

    const monthStr  = `${year}-${pad(month+1)}`;
    const today     = new Date().toISOString().slice(0,10);
    const monthName = `${MONTH_HR[month]} ${year}`;

    // Build calendar for ALL selected persons
    const firstDow  = (new Date(year,month,1).getDay()+6)%7;
    const lastDate  = new Date(year,month+1,0).getDate();
    const shiftMap  = {}; // date → [shifts]
    shifts.filter(s => s.date.startsWith(monthStr) && persons.includes(s.person))
      .forEach(s => (shiftMap[s.date] = shiftMap[s.date]||[]).push(s));

    // Calendar cells
    let calRows = '<tr>';
    for (let i=0; i<firstDow; i++)
      calRows += `<td style="background:#0a0f1a;border:1px solid #0d1520;vertical-align:top;min-height:72px;padding:5px"></td>`;

    for (let d=1; d<=lastDate; d++) {
      const ds   = `${year}-${pad(month+1)}-${pad(d)}`;
      const dsh  = shiftMap[ds] || [];
      const isTo = ds===today;
      const dow  = new Date(ds+'T00:00:00').getDay();
      const isWE = dow===0||dow===6;
      const bg   = dsh.length ? '#0d1e35' : isWE ? '#0b1220' : '#0f1729';

      let inner = `<div style="font-size:11px;font-weight:${dsh.length?'700':'400'};
        color:${dsh.length?'#94a3b8':'#334155'};margin-bottom:4px;
        ${isTo?'color:#06b6d4;':''}">
        ${d}${isTo?'<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#06b6d4;margin-left:4px;vertical-align:middle"></span>':''}
      </div>`;

      dsh.forEach(s => {
        const m   = SM(s.shiftType);
        const pc  = '#' + personHex(s.person, allPersons);
        const ini = s.person.split(/\s+/).map(w=>w[0]).join('').slice(0,2);
        const avEl = avatarDataUrl
          ? `<img src="${avatarDataUrl}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;border:1.5px solid ${pc};flex-shrink:0">`
          : `<div style="width:18px;height:18px;border-radius:50%;background:rgba(6,182,212,.15);border:1.5px solid ${pc};display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:${pc};flex-shrink:0">${ini}</div>`;

        inner += `<div style="background:${m.bg};border-left:3px solid ${m.color};border-radius:5px;
          padding:4px 6px;margin-bottom:3px;display:flex;align-items:center;gap:5px">
          ${avEl}
          <div style="min-width:0">
            <div style="font-size:10px;font-weight:800;color:${pc};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.person}</div>
            <div style="font-size:9px;color:#94a3b8;font-weight:600">${s.startTime}–${s.endTime}</div>
            <div style="font-size:8px;color:${m.color}">${m.label} · ${s.hours}h</div>
          </div>
        </div>`;
      });

      calRows += `<td style="background:${bg};${isTo?'box-shadow:inset 0 0 0 2px #06b6d4;':''}
        border:1px solid #141e30;padding:5px;vertical-align:top;min-height:72px;width:14.28%">${inner}</td>`;
      if ((firstDow+d)%7===0 && d<lastDate) calRows += '</tr><tr>';
    }
    // Pad last row
    const filled = (firstDow+lastDate)%7;
    if (filled>0) for(let i=filled;i<7;i++)
      calRows += `<td style="background:#0a0f1a;border:1px solid #0d1520;vertical-align:top;min-height:72px;padding:5px"></td>`;
    calRows += '</tr>';

    // Stats per person
    const personCards = persons.map(person => {
      const psh  = shifts.filter(s=>s.person===person);
      const msh  = psh.filter(s=>s.date.startsWith(monthStr));
      const hrs  = msh.reduce((s,x)=>s+(x.hours||0),0).toFixed(1);
      const pc   = '#'+personHex(person, allPersons);
      const ini  = person.split(/\s+/).map(w=>w[0]).join('').slice(0,2);
      const av   = person===selectedPerson && avatarDataUrl
        ? `<img src="${avatarDataUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid ${pc}">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:rgba(6,182,212,.1);border:2px solid ${pc};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${pc}">${ini}</div>`;

      const byType = {};
      msh.forEach(s=>{byType[s.shiftType]=(byType[s.shiftType]||0)+1;});
      const typeBars = Object.entries(byType).map(([t,c]) => {
        const mt=SM(t);
        return `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span style="font-size:10px;color:${mt.color};min-width:14px">${mt.icon}</span>
          <div style="flex:1;height:6px;background:#1e293b;border-radius:3px;overflow:hidden">
            <div style="height:100%;background:${mt.color};width:${Math.round(c/msh.length*100)}%;border-radius:3px"></div>
          </div>
          <span style="font-size:10px;color:#94a3b8;min-width:16px">${c}</span>
        </div>`;
      }).join('');

      return `<div style="background:#0f1729;border:1px solid #1e3a5f;border-radius:10px;padding:14px;min-width:160px;flex:1">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${av}
          <div>
            <div style="font-size:14px;font-weight:800;color:${pc}">${person}</div>
            <div style="font-size:11px;color:#64748b">${msh.length} smjena · ${hrs}h</div>
          </div>
        </div>
        ${typeBars}
      </div>`;
    }).join('');

    // Shift list table (all persons for this month)
    const allMonthShifts = shifts
      .filter(s=>s.date.startsWith(monthStr) && persons.includes(s.person))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.person.localeCompare(b.person));

    const shiftRows = allMonthShifts.map((s,i) => {
      const d=new Date(s.date+'T00:00:00'); const m=SM(s.shiftType);
      const pc='#'+personHex(s.person, allPersons);
      const bg = i%2===0?'#0f1729':'#0c1524';
      return `<tr>
        <td style="padding:7px 10px;font-weight:700;color:${pc};background:${bg};border-bottom:1px solid #141e30">${s.person}</td>
        <td style="padding:7px 10px;color:#64748b;font-size:11px;background:${bg};border-bottom:1px solid #141e30">${s.date}</td>
        <td style="padding:7px 10px;color:#94a3b8;font-weight:600;background:${bg};border-bottom:1px solid #141e30">${DAY_HR[d.getDay()]}</td>
        <td style="padding:7px 10px;color:#e2e8f0;font-weight:700;background:${bg};border-bottom:1px solid #141e30">${s.startTime}</td>
        <td style="padding:7px 10px;color:#e2e8f0;font-weight:700;background:${bg};border-bottom:1px solid #141e30">${s.endTime}</td>
        <td style="padding:7px 10px;background:${bg};border-bottom:1px solid #141e30">
          <span style="background:${m.bg};border:1px solid ${m.color};color:${m.text};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${m.icon} ${m.label}</span>
        </td>
        <td style="padding:7px 10px;color:#06b6d4;font-weight:700;background:${bg};border-bottom:1px solid #141e30">${s.hours}h</td>
      </tr>`;
    }).join('');

    // Legend
    const usedTypes = [...new Set(allMonthShifts.map(s=>s.shiftType))];
    const legendHTML = usedTypes.map(t => {
      const m=SM(t);
      return `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8">
        <div style="width:8px;height:8px;border-radius:2px;background:${m.color}"></div>${m.icon} ${m.label}
      </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="hr"><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 portrait;margin:8mm}
  html,body{height:auto !important;overflow:visible !important}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#080d1a;color:#e2e8f0;
       padding:14px;font-size:11px;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  table{page-break-inside:auto}
  tr{page-break-inside:avoid;page-break-after:auto}
  thead{display:table-header-group}
  @media print{
    body{background:#080d1a !important;padding:8px}
    *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
    .no-break{page-break-inside:avoid}
  }
</style></head><body>

<!-- HEADER -->
<div style="display:flex;align-items:center;justify-content:space-between;
     margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #06b6d4">
  <div>
    <div style="font-size:22px;font-weight:800;color:#06b6d4">Raspored Smjena</div>
    <div style="font-size:13px;color:#475569;margin-top:3px">
      ${monthName} &nbsp;·&nbsp; ${persons.length} osoba &nbsp;·&nbsp;
      Generisano: ${new Date().toLocaleDateString('hr-HR',{day:'2-digit',month:'2-digit',year:'numeric'})}
    </div>
  </div>
  <div style="text-align:right;font-size:11px;color:#334155">
    <strong style="color:#475569;display:block">Raspored Smjena</strong>by AcoRonaldo
  </div>
</div>

<!-- PERSON CARDS -->
<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">${personCards}</div>

<!-- CALENDAR TITLE -->
<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;
     letter-spacing:.08em;margin-bottom:8px;display:flex;align-items:center;gap:8px">
  <span style="display:inline-block;width:3px;height:12px;background:#06b6d4;border-radius:2px"></span>
  Kalendar — ${monthName}
</div>

<!-- CALENDAR -->
<div style="background:#0f1729;border:1px solid #1e3a5f;border-radius:10px;
     overflow:hidden;margin-bottom:10px">
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#0a1628">
      ${['PON','UTO','SRI','ČET','PET','SUB','NED'].map(d=>
        `<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;
               letter-spacing:.08em;color:#475569;border-bottom:1px solid #1e3a5f;
               text-align:center">${d}</th>`).join('')}
    </tr></thead>
    <tbody>${calRows}</tbody>
  </table>
</div>

<!-- LEGEND -->
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">${legendHTML}</div>

${allMonthShifts.length > 0 ? `
<!-- SHIFT LIST TITLE -->
<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;
     letter-spacing:.08em;margin:16px 0 8px;display:flex;align-items:center;gap:8px">
  <span style="display:inline-block;width:3px;height:12px;background:#06b6d4;border-radius:2px"></span>
  Popis Smjena — ${monthName}
</div>

<!-- SHIFT TABLE -->
<table style="width:100%;border-collapse:collapse;background:#0f1729;
       border-radius:10px;overflow:hidden;border:1px solid #1e3a5f">
  <thead><tr style="background:#0a1628">
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#475569;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Osoba</th>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#475569;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Datum</th>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#475569;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Dan</th>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#475569;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Početak</th>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#475569;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Kraj</th>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#475569;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Tip</th>
    <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;
          color:#06b6d4;border-bottom:2px solid #1e3a5f;text-transform:uppercase">Sati</th>
  </tr></thead>
  <tbody>${shiftRows}</tbody>
</table>` : ''}

<!-- FOOTER -->
<div style="margin-top:20px;padding-top:10px;border-top:1px solid #1e293b;
     display:flex;justify-content:space-between;font-size:10px;color:#334155">
  <span>Raspored Smjena by AcoRonaldo</span>
  <span>${monthName} · ${persons.join(', ')}</span>
</div>

</body></html>`;
  }

  return {
    exportExcel,
    buildPrintHTML,
    SHIFT_LABELS: Object.fromEntries(Object.entries(SHIFT_META).map(([k,v])=>[k,v.label]))
  };
})();
