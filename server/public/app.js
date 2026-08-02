/* =====================================================================
   Personal NAS — Dashboard SPA
   app.js — Auth, Router, API helpers, Upload Modal, Responsive Drawer
   ===================================================================== */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const API_BASE = '';

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('nas_token'),
  setToken: (t) => localStorage.setItem('nas_token', t),
  clear:    () => localStorage.removeItem('nas_token'),
  headers:  () => ({ 'Authorization': `Bearer ${Auth.getToken()}`, 'Content-Type': 'application/json' })
};

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function api(method, endpoint, body) {
  const opts = { method, headers: Auth.headers() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + endpoint, opts);
  if (res.status === 401 || res.status === 403) {
    Auth.clear();
    showLogin();
    return null;
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
const GET    = (ep)      => api('GET', ep);
const POST   = (ep, b)   => api('POST', ep, b);
const DELETE = (ep, b)   => api('DELETE', ep, b);

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function fileIcon(ext, isDir) {
  if (isDir) return '📁';
  const map = {
    jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', webp:'🖼️', bmp:'🖼️', svg:'🖼️',
    mp4:'🎬', mkv:'🎬', avi:'🎬', mov:'🎬', wmv:'🎬', webm:'🎬',
    mp3:'🎵', flac:'🎵', wav:'🎵', aac:'🎵', ogg:'🎵', m4a:'🎵',
    pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📊', pptx:'📊',
    txt:'📃', md:'📃', log:'📃', csv:'📃',
    zip:'📦', rar:'📦', '7z':'📦', tar:'📦', gz:'📦',
    exe:'⚙️', msi:'⚙️', bat:'⚙️', cmd:'⚙️', ps1:'⚙️',
    js:'💻', ts:'💻', py:'💻', json:'💻', html:'💻', css:'💻',
    iso:'💿',
  };
  return map[(ext||'').toLowerCase()] || '📄';
}

function activityIcon(type) {
  const map = { auth:'🔑', browse:'📂', stream:'▶️', upload:'⬆️', storage:'💾', tunnel:'🌐' };
  return map[type] || '📋';
}

function pctClass(pct) {
  if (pct > 90) return 'danger';
  if (pct > 70) return 'warn';
  return '';
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(24px)'; el.style.transition='0.3s'; setTimeout(()=>el.remove(),300); }, 3200);
}

// ─── MODAL HELPER ─────────────────────────────────────────────────────────────
function showModal({ title, body, footer }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') close(); });
  return close;
}

// ─── CIRCULAR GAUGE SVG ───────────────────────────────────────────────────────
function makeGauge(pct, size = 70) {
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100 * circ).toFixed(2);
  const cls = pct > 90 ? 'danger' : pct > 70 ? 'warn' : '';
  return `
    <div class="gauge-container" style="width:${size}px;height:${size}px">
      <svg class="gauge" width="${size}" height="${size}" viewBox="0 0 36 36">
        <path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
        <path class="gauge-fill ${cls}" stroke-dasharray="${dash},${circ}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
      </svg>
      <div class="gauge-label">
        <div class="gauge-pct" style="font-size:${size > 60 ? 14 : 11}px">${pct}%</div>
      </div>
    </div>`;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-overlay').classList.remove('hidden');
}

function showApp() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function doLogin(credentials) {
  const body = typeof credentials === 'string' ? { passcode: credentials } : credentials;
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  Auth.setToken(data.token);
}

async function doRegister(username, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  Auth.setToken(data.token);
}

// ─── SIDEBAR & MOBILE DRAWER STATE ────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.add('hidden');
    } else {
      sidebar.classList.add('mobile-open');
      backdrop.classList.remove('hidden');
    }
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

function closeMobileSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebar-backdrop').classList.add('hidden');
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
const pages = { dashboard, storage, files, gallery, backup, remote, settings };
const titles = {
  dashboard: 'Dashboard', storage: 'Storage', files: 'Files', gallery: 'Media Gallery',
  backup: 'Backup Center', remote: 'Remote Access', settings: 'Settings'
};
let currentPage = 'dashboard';

function navigate(page, params = null) {
  currentPage = page;
  closeMobileSidebar();

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  document.getElementById('topbar-title').textContent = titles[page] || page;
  const content = document.getElementById('content');
  content.innerHTML = '<div class="page-loading"><div class="spinner large"></div><p>Loading...</p></div>';

  if (pages[page]) pages[page](content, params);
}

let activePasscode = '';
let isPasscodeVisible = false;

// ─── SYSTEM INFO (Sidebar + Topbar) ───────────────────────────────────────────
async function loadSystemInfo() {
  const r = await GET('/api/system');
  if (!r || !r.ok) return;
  const s = r.data;
  const ip = s.ipAddresses?.[0] || 'localhost';
  document.getElementById('sidebar-ip').textContent = ip;

  activePasscode = s.passcode || '';
  const display = document.getElementById('passcode-display');
  if (display) {
    display.textContent = isPasscodeVisible ? activePasscode : '••••••';
  }

  // Check tunnel status for badge
  const tr = await GET('/api/tunnel/status');
  if (tr?.data?.status === 'running') {
    document.getElementById('tunnel-badge').classList.remove('hidden');
  }
}

// ─── FILE UPLOAD MODAL ────────────────────────────────────────────────────────
async function showUploadModal(preselectedDrive = '') {
  const r = await GET('/api/drives');
  const drives = r?.data || [];

  if (drives.length === 0) {
    toast('No active drives available to upload files.', 'error');
    return;
  }

  const driveOptions = drives.map(d => `
    <option value="${d.letter}" ${d.letter === preselectedDrive ? 'selected' : ''}>
      ${d.name || d.letter} (${d.letter}) — ${formatBytes(d.freeSpace || 0)} free
    </option>`).join('');

  const modalHtml = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h3 id="modal-title">📤 Upload File to Storage</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body" id="modal-body">
          <form id="upload-form">
            <div style="margin-bottom:16px">
              <label for="upload-drive-select">Select Target Drive</label>
              <select id="upload-drive-select" class="select">${driveOptions}</select>
            </div>

            <div style="margin-bottom:16px">
              <label for="upload-folder-input">Destination Subfolder (optional)</label>
              <input id="upload-folder-input" class="input" type="text" placeholder="e.g. Documents or Photos/2026"/>
            </div>

            <div style="margin-bottom:16px">
              <label for="upload-file-input">Choose File</label>
              <input id="upload-file-input" class="input" type="file" required style="padding:6px"/>
            </div>
          </form>
        </div>
        <div class="modal-footer" id="modal-footer">
          <button class="btn btn-ghost" id="upload-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="upload-submit-btn">Upload Now</button>
        </div>
      </div>
    </div>`;

  const root = document.getElementById('modal-root');
  root.innerHTML = modalHtml;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('upload-cancel-btn').addEventListener('click', close);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') close();
  });

  document.getElementById('upload-submit-btn').addEventListener('click', () => {
    const driveLetter = document.getElementById('upload-drive-select').value;
    const subfolder = document.getElementById('upload-folder-input').value.trim();
    const fileInput = document.getElementById('upload-file-input');

    if (!fileInput.files || fileInput.files.length === 0) {
      toast('Please select a file to upload.', 'error');
      return;
    }

    const file = fileInput.files[0];
    let destination = driveLetter;
    if (!destination.endsWith('\\') && !destination.endsWith('/')) destination += '\\';
    if (subfolder) destination += subfolder;

    // Switch to Upload Progress Animation view
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    modalTitle.textContent = '📤 Uploading File...';
    modalCloseBtn.style.display = 'none';
    modalFooter.style.display = 'none';

    modalBody.innerHTML = `
      <div class="upload-modal-progress">
        <div class="upload-anim-icon">☁️ ⚡</div>
        <div class="upload-file-info">
          <div class="upload-file-name">${escapeHtml(file.name)}</div>
          <div class="upload-file-meta">Target: <span class="font-mono" style="color:var(--accent)">${escapeHtml(destination)}</span></div>
        </div>

        <div class="upload-progress-container">
          <div id="upload-progress-fill" class="upload-progress-fill"></div>
        </div>

        <div class="upload-stats-row">
          <span id="upload-bytes-label">0 B / ${formatBytes(file.size)}</span>
          <span id="upload-pct-label" class="upload-pct-badge">0%</span>
        </div>

        <div class="upload-status-sub" id="upload-status-text">Transferring file to Personal NAS...</div>
      </div>`;

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?destination=${encodeURIComponent(destination)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${Auth.getToken()}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        const fill = document.getElementById('upload-progress-fill');
        const pctLabel = document.getElementById('upload-pct-label');
        const bytesLabel = document.getElementById('upload-bytes-label');
        const statusText = document.getElementById('upload-status-text');

        if (fill) fill.style.width = pct + '%';
        if (pctLabel) pctLabel.textContent = pct + '%';
        if (bytesLabel) bytesLabel.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
        if (pct === 100 && statusText) {
          statusText.textContent = 'Finishing & saving to target drive...';
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let resp = {};
        try { resp = JSON.parse(xhr.responseText); } catch {}
        const savedPath = resp.path || `${destination}${file.name}`;

        modalTitle.textContent = '✅ Upload Confirmed';
        modalCloseBtn.style.display = 'block';
        modalFooter.style.display = 'flex';
        modalFooter.innerHTML = `
          <button class="btn btn-ghost" id="upload-another-btn">Upload Another</button>
          <button class="btn btn-primary" id="upload-done-btn">Done</button>`;

        modalBody.innerHTML = `
          <div class="upload-success-box">
            <div class="upload-success-icon">✓</div>
            <div class="upload-success-title">File Uploaded Successfully!</div>
            <div class="upload-success-desc">"${escapeHtml(file.name)}" (${formatBytes(file.size)}) has been saved to disk.</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;text-align:left">Saved location:</div>
            <div class="upload-success-path">${escapeHtml(savedPath)}</div>
          </div>`;

        toast(`Successfully uploaded "${file.name}"!`, 'success');

        document.getElementById('upload-done-btn')?.addEventListener('click', () => {
          close();
          if (currentPage === 'dashboard' || currentPage === 'storage' || currentPage === 'files' || currentPage === 'gallery') {
            navigate(currentPage);
          }
        });

        document.getElementById('upload-another-btn')?.addEventListener('click', () => {
          close();
          if (currentPage === 'dashboard' || currentPage === 'storage' || currentPage === 'files' || currentPage === 'gallery') {
            navigate(currentPage);
          }
          setTimeout(() => showUploadModal(preselectedDrive), 100);
        });

      } else {
        let errStr = 'Upload failed';
        try { errStr = JSON.parse(xhr.responseText).error || errStr; } catch {}
        toast(errStr, 'error');

        modalTitle.textContent = '❌ Upload Failed';
        modalCloseBtn.style.display = 'block';
        modalFooter.style.display = 'flex';
        modalFooter.innerHTML = `<button class="btn btn-ghost" id="upload-close-err-btn">Close</button>`;

        modalBody.innerHTML = `
          <div class="upload-success-box">
            <div class="upload-success-icon" style="border-color:var(--red);color:var(--red);background:rgba(248,81,73,0.15)">✕</div>
            <div class="upload-success-title" style="color:var(--red)">Upload Encountered an Error</div>
            <div class="upload-success-desc">${escapeHtml(errStr)}</div>
          </div>`;

        document.getElementById('upload-close-err-btn')?.addEventListener('click', close);
      }
    };

    xhr.onerror = () => {
      toast('Network error during file upload', 'error');
      close();
    };

    xhr.send(formData);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════
async function dashboard(container) {
  const [drivesR, systemR, activityR, tunnelR] = await Promise.all([
    GET('/api/drives'), GET('/api/system'), GET('/api/activity'), GET('/api/tunnel/status')
  ]);

  const drives = drivesR?.data || [];
  const sys = systemR?.data || {};
  const activity = activityR?.data || [];
  const tunnel = tunnelR?.data || {};

  const totalSize = drives.reduce((a, d) => a + (d.size || 0), 0);
  const totalFree = drives.reduce((a, d) => a + (d.freeSpace || 0), 0);
  const totalUsed = totalSize - totalFree;

  container.innerHTML = `
    <div class="page">
      <!-- Page Header -->
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h2>Storage Dashboard</h2>
          <p>Overview of your Personal NAS system</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="upload-file-btn">📤 Upload File</button>
          <button class="btn btn-ghost" id="add-storage-btn">+ Add Storage</button>
          <button class="btn btn-ghost" id="refresh-dash-btn">↻ Refresh</button>
        </div>
      </div>

      <!-- Stat Cards Row -->
      <div class="grid-4" style="margin-bottom:20px">
        <div class="card stat-card">
          <div class="stat-icon blue">💾</div>
          <div>
            <div class="stat-value">${formatBytes(totalSize)}</div>
            <div class="stat-label">Total Capacity</div>
          </div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon green">✅</div>
          <div>
            <div class="stat-value">${formatBytes(totalFree)}</div>
            <div class="stat-label">Free Space</div>
          </div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon yellow">📂</div>
          <div>
            <div class="stat-value">${drives.length}</div>
            <div class="stat-label">Drives Active</div>
          </div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon purple">⏱️</div>
          <div>
            <div class="stat-value" style="font-size:15px">${sys.uptime || '—'}</div>
            <div class="stat-label">Server Uptime</div>
          </div>
        </div>
      </div>

      <!-- Drives + Activity Grid -->
      <div class="dash-main-grid" style="margin-bottom:20px">
        <!-- Drive Cards -->
        <div>
          <div class="section-header">
            <div class="section-title">Drives</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px" id="drive-cards">
            ${drives.length === 0 ? `
              <div class="card empty-state">
                <div class="icon">💿</div>
                <h3>No drives registered</h3>
                <p>Click "Add Storage" to add a drive to your NAS.</p>
              </div>` :
              drives.map(d => renderDriveCard(d)).join('')
            }
          </div>
        </div>

        <!-- Activity + Server Info -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <!-- Server Health Card -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <span class="status-dot online"></span> Server Health
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
              <div class="flex justify-between"><span class="text-muted">Hostname</span><strong>${sys.hostname||'—'}</strong></div>
              <div class="flex justify-between"><span class="text-muted">IP Address</span><strong class="font-mono">${sys.ipAddresses?.[0]||'—'}</strong></div>
              <div class="flex justify-between"><span class="text-muted">Node.js</span><strong>${sys.nodeVersion||'—'}</strong></div>
              <div class="flex justify-between"><span class="text-muted">Port</span><strong>${sys.port||3000}</strong></div>
              <div class="flex justify-between"><span class="text-muted">mDNS</span><span class="badge badge-green">Active</span></div>
            </div>
          </div>

          <!-- Remote Access Card -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">🌐 Remote Access</div>
              <button class="btn btn-sm ${tunnel.status==='running'?'btn-danger':'btn-primary'}" id="dash-tunnel-btn">
                ${tunnel.status==='running'?'Stop Tunnel':'Start Tunnel'}
              </button>
            </div>
            ${tunnel.status === 'running' ? `
              <div style="margin-bottom:8px"><span class="badge badge-green">● Tunnel Active</span></div>
              <div class="tunnel-url-box" style="font-size:11px;margin-bottom:8px">
                <span style="flex:1;word-break:break-all">${tunnel.url}</span>
                <button onclick="navigator.clipboard.writeText('${tunnel.url}');toast('Copied!','success')" class="btn btn-ghost btn-sm">📋</button>
              </div>
            ` : `
              <div style="margin-bottom:8px"><span class="badge">⚫ Inactive</span></div>
              <p style="font-size:12px;color:var(--text-secondary)">Start a Cloudflare Tunnel to access this NAS from anywhere on the internet.</p>
            `}
          </div>

          <!-- Recent Activity -->
          <div class="card" style="flex:1">
            <div class="card-header">
              <div class="card-title">📋 Recent Activity</div>
            </div>
            ${activity.length === 0 ? '<p style="color:var(--text-secondary);font-size:13px">No activity yet.</p>' :
              activity.slice(0,8).map(a => `
                <div class="activity-item">
                  <div class="activity-icon" style="background:var(--bg-secondary)">${activityIcon(a.type)}</div>
                  <div class="activity-text">
                    <div class="activity-title">${a.detail}</div>
                    <div class="activity-time">${formatTime(a.time)}</div>
                  </div>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
    </div>`;

  // Events
  document.getElementById('upload-file-btn').addEventListener('click', () => showUploadModal());
  document.getElementById('add-storage-btn').addEventListener('click', showAddStorageModal);
  document.getElementById('refresh-dash-btn').addEventListener('click', () => navigate('dashboard'));

  document.querySelectorAll('.upload-to-drive-btn').forEach(btn => {
    btn.addEventListener('click', () => showUploadModal(btn.dataset.path));
  });

  document.getElementById('dash-tunnel-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('dash-tunnel-btn');
    btn.disabled = true; btn.textContent = 'Please wait...';
    if (tunnel.status === 'running') {
      await POST('/api/tunnel/stop');
      toast('Tunnel stopped', 'info');
    } else {
      toast('Starting tunnel — this may take 15–30 seconds...', 'info');
      const r = await POST('/api/tunnel/start');
      if (r?.ok) toast('Tunnel active: ' + r.data.url, 'success');
      else toast(r?.data?.error || 'Failed to start tunnel', 'error');
    }
    navigate('dashboard');
  });

  // Remove drive buttons
  document.querySelectorAll('.remove-drive-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const drivePath = btn.dataset.path;
      if (!confirm(`Remove "${drivePath}" from NAS? (Files will NOT be deleted)`)) return;
      const r = await DELETE('/api/drives/remove', { drivePath });
      if (r?.ok) { toast('Drive removed', 'success'); navigate('dashboard'); }
      else toast(r?.data?.error || 'Failed to remove drive', 'error');
    });
  });
}

function renderDriveCard(d) {
  const used = (d.size || 0) - (d.freeSpace || 0);
  const pct = d.size ? Math.round((used / d.size) * 100) : 0;
  const cls = pctClass(pct);
  return `
    <div class="card drive-card">
      <div class="drive-card-header">
        <div class="drive-info">
          <div class="drive-icon">${d.isUsb ? '🔌' : d.isCustom ? '🔗' : '💽'}</div>
          <div>
            <div class="drive-name">${d.name || d.letter}</div>
            <div class="drive-type">${d.letter}${d.isUsb?' · USB':d.isCustom?' · Custom':' · Internal'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge badge-green">Online</span>
          <button class="btn btn-ghost btn-sm remove-drive-btn" data-path="${d.letter}" title="Remove from NAS">✕</button>
        </div>
      </div>
      <div class="drive-gauge-wrap">
        <div class="drive-gauge-info">
          <div class="drive-gauge-title">Storage Usage</div>
          <div class="progress-bar" style="margin-bottom:8px"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
          <div class="drive-stats">
            <div class="drive-stat-item"><div class="drive-stat-value">${formatBytes(used)}</div><div class="drive-stat-label">USED</div></div>
            <div class="drive-stat-item"><div class="drive-stat-value">${formatBytes(d.freeSpace||0)}</div><div class="drive-stat-label">FREE</div></div>
            <div class="drive-stat-item"><div class="drive-stat-value">${formatBytes(d.size||0)}</div><div class="drive-stat-label">TOTAL</div></div>
            <div class="drive-stat-item"><div class="drive-stat-value">${pct}%</div><div class="drive-stat-label">USED %</div></div>
          </div>
        </div>
        ${makeGauge(pct, 72)}
      </div>
      <div class="drive-actions">
        <button class="btn btn-primary btn-sm upload-to-drive-btn" data-path="${d.letter}">📤 Upload File</button>
        <button class="btn btn-ghost btn-sm" onclick="navigate('files', { drive: '${d.letter}' })">📂 Browse Files</button>
      </div>
    </div>`;
}

// ─── ADD STORAGE MODAL ────────────────────────────────────────────────────────
async function showAddStorageModal() {
  const r = await GET('/api/drives/available');
  const available = r?.data || [];
  let selectedPath = null;

  const driveItems = available.map(d => `
    <div class="drive-select-item ${d.isRegistered ? 'registered' : ''}" data-path="${d.letter}" data-registered="${d.isRegistered}">
      <div class="drive-select-check">${d.isRegistered ? '✓' : ''}</div>
      <div style="font-size:22px">${d.isUsb?'🔌':'💽'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${d.name||d.letter}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${d.letter} · ${formatBytes(d.size||0)} total${d.isRegistered?' · Already Added':''}</div>
      </div>
    </div>`).join('');

  const close = showModal({
    title: '+ Add Storage',
    body: `
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Select a drive to add to your NAS, or enter a custom path (e.g., a network share).</p>
      ${available.length > 0 ? `<div id="drive-select-list" style="margin-bottom:20px">${driveItems}</div>` : ''}
      <hr class="divider"/>
      <div style="margin-bottom:4px">
        <label for="custom-path-input">Custom Path (optional)</label>
        <input id="custom-path-input" class="input" type="text" placeholder="e.g.  D:\\  or  \\\\server\\share" style="margin-bottom:8px"/>
        <label for="custom-label-input">Friendly Name (optional)</label>
        <input id="custom-label-input" class="input" type="text" placeholder="e.g. External Backup"/>
      </div>`,
    footer: `
      <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="modal-add-btn">Add to NAS</button>`
  });

  document.querySelectorAll('.drive-select-item:not(.registered)').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.drive-select-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      selectedPath = el.dataset.path;
      el.querySelector('.drive-select-check').textContent = '✓';
    });
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', close);
  document.getElementById('modal-add-btn').addEventListener('click', async () => {
    const customPath = document.getElementById('custom-path-input').value.trim();
    const customLabel = document.getElementById('custom-label-input').value.trim();
    const pathToAdd = customPath || selectedPath;

    if (!pathToAdd) { toast('Please select a drive or enter a custom path.', 'error'); return; }

    const btn = document.getElementById('modal-add-btn');
    btn.disabled = true; btn.textContent = 'Adding...';

    const r = await POST('/api/drives/add', { drivePath: pathToAdd, label: customLabel || pathToAdd });
    if (r?.ok) {
      toast(`"${pathToAdd}" added to NAS!`, 'success');
      close();
      navigate('dashboard');
    } else {
      toast(r?.data?.error || 'Failed to add drive', 'error');
      btn.disabled = false; btn.textContent = 'Add to NAS';
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: STORAGE
// ═════════════════════════════════════════════════════════════════════════════
async function storage(container) {
  const r = await GET('/api/drives');
  const drives = r?.data || [];

  container.innerHTML = `
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><h2>Storage</h2><p>Manage drives registered with your Personal NAS</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="upload-file-btn">📤 Upload File</button>
          <button class="btn btn-ghost" id="add-storage-btn">+ Add Storage</button>
          <button class="btn btn-ghost" id="scan-drives-btn">🔍 Scan Drives</button>
        </div>
      </div>

      ${drives.length === 0 ? `
        <div class="card empty-state">
          <div class="icon">💿</div>
          <h3>No drives registered</h3>
          <p>Click "Add Storage" to register drives with your NAS.</p>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:16px" id="storage-list">
          ${drives.map(d => {
            const used = (d.size||0) - (d.freeSpace||0);
            const pct = d.size ? Math.round((used/d.size)*100) : 0;
            const cls = pctClass(pct);
            return `
            <div class="card">
              <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
                <div style="font-size:36px">${d.isUsb?'🔌':d.isCustom?'🔗':'💽'}</div>
                <div style="flex:1;min-width:200px">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
                    <span style="font-size:18px;font-weight:700">${d.name||d.letter}</span>
                    <span class="badge badge-green">Online</span>
                    ${d.isUsb?'<span class="badge badge-purple">USB</span>':''}
                    ${d.isCustom?'<span class="badge badge-blue">Custom</span>':''}
                  </div>
                  <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Path: <span class="font-mono">${d.letter}</span></div>
                  <div class="progress-bar" style="margin-bottom:6px"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
                  <div style="display:flex;gap:16px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap">
                    <span>Used: <strong style="color:var(--text-primary)">${formatBytes(used)}</strong></span>
                    <span>Free: <strong style="color:var(--text-primary)">${formatBytes(d.freeSpace||0)}</strong></span>
                    <span>Total: <strong style="color:var(--text-primary)">${formatBytes(d.size||0)}</strong></span>
                    <span>${pct}% used</span>
                  </div>
                </div>
                ${makeGauge(pct, 80)}
                <div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:140px">
                  <button class="btn btn-primary btn-sm upload-to-drive-btn" data-path="${d.letter}">📤 Upload File</button>
                  <button class="btn btn-ghost btn-sm" onclick="navigate('files', { drive: '${d.letter}' })">📂 Browse</button>
                  <button class="btn btn-danger btn-sm remove-drive-btn" data-path="${d.letter}">Remove</button>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`
      }
    </div>`;

  document.getElementById('upload-file-btn').addEventListener('click', () => showUploadModal());
  document.getElementById('add-storage-btn').addEventListener('click', showAddStorageModal);
  document.getElementById('scan-drives-btn').addEventListener('click', () => { toast('Refreshing drives...','info'); navigate('storage'); });

  document.querySelectorAll('.upload-to-drive-btn').forEach(btn => {
    btn.addEventListener('click', () => showUploadModal(btn.dataset.path));
  });

  document.querySelectorAll('.remove-drive-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const drivePath = btn.dataset.path;
      if (!confirm(`Remove "${drivePath}" from NAS?\n(Files will NOT be deleted.)`)) return;
      const r = await DELETE('/api/drives/remove', { drivePath });
      if (r?.ok) { toast('Drive removed','success'); navigate('storage'); }
      else toast(r?.data?.error || 'Failed','error');
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: FILES
// ═════════════════════════════════════════════════════════════════════════════
let filePath = [];

async function files(container, params) {
  if (params && params.drive) {
    const cleanDrive = params.drive.replace(/[\/\\]+$/, '');
    filePath = [cleanDrive];
  } else if (!params || !params.preservePath) {
    filePath = [];
  }
  await renderFiles(container);
}

async function renderFiles(container) {
  let pathStr = filePath.join('\\');
  if (/^[a-zA-Z]:$/.test(pathStr)) {
    pathStr += '\\';
  }
  const endpoint = pathStr ? `/api/files?path=${encodeURIComponent(pathStr)}` : '/api/files';
  const r = await GET(endpoint);
  const items = r?.data || [];

  const breadcrumbs = [
    `<span class="breadcrumb-item ${filePath.length===0?'active':''}" data-idx="-1">NAS Root</span>`,
    ...filePath.map((seg, i) => `
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-item ${i===filePath.length-1?'active':''}" data-idx="${i}">${seg}</span>`)
  ].join('');

  const rows = items.map(f => {
    const ext = f.name.split('.').pop();
    const icon = fileIcon(ext, f.isDirectory);
    return `
      <tr class="file-row" data-name="${f.name}" data-path="${f.path||''}" data-isdir="${f.isDirectory}" data-ext="${ext}">
        <td><span style="margin-right:8px">${icon}</span>${f.name}</td>
        <td>${f.isDirectory ? (f.isDrive ? 'Drive' : 'Folder') : ext.toUpperCase()}</td>
        <td>${f.isDirectory ? '—' : formatBytes(f.size)}</td>
        <td>${f.modifiedAt ? new Date(f.modifiedAt).toLocaleDateString() : '—'}</td>
        <td>
          ${!f.isDirectory ? `<a class="btn btn-ghost btn-sm" href="/api/stream?path=${encodeURIComponent(f.path||'')}&token=${Auth.getToken()}" target="_blank" title="Open / Download">⬇</a>` : ''}
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><h2>Files</h2><p>Browse and access files on your NAS</p></div>
        <button class="btn btn-primary" id="upload-file-btn">📤 Upload File Here</button>
      </div>
      <div class="browser-toolbar">
        ${filePath.length > 0 ? `<button class="btn btn-ghost btn-sm" id="back-btn">‹ Back</button>` : ''}
        <div class="breadcrumb">${breadcrumbs}</div>
        <input type="text" class="input search-input" id="file-search" placeholder="Filter..."/>
      </div>
      ${items.length === 0 ? `<div class="card empty-state"><div class="icon">📂</div><h3>Empty folder</h3><p>This directory is empty.</p></div>` : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Modified</th><th></th></tr></thead>
          <tbody id="file-tbody">${rows}</tbody>
        </table>
      </div>`}
    </div>`;

  document.getElementById('upload-file-btn')?.addEventListener('click', () => {
    const currentDrive = filePath.length > 0 ? filePath[0] : '';
    showUploadModal(currentDrive);
  });

  document.getElementById('back-btn')?.addEventListener('click', () => { filePath.pop(); renderFiles(container); });

  document.querySelectorAll('.breadcrumb-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      if (idx === -1) { filePath = []; }
      else { filePath = filePath.slice(0, idx + 1); }
      renderFiles(container);
    });
  });

  document.querySelectorAll('.file-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      const isDir = row.dataset.isdir === 'true';
      const name = row.dataset.name;
      if (isDir) { filePath.push(name); renderFiles(container); }
    });
  });

  document.getElementById('file-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.file-row').forEach(row => {
      row.style.display = row.dataset.name.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: GALLERY
// ═════════════════════════════════════════════════════════════════════════════
let selectedGalleryDrive = 'ALL';
let selectedMediaType = 'ALL';

function toggleFolderMinimize(headerEl) {
  const block = headerEl.closest('.gallery-folder-block');
  if (!block) return;
  const grid = block.querySelector('.gallery-grid');
  const icon = headerEl.querySelector('.toggle-icon');
  const text = headerEl.querySelector('.toggle-text');

  if (grid.style.display === 'none') {
    grid.style.display = 'grid';
    if (icon) icon.textContent = '▼';
    if (text) text.textContent = 'Minimize';
    headerEl.classList.remove('collapsed');
  } else {
    grid.style.display = 'none';
    if (icon) icon.textContent = '▶';
    if (text) text.textContent = 'Expand';
    headerEl.classList.add('collapsed');
  }
}

async function gallery(container) {
  const drivesR = await GET('/api/drives');
  const drives = drivesR?.data || [];

  const driveOptions = [
    `<option value="ALL" ${selectedGalleryDrive === 'ALL' ? 'selected' : ''}>All Disks</option>`,
    ...drives.map(d => `<option value="${d.letter}" ${selectedGalleryDrive === d.letter ? 'selected' : ''}>Drive (${d.letter}) — ${d.name || d.letter}</option>`)
  ].join('');

  container.innerHTML = `
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h2>Media Gallery</h2>
          <p>Photos and videos across all your registered NAS disks</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <!-- Photos & Videos Filter Pills -->
          <div class="gallery-type-pills" style="display:flex;gap:6px">
            <button class="btn btn-sm ${selectedMediaType==='ALL'?'btn-primary':'btn-ghost'}" data-type="ALL">🖼️🎬 All</button>
            <button class="btn btn-sm ${selectedMediaType==='photos'?'btn-primary':'btn-ghost'}" data-type="photos">🖼️ Photos</button>
            <button class="btn btn-sm ${selectedMediaType==='videos'?'btn-primary':'btn-ghost'}" data-type="videos">🎬 Videos</button>
          </div>

          <div style="display:flex;align-items:center;gap:6px">
            <label style="margin:0;font-size:13px;color:var(--text-secondary)">Disk:</label>
            <select id="gallery-drive-filter" class="select" style="width:150px">${driveOptions}</select>
          </div>
          <button class="btn btn-ghost" id="refresh-gallery-btn">↻ Refresh</button>
        </div>
      </div>

      <div id="gallery-content">
        <div class="page-loading"><div class="spinner large"></div><p>Scanning media files...</p></div>
      </div>
    </div>`;

  document.querySelectorAll('.gallery-type-pills button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gallery-type-pills button').forEach(b => {
        b.className = 'btn btn-sm btn-ghost';
      });
      btn.className = 'btn btn-sm btn-primary';
      selectedMediaType = btn.dataset.type;
      loadGalleryMedia();
    });
  });

  document.getElementById('gallery-drive-filter').addEventListener('change', (e) => {
    selectedGalleryDrive = e.target.value;
    loadGalleryMedia();
  });

  document.getElementById('refresh-gallery-btn').addEventListener('click', () => loadGalleryMedia());

  await loadGalleryMedia();
}

async function loadGalleryMedia() {
  const contentEl = document.getElementById('gallery-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="page-loading"><div class="spinner large"></div><p>Scanning media files...</p></div>';

  const ep = selectedGalleryDrive === 'ALL' ? '/api/gallery?limit=200' : `/api/gallery?drive=${encodeURIComponent(selectedGalleryDrive)}&limit=200`;
  const r = await GET(ep);
  const rawData = r?.data;
  const media = Array.isArray(rawData) ? rawData : (rawData?.items || []);

  let filteredMedia = media;
  if (selectedMediaType === 'photos') {
    filteredMedia = media.filter(m => !m.isVideo);
  } else if (selectedMediaType === 'videos') {
    filteredMedia = media.filter(m => m.isVideo);
  }

  if (filteredMedia.length === 0) {
    contentEl.innerHTML = `
      <div class="card empty-state">
        <div class="icon">${selectedMediaType === 'videos' ? '🎬' : '🖼️'}</div>
        <h3>No ${selectedMediaType === 'videos' ? 'video' : selectedMediaType === 'photos' ? 'photo' : 'media'} files found</h3>
        <p>No ${selectedMediaType === 'videos' ? 'videos' : selectedMediaType === 'photos' ? 'photos' : 'media'} were detected on ${selectedGalleryDrive === 'ALL' ? 'your NAS drives' : 'drive ' + selectedGalleryDrive}.</p>
      </div>`;
    return;
  }

  // 1. Group media by drive letter (Disk)
  const groupedByDrive = {};
  for (const item of filteredMedia) {
    const driveKey = item.drive || 'Unknown Drive';
    if (!groupedByDrive[driveKey]) groupedByDrive[driveKey] = [];
    groupedByDrive[driveKey].push(item);
  }

  // 2. Build HTML grouped per disk and per folder
  let galleryHtml = '';

  for (const [drive, driveItems] of Object.entries(groupedByDrive)) {
    // Sub-group by folderPath
    const groupedByFolder = {};
    for (const item of driveItems) {
      const folderKey = item.folderPath || (drive + '\\');
      if (!groupedByFolder[folderKey]) groupedByFolder[folderKey] = [];
      groupedByFolder[folderKey].push(item);
    }

    let foldersHtml = '';

    for (const [folder, items] of Object.entries(groupedByFolder)) {
      const itemsCards = items.map(m => {
        const streamUrl = `/api/stream?path=${encodeURIComponent(m.path)}&token=${Auth.getToken()}`;
        const thumbUrl = `/api/thumbnail?path=${encodeURIComponent(m.path)}&token=${Auth.getToken()}`;
        return `
          <div class="gallery-card" data-path="${m.path}" data-name="${m.name}" data-isvideo="${m.isVideo}" data-streamurl="${streamUrl}">
            <div class="gallery-media-thumb">
              ${m.isVideo
                ? `<video src="${streamUrl}#t=0.5" preload="metadata" muted></video><div class="gallery-video-icon">▶</div>`
                : `<img src="${thumbUrl}" alt="${m.name}" loading="lazy"/>`
              }
            </div>
            <div class="gallery-card-info">
              <div class="gallery-card-title" title="${m.name}">${m.name}</div>
              <div class="gallery-card-meta">
                <span class="badge ${m.isVideo?'badge-purple':'badge-blue'}">${m.ext.toUpperCase()}</span>
                <span>${formatBytes(m.size)}</span>
              </div>
            </div>
          </div>`;
      }).join('');

      foldersHtml += `
        <div class="gallery-folder-block">
          <div class="gallery-folder-header" onclick="toggleFolderMinimize(this)">
            <span>📁</span>
            <span class="font-mono">${folder}</span>
            <span class="badge badge-blue" style="font-size:10px">${items.length} item${items.length>1?'s':''}</span>
            <button class="gallery-folder-toggle-btn" title="Minimize / Expand photos">
              <span class="toggle-icon">▼</span>
              <span class="toggle-text">Minimize</span>
            </button>
          </div>
          <div class="gallery-grid">${itemsCards}</div>
        </div>`;
    }

    galleryHtml += `
      <div class="gallery-group">
        <div class="gallery-group-header">
          <span>💽</span>
          <span>Disk (${drive})</span>
          <span class="badge badge-green" style="margin-left:auto">${driveItems.length} media item${driveItems.length>1?'s':''}</span>
        </div>
        ${foldersHtml}
      </div>`;
  }

  contentEl.innerHTML = galleryHtml;

  // Add click handler for media lightbox
  document.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.name;
      const isVideo = card.dataset.isvideo === 'true';
      const streamUrl = card.dataset.streamurl;

      showModal({
        title: `${isVideo ? '🎬' : '🖼️'} ${name}`,
        body: `
          <div class="lightbox-body">
            ${isVideo
              ? `<video class="lightbox-media" src="${streamUrl}" controls autoPlay></video>`
              : `<img class="lightbox-media" src="${streamUrl}" alt="${name}"/>`
            }
          </div>`,
        footer: `<a class="btn btn-primary" href="${streamUrl}" target="_blank">⬇ Download Original</a>`
      });
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: BACKUP
// ═════════════════════════════════════════════════════════════════════════════
async function backup(container) {
  const activityR = await GET('/api/activity');
  const activity = (activityR?.data || []).filter(a => a.type === 'upload');

  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h2>Backup Center</h2><p>Camera roll sync and file upload management</p></div>

      <div class="backup-hero">
        <div>
          <h3>📱 Mobile Camera Roll Backup</h3>
          <p>Use the Personal NAS mobile app on Android or iOS to sync your photos and videos directly to this NAS.</p>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <span class="badge badge-green">Auto-deduplication</span>
            <span class="badge badge-blue">Incremental sync</span>
            <span class="badge badge-purple">Organized by device name</span>
          </div>
        </div>
        <div style="text-align:center;flex-shrink:0">
          <div style="font-size:48px">📲</div>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Open the mobile app<br/>and tap Backup</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">⚙️ How it works</div>
          <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
            ${[
              ['1', 'Connect the mobile app to this NAS via Wi-Fi or Cloudflare Tunnel'],
              ['2', 'Tap the "Backup" button in the app dashboard'],
              ['3', 'Grant gallery permissions when prompted'],
              ['4', 'Select a target drive and start the sync'],
              ['5', 'Files are saved to: <code>&lt;Drive&gt;\\NAS_Backup\\&lt;DeviceName&gt;\\</code>']
            ].map(([n,t]) => `
              <div style="display:flex;gap:12px;align-items:flex-start">
                <div style="width:24px;height:24px;background:var(--accent-glow);color:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${n}</div>
                <span>${t}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title" style="margin-bottom:16px">📋 Recent Uploads</div>
          ${activity.length === 0
            ? '<p style="color:var(--text-secondary);font-size:13px">No uploads yet. Sync your phone or upload files to see activity here.</p>'
            : activity.slice(0,10).map(a => `
              <div class="activity-item">
                <div class="activity-icon" style="background:var(--bg-secondary)">⬆️</div>
                <div class="activity-text">
                  <div class="activity-title">${a.detail}</div>
                  <div class="activity-time">${formatTime(a.time)}</div>
                </div>
              </div>`).join('')
          }
        </div>
      </div>
    </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: REMOTE ACCESS
// ═════════════════════════════════════════════════════════════════════════════
async function remote(container) {
  const r = await GET('/api/tunnel/status');
  const tunnel = r?.data || {};
  const isRunning = tunnel.status === 'running';
  const sysR = await GET('/api/system');
  const sys = sysR?.data || {};

  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h2>Remote Access</h2><p>Cloudflare Tunnel — access your NAS from anywhere on the internet</p></div>

      <div class="card" style="margin-bottom:20px;background:${isRunning?'linear-gradient(135deg,var(--bg-card) 0%,rgba(63,185,80,0.06) 100%)':'var(--bg-card)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="font-size:40px">${isRunning?'🌐':'🔌'}</div>
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <h3 style="font-size:18px;font-weight:700">${isRunning?'Tunnel Active':'Tunnel Inactive'}</h3>
                <span class="badge ${isRunning?'badge-green':''}">● ${isRunning?'Running':'Stopped'}</span>
              </div>
              <p style="color:var(--text-secondary);font-size:13px">
                ${isRunning?'Your NAS is accessible from the internet via Cloudflare Quick Tunnel.':'Start a Cloudflare Quick Tunnel to access this NAS from any device, anywhere.'}
              </p>
            </div>
          </div>
          <button class="btn ${isRunning?'btn-danger':'btn-primary'}" id="tunnel-toggle-btn">
            ${isRunning?'⏹ Stop Tunnel':'🚀 Start Tunnel'}
          </button>
        </div>

        ${isRunning ? `
          <hr class="divider"/>
          <div style="margin-bottom:8px"><label>Your Public URL</label></div>
          <div class="tunnel-url-box">
            <span id="tunnel-url-text">${tunnel.url}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${tunnel.url}');toast('URL copied!','success')">📋 Copy</button>
              <button class="btn btn-ghost btn-sm" onclick="window.open('${tunnel.url}','_blank')">↗ Open</button>
            </div>
          </div>
        ` : ''}
      </div>

      ${isRunning ? `
      <div class="grid-2" style="margin-bottom:20px">
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">📱 Mobile Pairing QR</div>
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Scan this QR code in the Personal NAS mobile app to pair via the tunnel.</p>
          <div class="qr-wrap" id="qr-container"></div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:16px">📖 How to connect remotely</div>
          <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
            ${[
              ['1','Open the Personal NAS mobile app'],
              ['2','Tap "Remote Access" tab on the connection screen'],
              ['3','Paste the tunnel URL shown above'],
              ['4','Enter your passcode and tap "Connect Remotely"']
            ].map(([n,t])=>`
              <div style="display:flex;gap:12px;align-items:flex-start">
                <div style="width:24px;height:24px;background:var(--green-bg);color:var(--green);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${n}</div>
                <span>${t}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>` : ''}
    </div>`;

  document.getElementById('tunnel-toggle-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('tunnel-toggle-btn');
    btn.disabled = true; btn.textContent = 'Please wait...';
    if (isRunning) {
      await POST('/api/tunnel/stop');
      toast('Tunnel stopped', 'info');
    } else {
      toast('Starting Cloudflare Tunnel — this may take up to 30 seconds...', 'info');
      const res = await POST('/api/tunnel/start');
      if (res?.ok) toast('Tunnel active: ' + res.data.url, 'success');
      else { toast(res?.data?.error || 'Failed to start tunnel', 'error'); }
    }
    navigate('remote');
  });

  if (isRunning && tunnel.url) {
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) {
      // Embed both URL and passcode so mobile app can auto-login
      const qrPayload = JSON.stringify({ url: tunnel.url, passcode: sys.passcode || '' });
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;
      img.style.borderRadius = '8px';
      img.alt = 'QR Code for tunnel URL and passcode';
      qrContainer.appendChild(img);

      // Show passcode hint below QR so user knows what's embedded
      const hint = document.createElement('p');
      hint.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-top:10px;text-align:center';
      hint.textContent = '✅ Passcode is embedded — scan to auto-login';
      qrContainer.appendChild(hint);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ═════════════════════════════════════════════════════════════════════════════
async function settings(container) {
  const sysR = await GET('/api/system');
  const sys = sysR?.data || {};

  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h2>Settings</h2><p>Server configuration and security</p></div>

      <div class="card settings-section" style="margin-bottom:20px">
        <h3>🔒 Security</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Active Passcode</h4>
            <p>Used to authenticate the mobile app and dashboard.</p>
          </div>
          <span class="badge badge-yellow font-mono" style="font-size:14px;padding:6px 14px">${sys.passcode || '——'}</span>
        </div>
      </div>

      <div class="card settings-section">
        <h3>⚙️ Server Info</h3>
        <div class="settings-row"><div class="settings-row-info"><h4>Hostname</h4></div><span class="font-mono">${sys.hostname||'—'}</span></div>
        <div class="settings-row"><div class="settings-row-info"><h4>Port</h4></div><span class="font-mono" style="color:var(--accent)">${sys.port||3000}</span></div>
        <div class="settings-row"><div class="settings-row-info"><h4>Uptime</h4></div><span>${sys.uptime||'—'}</span></div>
      </div>
    </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════════
async function init() {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const passcode = document.getElementById('passcode-input').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const spinner = document.getElementById('login-spinner');
    const btnText = document.getElementById('login-btn-text');

    errEl.classList.add('hidden');
    btn.disabled = true; spinner.classList.remove('hidden'); btnText.textContent = 'Authenticating...';

    try {
      await doLogin(passcode);
      showApp();
      await loadSystemInfo();
      navigate('dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; spinner.classList.add('hidden'); btnText.textContent = 'Unlock Dashboard';
    }
  });

  document.getElementById('login-account-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-account-btn');

    errEl.classList.add('hidden');
    if (!username || !password) {
      errEl.textContent = 'Username and password are required';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    try {
      await doLogin({ username, password });
      showApp();
      await loadSystemInfo();
      navigate('dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      const heading = document.getElementById('auth-heading');
      if (heading) {
        heading.textContent = tab.dataset.tab === 'register' ? 'Setup Master Admin Account' : 'Welcome back';
      }
    });
  });

  document.getElementById('register-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const u = document.getElementById('reg-username').value;
    const p = document.getElementById('reg-password').value;
    const cp = document.getElementById('reg-confirm').value;
    const err = document.getElementById('register-error');
    err.classList.add('hidden');

    if (u.length < 3) {
      err.textContent = 'Username must be at least 3 characters';
      err.classList.remove('hidden');
      return;
    }
    if (p.length < 6) {
      err.textContent = 'Password must be at least 6 characters';
      err.classList.remove('hidden');
      return;
    }
    if (p !== cp) {
      err.textContent = 'Passwords do not match';
      err.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    try {
      await doRegister(u, p);
      showApp();
      await loadSystemInfo();
      navigate('dashboard');
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.clear();
    showLogin();
  });

  document.getElementById('toggle-passcode-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isPasscodeVisible = !isPasscodeVisible;
    const display = document.getElementById('passcode-display');
    const btn = document.getElementById('toggle-passcode-btn');
    if (display && btn) {
      if (isPasscodeVisible) {
        display.textContent = activePasscode || '••••••';
        btn.textContent = '🙈';
        btn.title = 'Hide passcode';
      } else {
        display.textContent = '••••••';
        btn.textContent = '👁️';
        btn.title = 'Show passcode';
      }
    }
  });

  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.page); });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      document.getElementById('sidebar').classList.remove('mobile-open');
      document.getElementById('sidebar-backdrop')?.classList.add('hidden');
    }
  });

  const token = Auth.getToken();
  if (token) {
    const r = await fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      showApp();
      await loadSystemInfo();
      navigate('dashboard');
      return;
    } else {
      Auth.clear();
    }
  }
  showLogin();
  try {
    const statusRes = await fetch('/api/auth/status');
    const statusData = await statusRes.json();
    if (statusData.hasUsers === false) {
      document.querySelector('.auth-tab[data-tab="register"]')?.click();
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
