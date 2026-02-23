import { Controller, Get, Header } from '@nestjs/common';
import { SlackService } from '../slack/slack.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly slackService: SlackService) {}

  @Get('channels')
  async getChannels() {
    try {
      return await this.slackService.getChannelStatuses();
    } catch (e) {
      return { error: e.message };
    }
  }

  @Get()
  @Header('Content-Type', 'text/html')
  getDashboard(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Linkup GTM Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
    .subtitle { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
    .stats { display: flex; gap: 12px; margin-bottom: 20px; }
    .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; min-width: 120px; cursor: pointer; transition: border-color 0.15s; }
    .stat:hover { border-color: #58a6ff; }
    .stat.active { border-color: #58a6ff; background: #1c2128; }
    .stat-value { font-size: 24px; font-weight: 700; }
    .stat-label { font-size: 11px; color: #8b949e; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
    th { text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #30363d; }
    td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #21262d; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1c2128; }
    .yes { color: #3fb950; font-weight: 600; }
    .no { color: #f85149; font-weight: 600; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .dot-yes { background: #3fb950; }
    .dot-no { background: #f85149; }
    .loading { text-align: center; padding: 40px; color: #8b949e; }
    .refresh { background: #21262d; border: 1px solid #30363d; color: #e1e4e8; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .refresh:hover { background: #30363d; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .channel-name { color: #58a6ff; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Linkup GTM Dashboard</h1>
      <div class="subtitle">Slack channel automation monitoring</div>
    </div>
    <button class="refresh" onclick="loadData()">Refresh</button>
  </div>
  <div class="stats" id="stats"></div>
  <div id="content"><div class="loading">Loading channels...</div></div>
  <script>
    let allChannels = [];
    let activeFilter = 'all';

    const filters = {
      all: () => allChannels,
      external: (chs) => chs.filter(c => c.hasExternalUser),
      setup: (chs) => chs.filter(c => c.hasExternalUser && c.phil && c.sasha && c.boris),
      attention: (chs) => chs.filter(c => c.hasExternalUser && (!c.phil || !c.sasha || !c.boris)),
    };

    async function loadData() {
      document.getElementById('content').innerHTML = '<div class="loading">Loading channels...</div>';
      try {
        const res = await fetch('/dashboard/channels');
        const data = await res.json();
        if (data.error) { throw new Error(data.error); }
        allChannels = data;
        renderStats();
        renderTable(filters[activeFilter](allChannels));
      } catch (e) {
        document.getElementById('content').innerHTML = '<div class="loading">Error loading data: ' + e.message + '</div>';
      }
    }

    function setFilter(filter) {
      activeFilter = filter;
      document.querySelectorAll('.stat').forEach(el => el.classList.remove('active'));
      const el = document.querySelector('[data-filter="' + filter + '"]');
      if (el) el.classList.add('active');
      renderTable(filters[filter](allChannels));
    }

    function renderStats() {
      const total = allChannels.length;
      const withExternal = filters.external(allChannels).length;
      const fullySetup = filters.setup(allChannels).length;
      const needsAttention = filters.attention(allChannels).length;
      document.getElementById('stats').innerHTML =
        stat(total, 'Total Channels', null, 'all') +
        stat(withExternal, 'External Joined', null, 'external') +
        stat(fullySetup, 'Fully Setup', null, 'setup') +
        stat(needsAttention, 'Needs Attention', needsAttention > 0 ? '#f85149' : null, 'attention');
      document.querySelector('[data-filter="' + activeFilter + '"]')?.classList.add('active');
    }

    function stat(value, label, color, filter) {
      return '<div class="stat' + (activeFilter === filter ? ' active' : '') + '" data-filter="' + filter + '" onclick="setFilter(\\'' + filter + '\\')">' +
        '<div class="stat-value"' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</div>' +
        '<div class="stat-label">' + label + '</div></div>';
    }

    function renderTable(channels) {
      if (channels.length === 0) {
        document.getElementById('content').innerHTML = '<div class="loading">No channels match this filter</div>';
        return;
      }
      let html = '<table><thead><tr><th>Channel</th><th>Created</th><th>External User</th><th>Phil</th><th>Sasha</th><th>Boris</th></tr></thead><tbody>';
      for (const ch of channels) {
        html += '<tr>';
        html += '<td class="channel-name">#' + ch.name + '</td>';
        html += '<td>' + new Date(ch.created * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</td>';
        html += badge(ch.hasExternalUser);
        html += badge(ch.phil);
        html += badge(ch.sasha);
        html += badge(ch.boris);
        html += '</tr>';
      }
      html += '</tbody></table>';
      document.getElementById('content').innerHTML = html;
    }

    function badge(val) {
      return '<td><span class="dot ' + (val ? 'dot-yes' : 'dot-no') + '"></span><span class="' + (val ? 'yes' : 'no') + '">' + (val ? 'Yes' : 'No') + '</span></td>';
    }

    loadData();
  </script>
</body>
</html>`;
  }
}
