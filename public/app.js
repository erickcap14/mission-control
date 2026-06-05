/* ============================================================
   MISSION-CONTROL — app.js
   React 18, no JSX, no bundler
   ============================================================ */

const { useState, useEffect, useRef, useCallback } = React;
const h = React.createElement;

const API = 'http://localhost:9000/api';

// ── Helpers ─────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mon} ${day} ${hh}:${mm}`;
}

function fmtTokens(t) {
  if (!t) return '0';
  const total = (t.input || 0) + (t.output || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0);
  if (total >= 1_000_000) return (total / 1_000_000).toFixed(1) + 'M';
  if (total >= 1_000) return (total / 1_000).toFixed(1) + 'K';
  return String(total);
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  }
  return `${totalSec}s`;
}

function fmtCost(c) {
  if (c == null) return '—';
  return '$' + Number(c).toFixed(4);
}

function modelClass(model) {
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'unknown';
}

function modelLabel(model) {
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('haiku')) return 'haiku';
  // Extract short model id like "sonnet-4-5"
  const match = model.match(/claude-(.+)/i);
  if (match) {
    const parts = match[1].split('-');
    return parts.slice(0, 2).join('-');
  }
  return model.substring(0, 12);
}

function truncate(str, len) {
  if (!str) return '—';
  if (str.length <= len) return str;
  return str.substring(0, len) + '…';
}

// ── SVG Bar Chart ────────────────────────────────────────────

function BarChart({ data, xKey, yKey, color, width, height }) {
  if (!data || data.length === 0) {
    return h('div', { style: { color: '#444', fontSize: '11px', textAlign: 'center', paddingTop: '20px' } }, 'no data');
  }

  const W = width || 400;
  const H = height || 120;
  const paddingLeft = 48;
  const paddingRight = 8;
  const paddingTop = 8;
  const paddingBottom = 28;
  const chartW = W - paddingLeft - paddingRight;
  const chartH = H - paddingTop - paddingBottom;

  const maxVal = Math.max(...data.map(d => d[yKey] || 0), 0.0001);
  const barW = chartW / data.length;
  const barGap = Math.max(1, barW * 0.15);

  const bars = data.map((d, i) => {
    const val = d[yKey] || 0;
    const barH = (val / maxVal) * chartH;
    const x = paddingLeft + i * barW + barGap / 2;
    const y = paddingTop + chartH - barH;
    return h('rect', {
      key: i,
      x, y,
      width: barW - barGap,
      height: Math.max(barH, 0),
      fill: color || '#00d966',
      opacity: 0.85
    });
  });

  // X-axis labels — show every nth label to avoid crowding
  const step = data.length <= 12 ? 1 : data.length <= 30 ? 5 : Math.ceil(data.length / 6);
  const xLabels = data.map((d, i) => {
    if (i % step !== 0) return null;
    const x = paddingLeft + i * barW + barW / 2;
    const label = String(d[xKey] || '');
    const shortLabel = label.length > 5 ? label.substring(label.length - 5) : label;
    return h('text', {
      key: 'xl-' + i,
      x, y: H - 6,
      textAnchor: 'middle',
      fontSize: 9,
      fill: '#444',
      fontFamily: "'IBM Plex Mono', monospace"
    }, shortLabel);
  });

  // Y-axis: just show max
  const maxLabel = maxVal >= 1 ? '$' + maxVal.toFixed(2) : '$' + maxVal.toFixed(4);

  return h('svg', {
    viewBox: `0 0 ${W} ${H}`,
    style: { width: '100%', height: H },
    overflow: 'visible'
  },
    // Axis lines
    h('line', { x1: paddingLeft, y1: paddingTop, x2: paddingLeft, y2: paddingTop + chartH, stroke: '#1a1f3a', strokeWidth: 1 }),
    h('line', { x1: paddingLeft, y1: paddingTop + chartH, x2: paddingLeft + chartW, y2: paddingTop + chartH, stroke: '#1a1f3a', strokeWidth: 1 }),
    // Max label
    h('text', { x: paddingLeft - 4, y: paddingTop + 4, textAnchor: 'end', fontSize: 9, fill: '#444', fontFamily: "'IBM Plex Mono', monospace" }, maxLabel),
    h('text', { x: paddingLeft - 4, y: paddingTop + chartH, textAnchor: 'end', fontSize: 9, fill: '#444', fontFamily: "'IBM Plex Mono', monospace" }, '$0'),
    // Bars
    ...bars,
    // X labels
    ...xLabels
  );
}

// ── Model Badge ──────────────────────────────────────────────

function ModelBadge({ model }) {
  return h('span', { className: 'model-badge ' + modelClass(model) }, modelLabel(model));
}

// ── Status Dot ───────────────────────────────────────────────

function StatusDot({ status }) {
  const cls = status === 'wip' ? 'wip' : status === 'complete' ? 'complete' : 'none';
  return h('span', { className: 'status-dot ' + cls });
}

// ── Session Detail Modal ─────────────────────────────────────

function SessionModal({ session, onClose, onUpdated }) {
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState(session.summary || '');
  const [currentStatus, setCurrentStatus] = useState(session.status || '');
  const overlayRef = useRef(null);

  useEffect(() => {
    setSummaryText(session.summary || '');
    setCurrentStatus(session.status || '');
  }, [session]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  async function saveSummary() {
    setEditingSummary(false);
    try {
      const res = await fetch(`${API}/sessions/${session.id}/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summaryText })
      });
      if (res.ok && onUpdated) onUpdated({ ...session, summary: summaryText });
    } catch (err) {
      console.error('save summary failed', err);
    }
  }

  async function handleStatusChange(e) {
    const newStatus = e.target.value || null;
    setCurrentStatus(newStatus || '');
    try {
      const res = await fetch(`${API}/sessions/${session.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok && onUpdated) onUpdated({ ...session, status: newStatus });
    } catch (err) {
      console.error('save status failed', err);
    }
  }

  const tok = session.tokens || {};
  const inputCost = session.inputCost != null ? session.inputCost : null;
  const outputCost = session.outputCost != null ? session.outputCost : null;
  const cacheReadCost = session.cacheReadCost != null ? session.cacheReadCost : null;
  const cacheWriteCost = session.cacheWriteCost != null ? session.cacheWriteCost : null;

  const toolCalls = Array.isArray(session.toolCalls)
    ? [...session.toolCalls].sort((a, b) => (b.count || 0) - (a.count || 0))
    : [];

  return h('div', { className: 'modal-overlay', ref: overlayRef, onClick: handleOverlayClick },
    h('div', { className: 'modal' },
      // Header
      h('div', { className: 'modal-header' },
        h('div', null,
          h('div', { className: 'modal-title' }, session.id),
          h('div', { className: 'modal-subtitle' }, session.projectPath || '')
        ),
        h('button', { className: 'modal-close', onClick: onClose }, '✕')
      ),

      // Overview grid
      h('div', { className: 'modal-section-label' }, 'overview'),
      h('div', { className: 'detail-grid' },
        h('div', { className: 'detail-item' },
          h('label', null, 'Start Time'),
          h('div', { className: 'detail-value' }, fmtDate(session.startTime))
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'End Time'),
          h('div', { className: 'detail-value' }, fmtDate(session.endTime))
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Model'),
          h('div', { className: 'detail-value' }, h(ModelBadge, { model: session.model }))
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Duration'),
          h('div', { className: 'detail-value' }, fmtDuration(session.duration))
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Turns'),
          h('div', { className: 'detail-value' }, session.turnCount || '—')
        ),
        session.subagentCount > 0
          ? h('div', { className: 'detail-item' },
              h('label', null, 'Subagents'),
              h('div', { className: 'detail-value' }, session.subagentCount)
            )
          : null
      ),

      // Cost breakdown
      h('div', { className: 'modal-section-label' }, 'cost breakdown'),
      h('div', { className: 'detail-grid-4' },
        h('div', { className: 'detail-item' },
          h('label', null, 'Input Cost'),
          h('div', { className: 'detail-value amber' }, inputCost != null ? fmtCost(inputCost) : fmtCost(session.cost))
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Output Cost'),
          h('div', { className: 'detail-value amber' }, outputCost != null ? fmtCost(outputCost) : '—')
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Cache Read'),
          h('div', { className: 'detail-value' }, cacheReadCost != null ? fmtCost(cacheReadCost) : '—')
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Cache Write'),
          h('div', { className: 'detail-value' }, cacheWriteCost != null ? fmtCost(cacheWriteCost) : '—')
        )
      ),

      // Token breakdown
      h('div', { className: 'modal-section-label' }, 'token breakdown'),
      h('div', { className: 'detail-grid-4' },
        h('div', { className: 'detail-item' },
          h('label', null, 'Input'),
          h('div', { className: 'detail-value' }, tok.input != null ? tok.input.toLocaleString() : '—')
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Output'),
          h('div', { className: 'detail-value' }, tok.output != null ? tok.output.toLocaleString() : '—')
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Cache Read'),
          h('div', { className: 'detail-value' }, tok.cacheRead != null ? tok.cacheRead.toLocaleString() : '—')
        ),
        h('div', { className: 'detail-item' },
          h('label', null, 'Cache Write'),
          h('div', { className: 'detail-value' }, tok.cacheWrite != null ? tok.cacheWrite.toLocaleString() : '—')
        )
      ),

      // Tool calls
      toolCalls.length > 0
        ? h('div', null,
            h('div', { className: 'modal-section-label' }, 'tool calls'),
            h('div', { className: 'tool-calls-list' },
              ...toolCalls.map((tc, i) =>
                h('div', { key: i, className: 'tool-call-row' },
                  h('span', { className: 'tool-call-name' }, tc.name || tc.tool || '—'),
                  h('span', { className: 'tool-call-count' }, tc.count || 1)
                )
              )
            )
          )
        : null,

      // Summary
      h('div', { className: 'modal-section-label' }, 'summary'),
      editingSummary
        ? h('div', null,
            h('textarea', {
              className: 'summary-edit',
              value: summaryText,
              onChange: e => setSummaryText(e.target.value),
              onBlur: saveSummary,
              autoFocus: true
            }),
            h('div', { className: 'summary-hint' }, 'click outside to save')
          )
        : h('div', null,
            h('div', {
              className: 'summary-display',
              onClick: () => setEditingSummary(true),
              title: 'Click to edit'
            }, summaryText || h('span', { style: { color: '#444' } }, 'no summary — click to add')),
            !summaryText && h('div', { className: 'summary-hint' }, 'click to add summary')
          ),

      // Status
      h('div', { className: 'modal-section-label' }, 'status'),
      h('select', {
        className: 'status-select',
        value: currentStatus,
        onChange: handleStatusChange
      },
        h('option', { value: '' }, '— none —'),
        h('option', { value: 'wip' }, 'WIP'),
        h('option', { value: 'complete' }, 'COMPLETE')
      )
    )
  );
}

// ── Charts Panel ─────────────────────────────────────────────

function ChartsPanel({ dailyStats, monthlyStats }) {
  return h('div', { className: 'charts-container' },
    h('div', { className: 'chart-panel' },
      h('div', { className: 'chart-title' }, 'daily cost — last 30 days'),
      h(BarChart, {
        data: dailyStats.slice(-30),
        xKey: 'date',
        yKey: 'cost',
        color: '#00d966',
        height: 130
      })
    ),
    h('div', { className: 'chart-panel' },
      h('div', { className: 'chart-title' }, 'monthly cost — last 12 months'),
      h(BarChart, {
        data: monthlyStats.slice(-12),
        xKey: 'month',
        yKey: 'cost',
        color: '#ffaa00',
        height: 130
      })
    )
  );
}

// ── Main App ─────────────────────────────────────────────────

function App() {
  const [stats, setStats] = useState({ projectCount: 0, sessionCount: 0, totalCost: 0, timeSaved: 0 });
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const [showCharts, setShowCharts] = useState(false);
  const [dailyStats, setDailyStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const searchRef = useRef(null);
  const pollRef = useRef(null);
  const sseRef = useRef(null);

  // ── Fetch functions ──

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) { /* silent */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projects`);
      if (res.ok) setProjects(await res.json());
    } catch (e) { /* silent */ }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch (e) { /* silent */ }
  }, []);

  const fetchCharts = useCallback(async () => {
    try {
      const [dr, mr] = await Promise.all([
        fetch(`${API}/daily-stats`),
        fetch(`${API}/monthly-stats`)
      ]);
      if (dr.ok) setDailyStats(await dr.json());
      if (mr.ok) setMonthlyStats(await mr.json());
    } catch (e) { /* silent */ }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.all([fetchStats(), fetchSessions()]);
  }, [fetchStats, fetchSessions]);

  // ── Mount: initial load + SSE + polling ──

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchProjects(), fetchSessions(), fetchCharts()]);
      setLoading(false);
    })();

    // SSE
    function connectSSE() {
      try {
        const es = new EventSource(`${API}/events`);
        sseRef.current = es;
        es.onopen = () => setLiveConnected(true);
        es.onerror = () => {
          setLiveConnected(false);
          es.close();
          setTimeout(connectSSE, 5000);
        };
        es.addEventListener('change', () => {
          refreshData();
        });
        es.onmessage = () => {
          refreshData();
        };
      } catch (e) {
        setLiveConnected(false);
      }
    }
    connectSSE();

    // Fallback poll every 5s
    pollRef.current = setInterval(refreshData, 5000);

    return () => {
      if (sseRef.current) sseRef.current.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);  // eslint-disable-line

  // ── Keyboard shortcuts ──

  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === 'Escape') {
        if (selectedSession) {
          setSelectedSession(null);
          return;
        }
      }

      if (!selectedSession && !inInput) {
        if (e.key === '/') {
          e.preventDefault();
          if (searchRef.current) searchRef.current.focus();
          return;
        }
        if (e.key === 'j') {
          setSelectedRowIndex(i => Math.min(i + 1, filteredSorted.length - 1));
          return;
        }
        if (e.key === 'k') {
          setSelectedRowIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' && selectedRowIndex >= 0) {
          const s = filteredSorted[selectedRowIndex];
          if (s) setSelectedSession(s);
          return;
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });  // runs every render to capture fresh filteredSorted

  // ── Filtering & Sorting ──

  const filtered = sessions.filter(s => {
    if (selectedProject && s.projectPath !== selectedProject) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (s.summary || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q) ||
        (s.model || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredSorted = [...filtered].sort((a, b) => {
    let av, bv;
    switch (sortKey) {
      case 'date':
        av = new Date(a.startTime || 0).getTime();
        bv = new Date(b.startTime || 0).getTime();
        break;
      case 'tokens': {
        const ta = a.tokens || {};
        const tb = b.tokens || {};
        av = (ta.input || 0) + (ta.output || 0) + (ta.cacheRead || 0) + (ta.cacheWrite || 0);
        bv = (tb.input || 0) + (tb.output || 0) + (tb.cacheRead || 0) + (tb.cacheWrite || 0);
        break;
      }
      case 'cost':
        av = a.cost || 0;
        bv = b.cost || 0;
        break;
      case 'duration':
        av = a.duration || 0;
        bv = b.duration || 0;
        break;
      default:
        av = 0; bv = 0;
    }
    return sortOrder === 'asc' ? av - bv : bv - av;
  });

  // ── Sort header click ──

  function handleSort(key) {
    if (sortKey === key) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  }

  function sortArrow(key) {
    if (sortKey !== key) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  }

  // ── CSV Export ──

  function exportCSV() {
    const rows = [['Date', 'Summary', 'Model', 'Tokens', 'Cost', 'Duration']];
    filteredSorted.forEach(s => {
      rows.push([
        fmtDate(s.startTime),
        '"' + (s.summary || '').replace(/"/g, '""') + '"',
        s.model || '',
        fmtTokens(s.tokens),
        fmtCost(s.cost),
        fmtDuration(s.duration)
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mission-control-sessions.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Session updated (from modal) ──

  function handleSessionUpdated(updated) {
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedSession(updated);
  }

  // ── Render ──

  const totalSessionCount = sessions.length;
  const projectSessionCount = selectedProject
    ? sessions.filter(s => s.projectPath === selectedProject).length
    : totalSessionCount;

  return h('div', { className: 'app' },

    // TOP BAR
    h('div', { className: 'top-bar' },
      h('div', { className: 'logo' }, 'MISSION-CONTROL'),
      h('div', { className: 'stat-item' },
        h('div', { className: 'stat-label' }, 'Projects'),
        h('div', { className: 'stat-value' }, stats.projectCount || 0)
      ),
      h('div', { className: 'stat-item' },
        h('div', { className: 'stat-label' }, 'Sessions'),
        h('div', { className: 'stat-value' }, stats.sessionCount || 0)
      ),
      h('div', { className: 'stat-item cost' },
        h('div', { className: 'stat-label' }, 'Total Cost'),
        h('div', { className: 'stat-value' }, '$' + (stats.totalCost || 0).toFixed(4))
      ),
      h('div', { className: 'stat-item time' },
        h('div', { className: 'stat-label' }, 'Time Saved'),
        h('div', { className: 'stat-value' }, (stats.timeSaved || 0).toFixed(1) + 'h')
      ),
      h('div', { className: 'top-bar-spacer' }),
      h('div', { className: 'live-indicator' },
        h('div', { className: 'live-dot' + (liveConnected ? ' active' : '') }),
        liveConnected ? 'live' : 'polling'
      )
    ),

    // MAIN
    h('div', { className: 'main-layout' },

      // SIDEBAR
      h('div', { className: 'sidebar' },
        h('div', { className: 'sidebar-section-label' }, 'Projects'),
        h('div', {
          className: 'sidebar-item' + (selectedProject === null ? ' active' : ''),
          onClick: () => setSelectedProject(null)
        },
          h('span', { className: 'project-name' }, 'All Projects'),
          h('span', { className: 'project-count' }, totalSessionCount)
        ),
        ...projects.map((p, i) =>
          h('div', {
            key: i,
            className: 'sidebar-item' + (selectedProject === p.path ? ' active' : ''),
            onClick: () => setSelectedProject(p.path)
          },
            h('span', { className: 'project-name', title: p.path }, p.name || p.path),
            h('span', { className: 'project-count' }, p.sessionCount || 0)
          )
        )
      ),

      // CONTENT
      h('div', { className: 'content' },

        // SEARCH + EXPORT BAR
        h('div', { className: 'search-bar' },
          h('input', {
            type: 'text',
            className: 'search-input',
            placeholder: 'search sessions...',
            value: searchQuery,
            ref: searchRef,
            onChange: e => setSearchQuery(e.target.value)
          }),
          h('button', { className: 'export-btn', onClick: exportCSV }, 'Export CSV'),
          h('button', {
            className: 'charts-toggle',
            onClick: () => {
              setShowCharts(v => !v);
              if (!showCharts) fetchCharts();
            }
          }, showCharts ? 'Charts ▴' : 'Charts ▾')
        ),

        // CHARTS
        showCharts ? h(ChartsPanel, { dailyStats, monthlyStats }) : null,

        // TABLE
        loading
          ? h('div', { className: 'loading' }, 'Loading...')
          : h('table', { className: 'session-table' },
              h('thead', null,
                h('tr', null,
                  h('th', {
                    className: sortKey === 'date' ? 'sort-active' : '',
                    onClick: () => handleSort('date')
                  }, 'Date', h('span', { className: 'sort-arrow' }, sortArrow('date'))),
                  h('th', null, 'Summary'),
                  h('th', null, 'Model'),
                  h('th', {
                    className: sortKey === 'tokens' ? 'sort-active' : '',
                    onClick: () => handleSort('tokens')
                  }, 'Tokens', h('span', { className: 'sort-arrow' }, sortArrow('tokens'))),
                  h('th', {
                    className: sortKey === 'cost' ? 'sort-active' : '',
                    onClick: () => handleSort('cost')
                  }, 'Cost', h('span', { className: 'sort-arrow' }, sortArrow('cost'))),
                  h('th', {
                    className: sortKey === 'duration' ? 'sort-active' : '',
                    onClick: () => handleSort('duration')
                  }, 'Duration', h('span', { className: 'sort-arrow' }, sortArrow('duration'))),
                  h('th', null, 'Status')
                )
              ),
              h('tbody', null,
                filteredSorted.length === 0
                  ? h('tr', null,
                      h('td', { colSpan: 7, className: 'no-sessions' },
                        searchQuery ? 'no sessions match your search' : 'no sessions yet'
                      )
                    )
                  : filteredSorted.map((s, i) =>
                      h('tr', {
                        key: s.id || i,
                        className: selectedRowIndex === i ? 'row-selected' : '',
                        onClick: () => {
                          setSelectedRowIndex(i);
                          setSelectedSession(s);
                        }
                      },
                        h('td', null, fmtDate(s.startTime)),
                        h('td', null, truncate(s.summary, 60)),
                        h('td', null, h(ModelBadge, { model: s.model })),
                        h('td', null, fmtTokens(s.tokens)),
                        h('td', { style: { color: '#ffaa00' } }, fmtCost(s.cost)),
                        h('td', null, fmtDuration(s.duration)),
                        h('td', null, h(StatusDot, { status: s.status }))
                      )
                    )
              )
            )
      )
    ),

    // MODAL
    selectedSession
      ? h(SessionModal, {
          session: selectedSession,
          onClose: () => setSelectedSession(null),
          onUpdated: handleSessionUpdated
        })
      : null
  );
}

// ── Bootstrap ────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(h(App));
