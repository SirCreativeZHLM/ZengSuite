/* Write: starter templates (File > New from Template). Opening the app still starts with a blank document. */
(() => {
  'use strict';
  const P = window.P;
  const p = (t, a = '') => `<p${a ? ' ' + a : ''}>${t}</p>`;
  const li = (t, k = 'b', lv = 0) => `<p data-list="${k}" data-lv="${lv}">${t}</p>`;
  const ph = (t) => `<span style="color:#8e8e93">${t}</span>`;
  const tbl = (rows, widths, ts = 'plain') => `<table data-ts="${ts}" style="width:${widths.reduce((a, b) => a + b, 0)}px"><colgroup>${widths.map((w) => `<col style="width:${w}px">`).join('')}</colgroup><tbody>${rows.map((r, i) => `<tr>${r.map((c) => `<${i === 0 && ts !== 'plain' ? 'th' : 'td'}>${c}</${i === 0 && ts !== 'plain' ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table>`;
  const pf = '<span class="fld" data-f="page" contenteditable="false"></span>', pc = '<span class="fld" data-f="pages" contenteditable="false"></span>';
  const lorem = 'Replace this text with your own. Select it and start typing, or use the Styles menu to change how a paragraph looks.';

  P.TEMPLATES = [
    { id: 'blank', name: 'Blank', desc: 'An empty document.', html: () => '<p><br></p>' },
    { id: 'letter', name: 'Letter', desc: 'A formal business letter.', html: () => [
      p('Your Name', 'style="text-align:right;--sa:0px"'), p('123 Street Address', 'style="text-align:right;--sa:0px"'), p('City, State 00000', 'style="text-align:right;--sa:18px"'),
      p(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 'style="--sa:18px"'),
      p('Recipient Name', 'style="--sa:0px"'), p('Company or Organisation', 'style="--sa:0px"'), p('Street Address', 'style="--sa:0px"'), p('City, State 00000', 'style="--sa:18px"'),
      p('Dear Recipient,'), p(lorem), p('A second paragraph is a good place for the details: what you are asking, offering or confirming, and by when.'), p('Thank you for your time and consideration.', 'style="--sa:18px"'), p('Sincerely,', 'style="--sa:30px"'), p('Your Name'),
    ].join('') },
    { id: 'resume', name: 'Resume', desc: 'One-page résumé with sections.', page: { mt: 72, mb: 72, ml: 84, mr: 84 }, html: () => [
      p('Your Name', 'data-st="Title" style="--sa:2px"'), p('City, State · you@example.com · 555 0100', 'data-st="Subtitle" style="--sa:10px"'),
      '<h1 style="border-bottom:1px solid #c7c7cc;padding-bottom:2px">Experience</h1>',
      p('<b>Job Title</b> — Company, City <span style="color:#6e6e73">· 2022–Present</span>', 'style="--sa:2px"'), li('Led a project that delivered a measurable result.'), li('Describe a responsibility using a strong verb.'),
      p('<b>Earlier Title</b> — Company, City <span style="color:#6e6e73">· 2019–2022</span>', 'style="--sa:2px;--sb:8px"'), li('Highlight an achievement with a number.'),
      '<h1 style="border-bottom:1px solid #c7c7cc;padding-bottom:2px">Education</h1>', p('<b>Degree, Subject</b> — University, City <span style="color:#6e6e73">· 2015–2019</span>'),
      '<h1 style="border-bottom:1px solid #c7c7cc;padding-bottom:2px">Skills</h1>', li('Skill one'), li('Skill two'), li('Skill three'),
    ].join('') },
    { id: 'report', name: 'Report', desc: 'Title, contents, numbered pages.', settings: () => { P.S.diffFirst = true; P.S.ftr.def = `<p style="text-align:center">Page ${pf} of ${pc}</p>`; P.S.hdr.def = '<p style="text-align:right">Report title</p>'; }, html: () => [
      p('Report Title', 'data-st="Title" style="--sb:120px"'), p('A short description of what this report covers', 'data-st="Subtitle"'), p('Author Name · ' + new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 'style="color:#6e6e73"'),
      '<div class="pgbreak" contenteditable="false" data-label="Page Break"></div>',
      '<h1>Introduction</h1>', p(lorem), '<h1>Findings</h1>', '<h2>First finding</h2>', p(lorem), '<h2>Second finding</h2>', p(lorem), '<h1>Conclusion</h1>', p(lorem),
    ].join(''), after: () => { const h = P.flow.querySelector('h1'); if (h) { P.flow.querySelector('.pgbreak').insertAdjacentHTML('afterend', ''); } const frag = P.buildTOC(); const pb = P.flow.querySelector('.pgbreak'); pb.before(...frag); P.afterLoad(); P.refreshTOC(true); } },
    { id: 'newsletter', name: 'Newsletter', desc: 'Masthead and two-column stories.', page: { mt: 60, mb: 60, ml: 60, mr: 60 }, html: () => [
      p('The Monthly', 'data-st="Title" style="text-align:center;--sa:0px"'), p('News, notes and what is coming next', 'data-st="Subtitle" style="text-align:center;--sa:6px;border-bottom:3px double #ff9f0a;padding-bottom:6px"'),
      tbl([[`<h2>Lead story</h2>${p(lorem)}${p(lorem)}<h2>Quick notes</h2>${li('A short item')}${li('Another short item')}`, `<h2>Calendar</h2>${p('<b>12 May</b> — Event name')}${p('<b>20 May</b> — Event name')}<h2>From the team</h2>${p(lorem)}`]], [330, 330]),
    ].join('') },
    { id: 'meeting', name: 'Meeting Notes', desc: 'Agenda, notes and action items.', html: () => [
      p('Meeting Notes', 'data-st="Title"'),
      tbl([[`<b>Date</b>`, new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })], [`<b>Attendees</b>`, ph('Names')], [`<b>Facilitator</b>`, ph('Name')]], [140, 520], 'clean'),
      '<h1>Agenda</h1>', li('First topic', 'n'), li('Second topic', 'n'), li('Third topic', 'n'),
      '<h1>Notes</h1>', p(ph('Capture decisions and discussion here.')),
      '<h1>Action items</h1>', li('Owner — task — due date', 'c'), li('Owner — task — due date', 'c'),
      '<h1>Next meeting</h1>', p(ph('Date and time')),
    ].join('') },
  ];

  P.applyTemplate = (t) => {
    P.resetMedia(); P.resetDocSettings(); if (t.page) Object.assign(P.S.page, t.page); if (t.settings) t.settings();
    P.applyPageCss(); P.applyStyleCss();
    const nodes = [...new DOMParser().parseFromString('<body>' + P.sanitizeOwn(t.html()) + '</body>', 'text/html').body.childNodes];
    P.loadNodes(nodes, { keepSettings: true }); if (t.after) t.after();
  };
  P.newFromTemplate = async (id) => {
    const t = P.TEMPLATES.find((x) => x.id === id) || P.TEMPLATES[0]; if (!(await P.doc.guard())) return; P.doc.file = null; P.doc.untitled = 'Untitled'; P.applyTemplate(t); P.doc.setClean(); P.doc.refreshTitle(); P.flow.focus(); P.placeCaretIn(P.flow.firstElementChild);
  };
  P.showTemplates = async () => {
    const grid = zk.el('.tplgrid');
    let chosen = null; let sheet;
    for (const t of P.TEMPLATES) {
      const prev = zk.el('.tplprev.pgdoc'); prev.innerHTML = P.sanitizeOwn(t.html()); prev.querySelectorAll('.fld').forEach((f) => f.setAttribute('data-v', '1'));
      const card = zk.el('button.tplcard', { type: 'button', 'aria-label': t.name + ' template', onclick: () => { chosen = t.id; sheet && sheet.close('ok'); } }, zk.el('.tplpage', prev), zk.el('.tplname', t.name), zk.el('.tpldesc', t.desc));
      grid.append(card);
    }
    const res = zk.sheet({ title: 'New from Template', body: grid, width: 640, buttons: [{ label: 'Cancel', value: null }] });
    sheet = document.querySelector('.zk-sheet:last-of-type'); sheet = [...document.querySelectorAll('.zk-sheet')].pop();
    await res; if (chosen) P.newFromTemplate(chosen);
  };
})();
