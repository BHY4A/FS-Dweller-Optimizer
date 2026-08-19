// Windowed, filterable result tables.

import { $, esc, setHTML } from './dom.js';

// ---- Paged result tables -------------------------------------
// Large vaults produce very long tables (a 200-dweller vault yields hundreds
// of weapon rows). Rather than dumping everything, each result area renders a
// filterable window over its rows with an explicit "show more" control, so
// the page stays navigable and the browser stays responsive.
export const PAGE_STATE = {};
export const PAGE_STEP = 25;

// model: { headers:[], rows:[{cells:[html], text}], pageSize, prefix, suffix,
//          empty, unit }
export function pagedTable(hostId, model) {
  PAGE_STATE[hostId] = {
    model,
    shown: model.pageSize || PAGE_STEP,
    filter: (PAGE_STATE[hostId] && PAGE_STATE[hostId].keepFilter) ? PAGE_STATE[hostId].filter : '',
  };
  drawPaged(hostId);
}

export function drawPaged(hostId) {
  const st = PAGE_STATE[hostId];
  if (!st) return;
  const m = st.model;
  const q = st.filter.trim().toLowerCase();
  const all = m.rows;
  const rows = q ? all.filter(r => r.text.toLowerCase().indexOf(q) !== -1) : all;
  const visible = rows.slice(0, st.shown);
  const unit = m.unit || 'rows';

  let h = m.prefix || '';

  if (all.length === 0) {
    h += '<div class="small" style="margin-top:10px;">' + (m.empty || 'Nothing to show.') + '</div>';
    h += m.suffix || '';
    setHTML(hostId, h);
    return;
  }

  // Filter box only earns its place once the list is long enough to need one.
  if (all.length > 10) {
    h += '<div class="filter-row">' +
      '<input type="text" id="' + hostId + '_q" placeholder="filter ' + esc(unit) + '..." value="' +
      esc(st.filter) + '">' +
      (st.filter ? '<button class="btn small" id="' + hostId + '_clear">clear</button>' : '') +
      '</div>';
  }

  h += '<div class="table-scroll"><table><thead><tr>';
  m.headers.forEach(head => { h += '<th>' + head + '</th>'; });
  h += '</tr></thead><tbody>';
  if (!visible.length) {
    h += '<tr><td colspan="' + m.headers.length + '" class="small">Nothing matches that filter.</td></tr>';
  } else {
    visible.forEach(r => { h += '<tr>' + r.cells.map(c => '<td>' + c + '</td>').join('') + '</tr>'; });
  }
  h += '</tbody></table></div>';

  const remaining = rows.length - visible.length;
  h += '<div class="page-foot">';
  h += '<span class="small">Showing ' + visible.length + ' of ' + rows.length + ' ' + esc(unit) +
       (q ? ' (filtered from ' + all.length + ')' : '') + '</span>';
  if (remaining > 0) {
    h += '<span class="page-btns">' +
      '<button class="btn small" id="' + hostId + '_more">show ' + Math.min(PAGE_STEP, remaining) + ' more</button>' +
      (remaining > PAGE_STEP ? '<button class="btn small" id="' + hostId + '_all">show all ' + rows.length + '</button>' : '') +
      '</span>';
  } else if (visible.length > (m.pageSize || PAGE_STEP)) {
    h += '<span class="page-btns"><button class="btn small" id="' + hostId + '_less">collapse</button></span>';
  }
  h += '</div>';
  h += m.suffix || '';

  setHTML(hostId, h);

  const host = $(hostId);
  const q1 = host.querySelector('#' + hostId + '_q');
  if (q1) {
    q1.addEventListener('input', e => {
      st.filter = e.target.value;
      st.shown = m.pageSize || PAGE_STEP;
      st.keepFilter = true;
      drawPaged(hostId);
      // Keep the caret where the user left it after the redraw.
      const again = $(hostId).querySelector('#' + hostId + '_q');
      if (again && again.focus) { again.focus(); }
    });
  }
  const clr = host.querySelector('#' + hostId + '_clear');
  if (clr) clr.addEventListener('click', () => {
    st.filter = ''; st.shown = m.pageSize || PAGE_STEP; drawPaged(hostId);
  });
  const more = host.querySelector('#' + hostId + '_more');
  if (more) more.addEventListener('click', () => { st.shown += PAGE_STEP; drawPaged(hostId); });
  const allBtn = host.querySelector('#' + hostId + '_all');
  if (allBtn) allBtn.addEventListener('click', () => { st.shown = rows.length; drawPaged(hostId); });
  const less = host.querySelector('#' + hostId + '_less');
  if (less) less.addEventListener('click', () => {
    st.shown = m.pageSize || PAGE_STEP; drawPaged(hostId);
  });
}
