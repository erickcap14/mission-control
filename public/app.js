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

function fmtCount(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
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

// ── Usage Dashboard ──────────────────────────────────────────

function UsageDashboard({ usageStats }) {
  if (!usageStats) return h('div', { className: 'loading' }, 'Loading...');

  const { plan, currentPeriod, daysRemaining, hoursUntilReset, minutesUntilReset,
          periodStart, periodEnd, overageCost, usagePercent, dailyBurnRate,
          daysUntilExhausted, fiveHourWindow } = usageStats;
  const { totalTokens, totalCost, sessionCount, byModel, dailyBreakdown } = currentPeriod;

  const weeklyBudget = plan.monthlyBudget;
  const hasLimit = weeklyBudget != null;
  const progressColor = usagePercent != null
    ? (usagePercent >= 90 ? '#ff6b6b' : usagePercent >= 70 ? '#ffaa00' : '#00d966')
    : '#00d966';

  const resetStr = daysRemaining > 1
    ? `${daysRemaining}d ${hoursUntilReset % 24}h`
    : `${hoursUntilReset}h ${minutesUntilReset % 60}m`;

  const modelRows = Object.entries(byModel)
    .map(([model, d]) => ({ model, ...d }))
    .sort((a, b) => b.cost - a.cost);
  const maxModelCost = Math.max(...modelRows.map(r => r.cost), 0.0001);

  // 5-hour window reset countdown
  const fiveHrResetStr = fiveHourWindow
    ? (fiveHourWindow.hoursUntilReset > 0
        ? `${fiveHourWindow.hoursUntilReset}h ${fiveHourWindow.minutesUntilReset % 60}m`
        : `${fiveHourWindow.minutesUntilReset}m`)
    : null;

  return h('div', { className: 'usage-dashboard' },

    // ── Weekly period card ──────────────────────────────────────────────────
    h('div', { className: 'usage-card' },
      h('div', { className: 'usage-card-header' },
        h('div', { className: 'usage-plan-name' }, plan.name || 'Unknown'),
        h('div', { className: 'usage-plan-limit' },
          plan.monthlyCostLimit != null
            ? '$' + plan.monthlyCostLimit.toFixed(2) + ' / mo subscription'
            : 'pay-as-you-go'
        )
      ),

      hasLimit ? h('div', { className: 'usage-progress-section' },
        h('div', { className: 'usage-progress-labels' },
          h('span', null, 'this month vs monthly budget'),
          h('span', null, (usagePercent || 0).toFixed(1) + '%')
        ),
        h('div', { className: 'usage-progress-track' },
          h('div', {
            className: 'usage-progress-fill',
            style: { width: Math.min(usagePercent || 0, 100) + '%', background: progressColor }
          })
        ),
        (() => {
          if (!dailyBurnRate) return null;
          if (totalCost > weeklyBudget) {
            const daysAgo = Math.round((totalCost - weeklyBudget) / dailyBurnRate);
            return h('div', { className: 'usage-projection' },
              'monthly budget exceeded ~' + daysAgo + 'd ago'
            );
          }
          if (daysUntilExhausted != null) {
            return h('div', { className: 'usage-projection' },
              'at current burn rate, monthly budget in ~' + Math.round(daysUntilExhausted) + 'd'
            );
          }
          return null;
        })()
      ) : null,

      h('div', { className: 'usage-metrics-row' },
        h('div', { className: 'usage-metric' },
          h('div', { className: 'usage-metric-label' }, 'Month Cost'),
          h('div', { className: 'usage-metric-value cost' }, fmtCost(totalCost))
        ),
        h('div', { className: 'usage-metric' },
          h('div', { className: 'usage-metric-label' }, 'Sessions'),
          h('div', { className: 'usage-metric-value' }, sessionCount)
        ),
        h('div', { className: 'usage-metric' },
          h('div', { className: 'usage-metric-label' }, 'Daily Burn'),
          h('div', { className: 'usage-metric-value cost' }, fmtCost(dailyBurnRate))
        ),
        h('div', { className: 'usage-metric' },
          h('div', { className: 'usage-metric-label' }, 'Total Tokens'),
          h('div', { className: 'usage-metric-value' }, fmtCount(totalTokens.total))
        )
      ),

      h('div', { className: 'usage-reset-row' },
        h('div', { className: 'usage-reset-label' }, 'Monthly reset in'),
        h('div', { className: 'usage-countdown' }, resetStr),
        h('div', { className: 'usage-period-range' }, periodStart + ' → ' + periodEnd)
      )
    ),

    // ── 5-hour rolling window card ─────────────────────────────────────────
    h('div', { className: 'usage-card' },
      h('div', { className: 'usage-card-header' },
        h('div', { className: 'usage-plan-name' }, '5-Hour Window'),
        fiveHourWindow && fiveHourWindow.active
          ? h('div', { className: 'usage-plan-limit', style: { color: '#00d966' } }, 'active')
          : h('div', { className: 'usage-plan-limit', style: { color: '#666' } }, 'no recent activity')
      ),
      fiveHourWindow
        ? h('div', null,
            h('div', { className: 'usage-metrics-row' },
              h('div', { className: 'usage-metric' },
                h('div', { className: 'usage-metric-label' }, 'Window Cost'),
                h('div', { className: 'usage-metric-value cost' }, fmtCost(fiveHourWindow.totalCost))
              ),
              h('div', { className: 'usage-metric' },
                h('div', { className: 'usage-metric-label' }, 'Sessions'),
                h('div', { className: 'usage-metric-value' }, fiveHourWindow.sessionCount)
              ),
              h('div', { className: 'usage-metric' },
                h('div', { className: 'usage-metric-label' }, 'Tokens'),
                h('div', { className: 'usage-metric-value' }, fmtCount(fiveHourWindow.totalTokens.total))
              )
            ),
            fiveHourWindow.active
              ? h('div', { className: 'usage-reset-row' },
                  h('div', { className: 'usage-reset-label' }, 'Window resets in'),
                  h('div', { className: 'usage-countdown' }, fiveHrResetStr),
                  h('div', { className: 'usage-period-range' },
                    new Date(fiveHourWindow.windowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    + ' → '
                    + new Date(fiveHourWindow.windowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  )
                )
              : h('div', { className: 'usage-period-range', style: { padding: '8px 0', color: '#666' } },
                  'window expired — next starts with your next prompt'
                )
          )
        : h('div', { className: 'usage-period-range', style: { padding: '8px 0', color: '#666' } },
            'no sessions in the past 5 hours'
          )
    ),

    overageCost > 0 ? h('div', { className: 'usage-card usage-overage-card' },
      h('div', { className: 'usage-overage-header' }, 'Over Monthly Budget'),
      h('div', { className: 'usage-overage-amount' }, fmtCost(overageCost)),
      h('div', { className: 'usage-overage-desc' },
        plan.paygAfterLimit ? 'billed as pay-as-you-go' : 'over monthly budget'
      )
    ) : null,

    h('div', { className: 'usage-card' },
      h('div', { className: 'usage-card-title' }, 'Token Breakdown'),
      h('div', { className: 'usage-token-grid' },
        h('div', { className: 'usage-token-cell' },
          h('div', { className: 'usage-token-label' }, 'Input'),
          h('div', { className: 'usage-token-value' }, fmtCount(totalTokens.input))
        ),
        h('div', { className: 'usage-token-cell' },
          h('div', { className: 'usage-token-label' }, 'Output'),
          h('div', { className: 'usage-token-value' }, fmtCount(totalTokens.output))
        ),
        h('div', { className: 'usage-token-cell' },
          h('div', { className: 'usage-token-label' }, 'Cache Read'),
          h('div', { className: 'usage-token-value' }, fmtCount(totalTokens.cacheRead))
        ),
        h('div', { className: 'usage-token-cell' },
          h('div', { className: 'usage-token-label' }, 'Cache Write'),
          h('div', { className: 'usage-token-value' }, fmtCount(totalTokens.cacheWrite))
        )
      )
    ),

    modelRows.length > 0 ? h('div', { className: 'usage-card' },
      h('div', { className: 'usage-card-title' }, 'Model Breakdown'),
      h('table', { className: 'usage-model-table' },
        h('thead', null,
          h('tr', null,
            h('th', null, 'Model'),
            h('th', null, 'Sessions'),
            h('th', null, 'Tokens'),
            h('th', null, 'Cost'),
            h('th', null, '% of Total')
          )
        ),
        h('tbody', null,
          ...modelRows.map((r, i) =>
            h('tr', { key: i },
              h('td', null, h(ModelBadge, { model: r.model })),
              h('td', null, r.sessions),
              h('td', null, fmtCount(r.tokens)),
              h('td', { style: { color: '#ffaa00' } }, fmtCost(r.cost)),
              h('td', null,
                h('div', { className: 'usage-pct-bar' },
                  h('div', {
                    className: 'usage-pct-fill',
                    style: { width: (r.cost / maxModelCost * 80) + 'px' }
                  }),
                  h('span', null, totalCost > 0 ? (r.cost / totalCost * 100).toFixed(1) + '%' : '0%')
                )
              )
            )
          )
        )
      )
    ) : null,

    dailyBreakdown.length > 0 ? h('div', { className: 'usage-card' },
      h('div', { className: 'usage-card-title' }, 'Daily Cost — This Month'),
      h(BarChart, { data: dailyBreakdown, xKey: 'date', yKey: 'cost', color: '#00d966', height: 130 })
    ) : null
  );
}

// ── Toolkit Panel ────────────────────────────────────────────

function ToolkitPanel({ toolkitData }) {
  if (!toolkitData) return h('div', { className: 'loading' }, 'Loading...');

  const { skills, mcpServers, plugins, globalSettings } = toolkitData;

  return h('div', { className: 'usage-dashboard' },

    h('div', { className: 'usage-card' },
      h('div', { className: 'modal-section-label' }, 'skills, commands & hooks'),
      h('div', { style: { color: '#555', fontSize: '11px', marginBottom: '12px' } },
        (skills && skills.length > 0)
          ? skills.filter(s => s.type === 'skill').length + ' skills · ' +
            skills.filter(s => s.type === 'command').length + ' commands · ' +
            skills.filter(s => s.type === 'hook').length + ' hooks'
          : 'no skills, commands, or hooks found'
      ),
      skills && skills.length > 0
        ? h('table', { className: 'usage-model-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Name'),
                h('th', null, 'Type'),
                h('th', null, 'Description'),
                h('th', null, 'Sources'),
                h('th', { style: { textAlign: 'right' } }, 'Uses')
              )
            ),
            h('tbody', null,
              ...skills.map((sk, i) =>
                h('tr', { key: i },
                  h('td', null,
                    h('span', { style: { fontFamily: "'IBM Plex Mono', monospace", color: sk.type === 'hook' ? '#ffaa00' : sk.type === 'skill' ? '#00d966' : sk.type === 'command' ? '#00b4d8' : '#888', fontSize: '11px' } }, sk.name)
                  ),
                  h('td', null,
                    h('span', {
                      style: {
                        fontSize: '10px',
                        padding: '1px 5px',
                        border: '1px solid ' + (sk.type === 'hook' ? '#ffaa00' : sk.type === 'skill' ? '#00d966' : sk.type === 'command' ? '#00b4d8' : '#555'),
                        color: sk.type === 'hook' ? '#ffaa00' : sk.type === 'skill' ? '#00d966' : sk.type === 'command' ? '#00b4d8' : '#888',
                        fontFamily: "'IBM Plex Mono', monospace",
                      }
                    }, sk.type || 'command')
                  ),
                  h('td', { style: { color: '#888', fontSize: '11px' } },
                    h('span', { className: 'tooltip-wrap' },
                      truncate(sk.description, 50),
                      sk.description && sk.description.length > 50
                        ? h('span', { className: 'tooltip-box' }, sk.description)
                        : null
                    )
                  ),
                  h('td', null,
                    sk.sources && sk.sources.map((src, j) =>
                      h('span', {
                        key: j,
                        style: {
                          marginRight: '4px',
                          color: src === 'global' ? '#ffaa00' : '#555',
                          fontSize: '11px'
                        }
                      }, src + (j < sk.sources.length - 1 ? ',' : ''))
                    )
                  ),
                  h('td', { style: { textAlign: 'right', color: sk.usageCount > 0 ? '#00d966' : '#333', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace" } },
                    sk.usageCount == null ? '—' : sk.usageCount
                  )
                )
              )
            )
          )
        : null
    ),

    h('div', { className: 'usage-card' },
      h('div', { className: 'modal-section-label' }, 'mcp servers'),
      h('div', { style: { color: '#555', fontSize: '11px', marginBottom: '12px' } },
        (mcpServers && mcpServers.length > 0)
          ? mcpServers.length + ' server' + (mcpServers.length !== 1 ? 's' : '') + ' configured'
          : 'no mcp servers found'
      ),
      mcpServers && mcpServers.length > 0
        ? h('table', { className: 'usage-model-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Name'),
                h('th', null, 'Command'),
                h('th', null, 'Sources')
              )
            ),
            h('tbody', null,
              ...mcpServers.map((srv, i) =>
                h('tr', { key: i },
                  h('td', { style: { fontFamily: "'IBM Plex Mono', monospace", color: '#00b4d8', fontSize: '11px' } }, srv.name),
                  h('td', { style: { color: '#888', fontSize: '11px' } },
                    h('span', { className: 'tooltip-wrap', style: { fontFamily: "'IBM Plex Mono', monospace" } },
                      truncate(srv.description, 60),
                      srv.description && srv.description.length > 60
                        ? h('span', { className: 'tooltip-box' }, srv.description)
                        : null
                    )
                  ),
                  h('td', null,
                    srv.sources && srv.sources.map((src, j) =>
                      h('span', {
                        key: j,
                        style: {
                          marginRight: '4px',
                          color: src === 'global' ? '#ffaa00' : '#555',
                          fontSize: '11px'
                        }
                      }, src + (j < srv.sources.length - 1 ? ',' : ''))
                    )
                  )
                )
              )
            )
          )
        : null
    ),

    h('div', { className: 'usage-card' },
      h('div', { className: 'modal-section-label' }, 'plugins'),
      plugins && plugins.length > 0
        ? h('table', { className: 'usage-model-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, 'Name'),
                h('th', null, 'Scope'),
                h('th', null, 'Version'),
                h('th', null, 'Installed')
              )
            ),
            h('tbody', null,
              ...plugins.map((pl, i) =>
                h('tr', { key: i },
                  h('td', { style: { fontFamily: "'IBM Plex Mono', monospace", color: '#00d966', fontSize: '11px' } }, pl.name),
                  h('td', { style: { color: '#888', fontSize: '11px' } }, pl.scope || '—'),
                  h('td', { style: { color: '#888', fontSize: '11px' } }, pl.version || '—'),
                  h('td', { style: { color: '#555', fontSize: '11px' } }, fmtDate(pl.installedAt))
                )
              )
            )
          )
        : h('div', { style: { color: '#555', fontSize: '11px' } }, 'no installed plugins')
    ),

    h('div', { className: 'usage-card' },
      h('div', { className: 'modal-section-label' }, 'global settings'),
      h('div', { style: { color: '#555', fontSize: '10px', marginBottom: '8px' } }, '~/.claude/settings.json'),
      h('pre', {
        style: {
          background: '#0a0e17',
          padding: '12px',
          fontSize: '11px',
          overflowX: 'auto',
          color: '#888',
          maxHeight: '400px',
          overflowY: 'auto',
          margin: 0,
          fontFamily: "'IBM Plex Mono', monospace",
          lineHeight: '1.5'
        }
      }, JSON.stringify(globalSettings, null, 2))
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
  const [showCharts, setShowCharts] = useState(true);
  const [view, setView] = useState('sessions');
  const [usageStats, setUsageStats] = useState(null);
  const [toolkitData, setToolkitData] = useState(null);
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

  const fetchUsageStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/usage-stats`);
      if (res.ok) setUsageStats(await res.json());
    } catch (e) { /* silent */ }
  }, []);

  const fetchToolkit = useCallback(async () => {
    try {
      const res = await fetch(`${API}/toolkit`);
      if (res.ok) setToolkitData(await res.json());
    } catch (err) {
      console.error('toolkit fetch failed', err);
    }
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

  const topBarSessions = selectedProject
    ? sessions.filter(s => s.projectPath === selectedProject)
    : sessions;
  const topBarCost = selectedProject
    ? topBarSessions.reduce((sum, s) => sum + (s.cost || 0), 0)
    : stats.totalCost || 0;
  const topBarTokens = topBarSessions.reduce((sum, s) => {
    const t = s.tokens || {};
    return sum + (t.input || 0) + (t.output || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0);
  }, 0);

  return h('div', { className: 'app' },

    // TOP BAR
    h('div', { className: 'top-bar' },
      h('div', { className: 'logo' }, 'MISSION-CONTROL'),
      h('div', { className: 'top-bar-nav' },
        h('button', {
          className: 'nav-btn' + (view === 'sessions' ? ' active' : ''),
          onClick: () => setView('sessions')
        }, 'Sessions'),
        h('button', {
          className: 'nav-btn' + (view === 'usage' ? ' active' : ''),
          onClick: () => {
            setView('usage');
            if (!usageStats) fetchUsageStats();
          }
        }, 'Usage'),
        h('button', {
          className: 'nav-btn' + (view === 'toolkit' ? ' active' : ''),
          onClick: () => {
            setView('toolkit');
            if (!toolkitData) fetchToolkit();
          }
        }, 'Toolkit')
      ),
      h('div', { className: 'stat-item' },
        h('div', { className: 'stat-label' }, selectedProject ? 'Project' : 'Projects'),
        h('div', { className: 'stat-value' }, selectedProject ? 1 : stats.projectCount || 0)
      ),
      h('div', { className: 'stat-item' },
        h('div', { className: 'stat-label' }, 'Sessions'),
        h('div', { className: 'stat-value' }, selectedProject ? topBarSessions.length : stats.sessionCount || 0)
      ),
      h('div', { className: 'stat-item cost' },
        h('div', { className: 'stat-label' }, 'Cost'),
        h('div', { className: 'stat-value' }, '$' + topBarCost.toFixed(4))
      ),
      h('div', { className: 'stat-item' },
        h('div', { className: 'stat-label' }, 'Tokens'),
        h('div', { className: 'stat-value' }, fmtCount(topBarTokens))
      ),
      h('div', { className: 'top-bar-spacer' }),
      h('div', { className: 'live-indicator' },
        h('div', { className: 'live-dot' + (liveConnected ? ' active' : '') }),
        liveConnected ? 'live' : 'polling'
      )
    ),

    // MAIN
    view === 'usage'
      ? h('div', { className: 'main-layout' },
          h('div', { className: 'content' }, h(UsageDashboard, { usageStats }))
        )
      : view === 'toolkit'
      ? h('div', { className: 'main-layout' },
          h('div', { className: 'content' }, h(ToolkitPanel, { toolkitData }))
        )
      : h('div', { className: 'main-layout' },

      // SIDEBAR
      h('div', { className: 'sidebar' },
        h('div', { className: 'sidebar-section-label' }, 'Projects'),
        h('div', {
          className: 'sidebar-item' + (selectedProject === null ? ' active' : ''),
          onClick: () => setSelectedProject(null)
        },
          h('span', { className: 'project-name' }, 'All Projects'),
          h('span', { className: 'project-meta' },
            h('span', { className: 'project-cost' }, fmtCost(stats.totalCost)),
            h('span', { className: 'project-count' }, totalSessionCount + ' sessions')
          )
        ),
        ...projects.map((p, i) =>
          h('div', {
            key: i,
            className: 'sidebar-item' + (selectedProject === p.path ? ' active' : ''),
            onClick: () => setSelectedProject(p.path)
          },
            h('span', { className: 'project-name', title: p.path }, p.name || p.path),
            h('span', { className: 'project-meta' },
              h('span', { className: 'project-cost' }, p.totalCost > 0 ? fmtCost(p.totalCost) : ''),
              h('span', { className: 'project-count' }, (p.sessionCount || 0) + ' sessions')
            )
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
