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

// ─── THEME MANAGEMENT ────────────────────────────────────────────────────────
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function bindThemeSwitches() {
  document.querySelectorAll('.custom-theme-switch').forEach(sw => {
    sw.onclick = () => {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const nextTheme = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('nas-theme', nextTheme);
      applyTheme(nextTheme);
    };
    sw.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sw.click();
      }
    };
  });
}

const savedTheme = localStorage.getItem('nas-theme') || 'dark';
applyTheme(savedTheme);

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
async function admin(content) {
  content.innerHTML = `
    <div class="page">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;margin-bottom:24px">
        <div>
          <h2>🛡️ Admin Control Panel</h2>
          <p class="subtitle" style="color:var(--text-secondary);margin-top:4px">Manage system users, disk access permissions, read-only modes, and security logs</p>
        </div>
        <button class="btn btn-primary" id="admin-add-user-btn">
          <span>➕ Create New Account</span>
        </button>
      </div>

      <div class="admin-tabs" style="display:flex;gap:12px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:12px">
        <button class="btn btn-ghost admin-tab active" data-tab="users">👥 User Accounts & Permissions</button>
        <button class="btn btn-ghost admin-tab" data-tab="storage">💾 Storage Governance</button>
        <button class="btn btn-ghost admin-tab" data-tab="activity">📋 Security Audit Log</button>
      </div>

      <div id="admin-tab-users" class="admin-tab-content active">
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <h4 style="margin:0">Registered Users</h4>
            <span id="user-count-badge" class="badge" style="background:var(--accent-dim);color:var(--accent)">Loading...</span>
          </div>
          <div style="overflow-x:auto">
            <table class="table" style="width:100%">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Mode</th>
                  <th>Allowed Disks</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody id="admin-users-tbody">
                <tr><td colspan="7" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="admin-tab-storage" class="admin-tab-content hidden">
        <div class="card" style="padding:20px">
          <h4>💾 Storage Disk Permissions Matrix</h4>
          <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">Overview of active system drives and assigned user access permissions.</p>
          <div id="admin-storage-matrix"><div class="spinner"></div></div>
        </div>
      </div>

      <div id="admin-tab-activity" class="admin-tab-content hidden">
        <div class="card" style="padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
            <h4 style="margin:0">📋 Security & Activity Log</h4>
            <input type="text" id="audit-log-search" class="input" placeholder="Search activity logs..." style="max-width:280px"/>
          </div>
          <div style="overflow-x:auto">
            <table class="table" style="width:100%">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Event Details</th>
                </tr>
              </thead>
              <tbody id="admin-activity-tbody">
                <tr><td colspan="4" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  // Tab switcher
  content.querySelectorAll('.admin-tab').forEach(t => {
    t.addEventListener('click', () => {
      content.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
      content.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));
      t.classList.add('active');
      document.getElementById('admin-tab-' + t.dataset.tab).classList.remove('hidden');
      if (t.dataset.tab === 'storage') loadStorageMatrix();
      if (t.dataset.tab === 'activity') loadActivityLogs();
    });
  });

  // Create User Button
  document.getElementById('admin-add-user-btn').addEventListener('click', showCreateUserModal);

  // Load User Accounts
  await loadAdminUsersList();
}

async function loadAdminUsersList() {
  const tbody = document.getElementById('admin-users-tbody');
  const countBadge = document.getElementById('user-count-badge');
  if (!tbody) return;

  const r = await GET('/api/admin/users');
  if (!r || !r.ok) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px">Failed to load users: ${escapeHtml(r?.data?.error || 'Access Denied')}</td></tr>`;
    return;
  }

  const users = r.data.users || [];
  if (countBadge) countBadge.textContent = `${users.length} Users`;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary)">No users found in database.</td></tr>`;
    return;
  }

  // Fetch drives to map disk letters
  const drivesRes = await GET('/api/drives/available');
  const availableDrives = drivesRes?.data || [];

  tbody.innerHTML = users.map(u => {
    const isPasscodeAdmin = u.username === 'Passcode Admin';
    const roleBadge = u.role === 'admin'
      ? `<span class="badge" style="background:rgba(0,188,212,0.15);color:#00bcd4;border:1px solid rgba(0,188,212,0.3)">👑 Admin</span>`
      : `<span class="badge" style="background:rgba(148,163,184,0.1);color:#94a3b8">User</span>`;
    
    const modeBadge = u.isReadonly
      ? `<span class="badge" style="background:rgba(234,179,8,0.15);color:#eab308;border:1px solid rgba(234,179,8,0.3)">🔒 Read-Only</span>`
      : `<span class="badge" style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3)">✏️ Read-Write</span>`;

    const statusBadge = u.status === 'disabled'
      ? `<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)">🚫 Disabled</span>`
      : u.lockUntil && u.lockUntil > Date.now()
      ? `<span class="badge" style="background:rgba(249,115,22,0.15);color:#f97316">🔒 Locked</span>`
      : `<span class="badge" style="background:rgba(34,197,94,0.1);color:#22c55e">Active</span>`;

    let diskPills = '<span style="color:var(--text-secondary);font-size:12px">All Disks (Full Access)</span>';
    if (u.allowedDisks && Array.isArray(u.allowedDisks) && u.allowedDisks.length > 0) {
      diskPills = u.allowedDisks.map(d => `<span class="badge font-mono" style="background:var(--bg-card-hover);margin-right:4px">${escapeHtml(d)}</span>`).join('');
    }

    return `
      <tr>
        <td>
          <div style="font-weight:600">${escapeHtml(u.username)}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(u.email || 'No email registered')}</div>
        </td>
        <td>${roleBadge}</td>
        <td>${modeBadge}</td>
        <td>${diskPills}</td>
        <td>${statusBadge}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${formatTime(u.createdAt)}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm edit-user-btn" data-id="${u.id}" title="Edit Permissions & Access">⚙️ Edit</button>
          <button class="btn btn-ghost btn-sm reset-pwd-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Reset Password">🔑 Password</button>
          ${u.lockUntil && u.lockUntil > Date.now() ? `<button class="btn btn-ghost btn-sm unlock-user-btn" data-id="${u.id}">🔓 Unlock</button>` : ''}
          ${!isPasscodeAdmin ? `<button class="btn btn-ghost btn-sm delete-user-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}" style="color:var(--red)" title="Delete User">🗑️</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  // Bind actions
  tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.onclick = () => {
      const u = users.find(x => x.id === btn.dataset.id);
      if (u) showEditPermissionsModal(u, availableDrives);
    };
  });
  tbody.querySelectorAll('.reset-pwd-btn').forEach(btn => {
    btn.onclick = () => showResetPasswordModal(btn.dataset.id, btn.dataset.username);
  });
  tbody.querySelectorAll('.unlock-user-btn').forEach(btn => {
    btn.onclick = async () => {
      const res = await POST(`/api/admin/users/${btn.dataset.id}/unlock`);
      if (res?.ok) { toast('Account unlocked successfully', 'success'); loadAdminUsersList(); }
      else toast(res?.data?.error || 'Failed to unlock', 'error');
    };
  });
  tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.onclick = async () => {
      if (confirm(`Are you sure you want to delete user account "${btn.dataset.username}"?`)) {
        const res = await DELETE(`/api/admin/users/${btn.dataset.id}`);
        if (res?.ok) { toast('User deleted successfully', 'success'); loadAdminUsersList(); }
        else toast(res?.data?.error || 'Failed to delete user', 'error');
      }
    };
  });
}

function showEditPermissionsModal(user, availableDrives = []) {
  const diskCheckboxes = availableDrives.length > 0 ? availableDrives.map(d => {
    const isChecked = user.allowedDisks ? user.allowedDisks.some(ad => ad.toUpperCase().includes(d.letter.toUpperCase())) : false;
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
        <input type="checkbox" class="disk-checkbox" value="${d.letter}" ${isChecked ? 'checked' : ''}/>
        <span>💾 Drive <strong>${d.letter}</strong> ${d.name ? `(${escapeHtml(d.name)})` : ''} — ${formatBytes(d.freeSpace||0)} free</span>
      </label>`;
  }).join('') : '<p style="color:var(--text-secondary);font-size:13px">No drives detected</p>';

  const isAllDisks = !user.allowedDisks || user.allowedDisks.length === 0;

  const modalHtml = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h3>⚙️ User Permissions — ${escapeHtml(user.username)}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <form id="edit-permissions-form">
            <div style="margin-bottom:16px">
              <label for="edit-role">User Role</label>
              <select id="edit-role" class="select">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>User (Standard Access)</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin (Full System Control)</option>
              </select>
            </div>

            <div style="margin-bottom:16px">
              <label for="edit-mode">Permission Mode</label>
              <select id="edit-mode" class="select">
                <option value="rw" ${!user.isReadonly ? 'selected' : ''}>✏️ Read-Write (Can Upload, Edit, Delete)</option>
                <option value="ro" ${user.isReadonly ? 'selected' : ''}>🔒 Read-Only (Can View, Stream, Download Only)</option>
              </select>
            </div>

            <div style="margin-bottom:16px">
              <label for="edit-status">Account Status</label>
              <select id="edit-status" class="select">
                <option value="active" ${user.status !== 'disabled' ? 'selected' : ''}>Active</option>
                <option value="disabled" ${user.status === 'disabled' ? 'selected' : ''}>Disabled (Block Login)</option>
              </select>
            </div>

            <div style="margin-bottom:16px;border-top:1px solid var(--border);padding-top:14px">
              <label style="margin-bottom:8px">Allowed Disks (Storage Access Control)</label>
              <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
                <input type="checkbox" id="all-disks-checkbox" ${isAllDisks ? 'checked' : ''}/>
                <strong>🌐 Allow Access to ALL Disks</strong>
              </label>
              <div id="specific-disks-container" style="padding-left:12px;margin-top:8px;${isAllDisks ? 'display:none' : ''}">
                ${diskCheckboxes}
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="modal-save-permissions-btn">Save Changes</button>
        </div>
      </div>
    </div>`;

  const root = document.getElementById('modal-root');
  root.innerHTML = modalHtml;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').onclick = close;
  document.getElementById('modal-cancel-btn').onclick = close;
  document.getElementById('modal-backdrop').onclick = (e) => { if (e.target.id === 'modal-backdrop') close(); };

  const allDisksCb = document.getElementById('all-disks-checkbox');
  const specificContainer = document.getElementById('specific-disks-container');
  allDisksCb.onchange = () => {
    specificContainer.style.display = allDisksCb.checked ? 'none' : 'block';
  };

  document.getElementById('modal-save-permissions-btn').onclick = async () => {
    const role = document.getElementById('edit-role').value;
    const isReadonly = document.getElementById('edit-mode').value === 'ro';
    const status = document.getElementById('edit-status').value;
    const isAll = allDisksCb.checked;

    let allowedDisks = null;
    if (!isAll) {
      const selected = Array.from(root.querySelectorAll('.disk-checkbox:checked')).map(c => c.value);
      allowedDisks = selected.length > 0 ? selected : null;
    }

    const res = await api('PUT', `/api/admin/users/${user.id}/permissions`, { role, isReadonly, allowedDisks, status });
    if (res?.ok) {
      toast('Permissions updated successfully', 'success');
      close();
      loadAdminUsersList();
    } else {
      toast(res?.data?.error || 'Failed to update permissions', 'error');
    }
  };
}

function showCreateUserModal() {
  const modalHtml = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h3>➕ Create New Account</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <form id="create-user-form">
            <div style="margin-bottom:12px">
              <label for="new-username">Username</label>
              <input id="new-username" class="input" type="text" placeholder="Min 3 characters" required />
            </div>
            <div style="margin-bottom:12px">
              <label for="new-email">Email Address (optional)</label>
              <input id="new-email" class="input" type="email" placeholder="user@example.com" />
            </div>
            <div style="margin-bottom:12px">
              <label for="new-password">Password</label>
              <input id="new-password" class="input" type="password" placeholder="Min 6 characters" required />
            </div>
            <div style="margin-bottom:12px">
              <label for="new-role">Account Role</label>
              <select id="new-role" class="select">
                <option value="user">User (Standard Access)</option>
                <option value="admin">Admin (Full System Control)</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="modal-create-submit-btn">Create User</button>
        </div>
      </div>
    </div>`;

  const root = document.getElementById('modal-root');
  root.innerHTML = modalHtml;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').onclick = close;
  document.getElementById('modal-cancel-btn').onclick = close;
  document.getElementById('modal-backdrop').onclick = (e) => { if (e.target.id === 'modal-backdrop') close(); };

  document.getElementById('modal-create-submit-btn').onclick = async () => {
    const username = document.getElementById('new-username').value.trim();
    const email = document.getElementById('new-email').value.trim();
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;

    if (!username || username.length < 3) return toast('Username must be at least 3 characters', 'error');
    if (!password || password.length < 6) return toast('Password must be at least 6 characters', 'error');

    const res = await POST('/api/admin/users/create', { username, email, password, role });
    if (res?.ok) {
      toast(`User account "${username}" created successfully`, 'success');
      close();
      loadAdminUsersList();
    } else {
      toast(res?.data?.error || 'Failed to create user', 'error');
    }
  };
}

function showResetPasswordModal(userId, username) {
  const modalHtml = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <h3>🔑 Reset Password — ${escapeHtml(username)}</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom:14px">
            <label for="reset-new-password">New Password</label>
            <input id="reset-new-password" class="input" type="password" placeholder="Min 6 characters" required />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="modal-reset-submit-btn">Reset Password</button>
        </div>
      </div>
    </div>`;

  const root = document.getElementById('modal-root');
  root.innerHTML = modalHtml;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close-btn').onclick = close;
  document.getElementById('modal-cancel-btn').onclick = close;
  document.getElementById('modal-backdrop').onclick = (e) => { if (e.target.id === 'modal-backdrop') close(); };

  document.getElementById('modal-reset-submit-btn').onclick = async () => {
    const newPassword = document.getElementById('reset-new-password').value;
    if (!newPassword || newPassword.length < 6) return toast('Password must be at least 6 characters', 'error');

    const res = await POST(`/api/admin/users/${userId}/reset-password`, { newPassword });
    if (res?.ok) {
      toast(`Password for "${username}" reset successfully`, 'success');
      close();
    } else {
      toast(res?.data?.error || 'Failed to reset password', 'error');
    }
  };
}

async function loadStorageMatrix() {
  const container = document.getElementById('admin-storage-matrix');
  if (!container) return;

  const [drivesRes, usersRes] = await Promise.all([
    GET('/api/drives/available'),
    GET('/api/admin/users')
  ]);

  const drives = drivesRes?.data || [];
  const users = usersRes?.data?.users || [];

  if (drives.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary)">No storage drives detected.</p>';
    return;
  }

  container.innerHTML = drives.map(d => {
    const assignedUsers = users.filter(u => !u.allowedDisks || u.allowedDisks.some(ad => ad.toUpperCase().includes(d.letter.toUpperCase())));
    return `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <strong>💾 Drive ${d.letter}</strong> ${d.name ? `(${escapeHtml(d.name)})` : ''}
            <span class="badge" style="margin-left:8px;background:var(--bg-card-hover)">${formatBytes(d.freeSpace||0)} free / ${formatBytes(d.size||0)}</span>
          </div>
          <span class="badge" style="background:var(--accent-dim);color:var(--accent)">${assignedUsers.length} Authorized Users</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${assignedUsers.map(u => `<span class="badge" style="background:var(--bg-card-hover)">👤 ${escapeHtml(u.username)} (${u.role})</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

async function loadActivityLogs() {
  const tbody = document.getElementById('admin-activity-tbody');
  const searchInput = document.getElementById('audit-log-search');
  if (!tbody) return;

  const r = await GET('/api/admin/activity');
  const logs = r?.data || [];

  const renderLogs = (filter = '') => {
    const cleanFilter = filter.toLowerCase().trim();
    const filtered = logs.filter(l => !cleanFilter || l.type.toLowerCase().includes(cleanFilter) || l.detail.toLowerCase().includes(cleanFilter) || (l.username && l.username.toLowerCase().includes(cleanFilter)));
    
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-secondary)">No audit activity events recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(l => `
      <tr>
        <td style="font-size:12px;color:var(--text-secondary);white-space:nowrap">${formatTime(l.time)}</td>
        <td><span class="badge font-mono" style="background:var(--bg-card-hover)">👤 ${escapeHtml(l.username || 'System')}</span></td>
        <td><span class="badge" style="background:var(--bg-card-hover)">${activityIcon(l.type)} ${l.type}</span></td>
        <td>${escapeHtml(l.detail)}</td>
      </tr>`).join('');
  };

  renderLogs();
  if (searchInput) searchInput.oninput = (e) => renderLogs(e.target.value);
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function parseResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch (e) {}
  }
  const text = await res.text();
  const clean = text.replace(/<[^>]*>?/gm, '').trim();
  return { error: clean || `Server returned HTTP ${res.status} (${res.statusText || 'Error'})` };
}

async function api(method, endpoint, body) {
  try {
    const opts = { method, headers: Auth.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + endpoint, opts);
    const data = await parseResponse(res);

    if (res.status === 401 || (res.status === 403 && (data?.error?.includes('Invalid or expired token') || data?.error?.includes('disabled') || data?.error?.includes('no longer exists')))) {
      Auth.clear();
      showLogin();
      return null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.warn(`API ${method} ${endpoint} error:`, err);
    return { ok: false, status: 0, data: {}, error: err.message };
  }
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
    <div class="gauge-container ${cls}" style="width:${size}px;height:${size}px">
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
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');
  Auth.setToken(data.token);
  const username = data.username || body.username || 'Passcode Admin';
  localStorage.setItem('nas_user', username);
  if (data.user) {
    localStorage.setItem('nas_user_info', JSON.stringify(data.user));
  } else if (body.passcode) {
    localStorage.setItem('nas_user_info', JSON.stringify({ username: 'Passcode Admin', role: 'admin', isReadonly: false }));
  }
}

async function doRegister(username, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  Auth.setToken(data.token);
  localStorage.setItem('nas_user', username);
  if (data.user) {
    localStorage.setItem('nas_user_info', JSON.stringify(data.user));
  }
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
const pages = { dashboard, storage, files, gallery, backup, remote, settings, admin };
const titles = {
  dashboard: 'Dashboard', storage: 'Storage', files: 'Files', gallery: 'Media Gallery',
  backup: 'Backup Center', remote: 'Remote Access', settings: 'Settings', admin: 'Admin Panel'
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

  if (pages[page]) {
    Promise.resolve(pages[page](content, params))
      .then(() => {
        bindThemeSwitches();
      })
      .catch(err => {
        console.error(`Error rendering page ${page}:`, err);
        content.innerHTML = `
          <div class="page">
            <div class="card" style="padding:32px;text-align:center">
              <h3 style="color:var(--red)">⚠️ Unable to load ${titles[page] || page}</h3>
              <p style="margin-top:8px;color:var(--text-secondary)">${escapeHtml(err.message || 'Unable to connect to NAS server.')}</p>
              <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('${page}')">Retry</button>
            </div>
          </div>`;
      });
  }
}

// ─── SYSTEM INFO (Sidebar + Topbar) ───────────────────────────────────────────
async function loadSystemInfo() {
  const r = await GET('/api/system');
  if (!r || !r.ok) return;
  const s = r.data;
  const ip = s.ipAddresses?.[0] || 'localhost';
  document.getElementById('sidebar-ip').textContent = ip;

  let userInfo = {};
  try { userInfo = JSON.parse(localStorage.getItem('nas_user_info') || '{}'); } catch(e) {}
  const username = userInfo.username || localStorage.getItem('nas_user') || 'Passcode Admin';
  const role = userInfo.role || 'user';
  const isReadonly = Boolean(userInfo.isReadonly);

  const userBadge = document.getElementById('username-display');
  if (userBadge) {
    userBadge.textContent = username;
  }

  const roleBadge = document.getElementById('role-badge');
  if (roleBadge) {
    if (role === 'admin') {
      roleBadge.textContent = 'Admin';
      roleBadge.className = 'role-badge role-admin';
      roleBadge.classList.remove('hidden');
    } else if (isReadonly) {
      roleBadge.textContent = 'Read-Only';
      roleBadge.className = 'role-badge role-readonly';
      roleBadge.classList.remove('hidden');
    } else {
      roleBadge.textContent = 'User';
      roleBadge.className = 'role-badge role-user';
      roleBadge.classList.remove('hidden');
    }
  }

  const adminNav = document.getElementById('nav-item-admin');
  if (adminNav) {
    if (role === 'admin') adminNav.classList.remove('hidden');
    else adminNav.classList.add('hidden');
  }

  // Check tunnel status for badge
  const tr = await GET('/api/tunnel/status');
  if (tr?.data?.status === 'running') {
    document.getElementById('tunnel-badge')?.classList.remove('hidden');
  }
}

// ─── FILE & FOLDER UPLOAD MODAL ────────────────────────────────────────────────────────
async function showUploadModal(preselectedDrive = '', preselectedFolder = '') {
  const r = await GET('/api/drives');
  const drives = r?.data || [];

  if (drives.length === 0) {
    toast('No active drives available to upload files.', 'error');
    return;
  }

  // Auto clean drive and folder defaults
  let defaultDrive = preselectedDrive || (drives.length > 0 ? drives[0].letter : '');
  let defaultFolder = preselectedFolder || '';

  const driveOptions = drives.map(d => `
    <option value="${d.letter}" ${d.letter.toUpperCase().startsWith(defaultDrive.toUpperCase()) ? 'selected' : ''}>
      ${d.name || d.letter} (${d.letter}) — ${formatBytes(d.freeSpace || 0)} free
    </option>`).join('');

  const modalHtml = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" style="max-width: 580px;">
        <div class="modal-header">
          <h3 id="modal-title">📤 Upload Files & Folders</h3>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body" id="modal-body">
          <form id="upload-form">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div>
                <label for="upload-drive-select" style="font-weight:600; font-size:12px; margin-bottom:6px; display:block">Select Target Drive</label>
                <select id="upload-drive-select" class="select">${driveOptions}</select>
              </div>
              <div>
                <label for="upload-folder-input" style="font-weight:600; font-size:12px; margin-bottom:6px; display:block">Destination Subfolder (optional)</label>
                <input id="upload-folder-input" class="input" type="text" placeholder="e.g. Documents or Photos" value="${escapeHtml(defaultFolder)}"/>
              </div>
            </div>

            <!-- Drag & Drop Zone -->
            <div id="upload-dropzone" class="upload-dropzone">
              <div class="upload-dropzone-icon">☁️ 📁</div>
              <div class="upload-dropzone-title">Drag & drop files or folders here</div>
              <div class="upload-dropzone-sub">or click a button below to choose items from your computer</div>
              
              <div class="upload-dropzone-actions" onclick="event.stopPropagation()">
                <button type="button" id="btn-pick-files" class="btn btn-sm btn-primary">
                  <span>📄 Select Multiple Files</span>
                </button>
                <button type="button" id="btn-pick-folder" class="btn btn-sm btn-ghost" style="border: 1px solid var(--border); background: var(--bg-card-hover)">
                  <span>📁 Select Complete Folder</span>
                </button>
              </div>

              <!-- Hidden native file inputs -->
              <input id="native-file-input" type="file" multiple style="display:none" />
              <input id="native-folder-input" type="file" webkitdirectory directory multiple style="display:none" />
            </div>

            <!-- Selected Files Staging List -->
            <div id="upload-selected-summary" style="display:none; margin-bottom: 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                <span id="upload-staging-count" class="badge" style="background:var(--accent-dim); color:var(--accent); font-weight:700">0 items selected</span>
                <button type="button" id="upload-clear-staging-btn" class="btn btn-ghost btn-xs text-muted" style="font-size:11px">✕ Clear All</button>
              </div>
              <div id="upload-file-list" class="upload-file-list"></div>
            </div>
          </form>
        </div>
        <div class="modal-footer" id="modal-footer">
          <button class="btn btn-ghost" id="upload-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="upload-submit-btn" disabled style="opacity:0.6">Upload Now</button>
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

  const dropzone = document.getElementById('upload-dropzone');
  const nativeFileInput = document.getElementById('native-file-input');
  const nativeFolderInput = document.getElementById('native-folder-input');
  const btnPickFiles = document.getElementById('btn-pick-files');
  const btnPickFolder = document.getElementById('btn-pick-folder');
  const clearStagingBtn = document.getElementById('upload-clear-staging-btn');

  let stagedFiles = []; // Array of { file: File, relativePath: string }

  function addFilesToStaging(fileList) {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relPath = file.webkitRelativePath || file.name;
      stagedFiles.push({ file, relativePath: relPath });
    }
    renderStagedList();
  }

  // Recursively traverse directory entries when folders are dragged and dropped
  async function traverseDirectory(entry, currentPath = '') {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          const relativePath = currentPath ? `${currentPath}/${file.name}` : file.name;
          stagedFiles.push({ file, relativePath });
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readEntries = async () => {
        return new Promise((resolve) => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve();
            } else {
              const subPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
              for (const subEntry of entries) {
                await traverseDirectory(subEntry, subPath);
              }
              await readEntries();
              resolve();
            }
          });
        });
      };
      await readEntries();
    }
  }

  function renderStagedList() {
    const summary = document.getElementById('upload-selected-summary');
    const countBadge = document.getElementById('upload-staging-count');
    const listEl = document.getElementById('upload-file-list');
    const submitBtn = document.getElementById('upload-submit-btn');
    if (!summary || !countBadge || !listEl || !submitBtn) return;

    if (stagedFiles.length === 0) {
      summary.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';
      submitBtn.textContent = 'Upload Now';
      return;
    }

    const totalBytes = stagedFiles.reduce((sum, item) => sum + item.file.size, 0);
    summary.style.display = 'block';
    countBadge.textContent = `${stagedFiles.length} item(s) selected • ${formatBytes(totalBytes)}`;
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.textContent = `Upload ${stagedFiles.length} Item(s)`;

    listEl.innerHTML = stagedFiles.slice(0, 100).map((item, idx) => `
      <div class="upload-file-item">
        <span style="margin-right:4px">${fileIcon(item.file.name.split('.').pop(), false)}</span>
        <span class="upload-file-item-name" title="${escapeHtml(item.relativePath)}">${escapeHtml(item.relativePath)}</span>
        <span class="upload-file-item-size">${formatBytes(item.file.size)}</span>
        <span class="upload-file-item-remove" data-idx="${idx}" title="Remove file">✕</span>
      </div>
    `).join('') + (stagedFiles.length > 100 ? `<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:4px">+ ${stagedFiles.length - 100} more items</div>` : '');

    listEl.querySelectorAll('.upload-file-item-remove').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const removeIdx = parseInt(btn.dataset.idx);
        stagedFiles.splice(removeIdx, 1);
        renderStagedList();
      };
    });
  }

  btnPickFiles.addEventListener('click', (e) => {
    e.stopPropagation();
    nativeFileInput.value = '';
    nativeFileInput.click();
  });

  btnPickFolder.addEventListener('click', (e) => {
    e.stopPropagation();
    nativeFolderInput.value = '';
    nativeFolderInput.click();
  });

  nativeFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStaging(e.target.files);
    }
  });

  nativeFolderInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStaging(e.target.files);
    }
  });

  clearStagingBtn?.addEventListener('click', () => {
    stagedFiles = [];
    renderStagedList();
  });

  // Drag & Drop event handling
  dropzone.addEventListener('click', () => {
    nativeFileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) await traverseDirectory(entry);
        } else {
          const f = item.getAsFile();
          if (f) stagedFiles.push({ file: f, relativePath: f.name });
        }
      }
    } else if (e.dataTransfer.files) {
      addFilesToStaging(e.dataTransfer.files);
    }
    renderStagedList();
  });

  document.getElementById('upload-submit-btn').addEventListener('click', async () => {
    const driveLetter = document.getElementById('upload-drive-select').value;
    const subfolder = document.getElementById('upload-folder-input').value.trim();

    if (stagedFiles.length === 0) {
      toast('Please select at least one file or folder to upload.', 'error');
      return;
    }

    let destination = driveLetter;
    if (!destination.endsWith('\\') && !destination.endsWith('/')) destination += '\\';
    if (subfolder) destination += subfolder;

    const totalSize = stagedFiles.reduce((sum, f) => sum + f.file.size, 0);

    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    modalTitle.textContent = stagedFiles.length > 1 ? `📤 Uploading ${stagedFiles.length} Items...` : '📤 Uploading File...';
    modalCloseBtn.style.display = 'none';
    modalFooter.style.display = 'none';

    const firstRelPath = stagedFiles[0].relativePath || stagedFiles[0].file.name;

    modalBody.innerHTML = `
      <div class="upload-modal-progress">
        <div class="upload-anim-icon">☁️ ⚡</div>
        <div class="upload-file-info">
          <div class="upload-file-name" id="upload-file-name">${escapeHtml(firstRelPath)}</div>
          <div class="upload-file-meta" id="upload-file-meta">Item 1 of ${stagedFiles.length} • Target: <span class="font-mono" style="color:var(--accent)">${escapeHtml(destination)}</span></div>
        </div>

        <div class="upload-progress-container">
          <div id="upload-progress-fill" class="upload-progress-fill"></div>
        </div>

        <div class="upload-stats-row">
          <span id="upload-bytes-label">0 B / ${formatBytes(totalSize)}</span>
          <span id="upload-pct-label" class="upload-pct-badge">0%</span>
        </div>

        <div class="upload-status-sub" id="upload-status-text">Transferring items to Personal NAS...</div>
      </div>`;

    let overallLoaded = 0;
    let successCount = 0;
    let lastSavedPath = '';
    let uploadError = null;

    for (let i = 0; i < stagedFiles.length; i++) {
      const item = stagedFiles[i];
      const file = item.file;
      const relativePath = item.relativePath || file.name;

      const fileNameEl = document.getElementById('upload-file-name');
      const fileMetaEl = document.getElementById('upload-file-meta');
      if (fileNameEl) fileNameEl.textContent = relativePath;
      if (fileMetaEl) fileMetaEl.innerHTML = `Item ${i + 1} of ${stagedFiles.length} • Target: <span class="font-mono" style="color:var(--accent)">${escapeHtml(destination)}</span>`;

      try {
        const resp = await new Promise((resolve, reject) => {
          const formData = new FormData();
          formData.append('file', file);

          const xhr = new XMLHttpRequest();
          const uploadUrl = `/api/upload?destination=${encodeURIComponent(destination)}&relativePath=${encodeURIComponent(relativePath)}`;
          xhr.open('POST', uploadUrl);
          xhr.setRequestHeader('Authorization', `Bearer ${Auth.getToken()}`);

          let fileLoadedPrev = 0;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const delta = e.loaded - fileLoadedPrev;
              fileLoadedPrev = e.loaded;
              overallLoaded += delta;

              const pct = Math.round((overallLoaded / Math.max(totalSize, 1)) * 100);
              const fill = document.getElementById('upload-progress-fill');
              const pctLabel = document.getElementById('upload-pct-label');
              const bytesLabel = document.getElementById('upload-bytes-label');
              const statusText = document.getElementById('upload-status-text');

              if (fill) fill.style.width = Math.min(pct, 100) + '%';
              if (pctLabel) pctLabel.textContent = Math.min(pct, 100) + '%';
              if (bytesLabel) bytesLabel.textContent = `${formatBytes(overallLoaded)} / ${formatBytes(totalSize)}`;
              if (pct >= 100 && statusText) {
                statusText.textContent = i === stagedFiles.length - 1 ? 'Finishing & saving to target drive...' : `Saving item ${i + 1} of ${stagedFiles.length}...`;
              }
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
            } else {
              let errStr = 'Upload failed';
              try { errStr = JSON.parse(xhr.responseText).error || errStr; } catch {}
              reject(new Error(errStr));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(formData);
        });

        successCount++;
        if (resp.path) lastSavedPath = resp.path;
      } catch (err) {
        console.error(`Upload error for ${relativePath}:`, err);
        uploadError = err.message;
        if (stagedFiles.length === 1) break;
      }
    }

    if (successCount > 0) {
      const savedLocationText = lastSavedPath || `${destination}${stagedFiles[0].relativePath || stagedFiles[0].file.name}`;

      modalTitle.textContent = '✅ Upload Confirmed';
      modalCloseBtn.style.display = 'block';
      modalFooter.style.display = 'flex';
      modalFooter.innerHTML = `
        <button class="btn btn-ghost" id="upload-another-btn">Upload More</button>
        <button class="btn btn-primary" id="upload-done-btn">Done</button>`;

      modalBody.innerHTML = `
        <div class="upload-success-box">
          <div class="upload-success-icon">✓</div>
          <div class="upload-success-title">${successCount === 1 ? 'File Uploaded Successfully!' : `${successCount} Items Uploaded Successfully!`}</div>
          <div class="upload-success-desc">Uploaded ${successCount} of ${stagedFiles.length} item(s) (${formatBytes(totalSize)}) to disk.</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;text-align:left">Saved location:</div>
          <div class="upload-success-path">${escapeHtml(savedLocationText)}</div>
        </div>`;

      toast(`Successfully uploaded ${successCount} item(s)!`, 'success');

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
        setTimeout(() => showUploadModal(preselectedDrive, preselectedFolder), 100);
      });
    } else {
      toast(uploadError || 'Upload failed', 'error');

      modalTitle.textContent = '❌ Upload Failed';
      modalCloseBtn.style.display = 'block';
      modalFooter.style.display = 'flex';
      modalFooter.innerHTML = `<button class="btn btn-ghost" id="upload-close-err-btn">Close</button>`;

      modalBody.innerHTML = `
        <div class="upload-success-box">
          <div class="upload-success-icon" style="border-color:var(--red);color:var(--red);background:rgba(248,81,73,0.15)">✕</div>
          <div class="upload-success-title" style="color:var(--red)">Upload Encountered an Error</div>
          <div class="upload-success-desc">${escapeHtml(uploadError || 'An error occurred during upload.')}</div>
        </div>`;

      document.getElementById('upload-close-err-btn')?.addEventListener('click', close);
    }
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

  let currentUserInfo = {};
  try { currentUserInfo = JSON.parse(localStorage.getItem('nas_user_info') || '{}'); } catch(e) {}
  const isAdminUser = currentUserInfo.role === 'admin' || localStorage.getItem('nas_user') === 'Passcode Admin';

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
              activity.slice(0,8).map(a => {
                const userTag = (isAdminUser && a.username && a.username !== 'System') ? `<span class="badge font-mono" style="font-size:10px;padding:1px 5px;background:var(--bg-card-hover);margin-left:6px">👤 ${escapeHtml(a.username)}</span>` : '';
                return `
                <div class="activity-item">
                  <div class="activity-icon" style="background:var(--bg-secondary)">${activityIcon(a.type)}</div>
                  <div class="activity-text">
                    <div class="activity-title" style="display:flex;align-items:center;flex-wrap:wrap">
                      <span>${escapeHtml(a.detail)}</span>
                      ${userTag}
                    </div>
                    <div class="activity-time">${formatTime(a.time)}</div>
                  </div>
                </div>`;
              }).join('')
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

// ─── RAID 1 SETUP MODAL (LIGHT GLASSMORPHISM) ──────────────────────────────────
async function showRaidSetupModal() {
  const r = await GET('/api/disks/available');
  const availableDisks = r?.data?.disks || [];

  let selectedDiskPaths = [];

  const updateModalState = () => {
    const countBadge = document.getElementById('raid-disk-count-badge');
    const submitBtn = document.getElementById('raid-submit-btn');
    const summaryCard = document.getElementById('raid-summary-card');
    const usableVal = document.getElementById('raid-usable-val');
    const nameInput = document.getElementById('raid-name-input');

    if (countBadge) {
      countBadge.textContent = `${selectedDiskPaths.length}/2 Drives Selected`;
      countBadge.className = selectedDiskPaths.length === 2 ? 'badge badge-green' : 'badge badge-blue';
    }

    // Usable capacity in RAID 1 = smaller disk size
    if (selectedDiskPaths.length === 2) {
      const d1 = availableDisks.find(d => d.path === selectedDiskPaths[0]);
      const d2 = availableDisks.find(d => d.path === selectedDiskPaths[1]);
      if (d1 && d2) {
        const minBytes = Math.min(d1.sizeBytes || 0, d2.sizeBytes || 0);
        if (usableVal) usableVal.textContent = (minBytes / (1024 ** 4)).toFixed(1) + ' TB';
        if (summaryCard) summaryCard.style.display = 'block';
      }
    } else {
      if (summaryCard) summaryCard.style.display = 'none';
    }

    const isValid = selectedDiskPaths.length === 2 && nameInput && nameInput.value.trim().length >= 2;
    if (submitBtn) {
      submitBtn.disabled = !isValid;
      submitBtn.style.opacity = isValid ? '1' : '0.5';
      submitBtn.innerHTML = isValid 
        ? '<span>🚀 Create & Initialize RAID 1</span>' 
        : '<span>Select 2 Drives to Continue</span>';
    }
  };

  const diskCardsHtml = availableDisks.length === 0 ? `
    <div style="padding:24px; text-align:center; color:var(--text-secondary)">
      <p>No unassigned physical drives detected.</p>
    </div>` : availableDisks.map(d => `
    <div class="raid-disk-card" data-path="${d.path}">
      <div class="raid-disk-check" id="check-${d.id}"></div>
      <div style="font-size:24px">${d.type === 'NVMe' ? '⚡' : d.type === 'SSD' ? '💽' : '💿'}</div>
      <div style="flex:1; min-width:0">
        <div style="display:flex; align-items:center; gap:8px">
          <strong style="color:var(--text-primary); font-size:13px">${d.name}</strong>
          <span class="badge" style="font-size:9px; padding:1px 6px">${d.type} • ${d.interface}</span>
        </div>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:2px">
          <code class="font-mono">${d.path}</code> · Serial: ${d.serial}
        </div>
      </div>
      <div style="font-weight:800; font-size:13px; color:var(--text-primary); background:rgba(255,255,255,0.06); padding:4px 10px; border-radius:10px; border:1px solid var(--border)">
        ${d.size}
      </div>
    </div>
  `).join('');

  const close = showModal({
    title: '🛡️ Create RAID 1 Mirrored Array',
    body: `
      <p style="color:var(--text-secondary); font-size:13px; margin-bottom:18px">
        Pair two physical drives to create a fault-tolerant storage volume with real-time 1:1 data redundancy.
      </p>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:18px">
        <div>
          <label for="raid-name-input">Array Volume Name</label>
          <input id="raid-name-input" class="input" type="text" value="Storage_Mirror" placeholder="e.g. Storage_Mirror" required />
        </div>
        <div>
          <label for="raid-fs-select">Filesystem</label>
          <select id="raid-fs-select" class="select">
            <option value="ext4" selected>ext4 (Standard & Stable)</option>
            <option value="btrfs">Btrfs (Snapshots & Checksums)</option>
            <option value="xfs">XFS (High Throughput)</option>
          </select>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <label style="margin:0">Select Exactly Two (2) Member Drives</label>
        <span id="raid-disk-count-badge" class="badge badge-blue">0/2 Drives Selected</span>
      </div>

      <div class="raid-disk-list" id="raid-disk-list">
        ${diskCardsHtml}
      </div>

      <div id="raid-summary-card" class="raid-summary-box" style="display:none">
        <div class="raid-summary-row">
          <div>
            <div class="raid-summary-label">Usable Mirrored Capacity</div>
            <div id="raid-usable-val" class="raid-summary-val">—</div>
          </div>
          <div style="text-align:right">
            <div class="raid-summary-label">Fault Tolerance</div>
            <div class="raid-summary-val" style="color:var(--green); font-size:14px">1 Drive Redundancy (100% Mirrored)</div>
          </div>
        </div>
        <p style="font-size:11px; color:var(--text-secondary); margin-top:8px; margin-bottom:0">
          ℹ️ In RAID 1, data is written simultaneously to both drives. If one drive fails, your data remains fully safe.
        </p>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" id="raid-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="raid-submit-btn" disabled style="opacity:0.5">Select 2 Drives to Continue</button>
    `
  });

  document.getElementById('raid-cancel-btn').addEventListener('click', close);

  document.querySelectorAll('.raid-disk-card').forEach(card => {
    card.addEventListener('click', () => {
      const diskPath = card.dataset.path;
      if (selectedDiskPaths.includes(diskPath)) {
        selectedDiskPaths = selectedDiskPaths.filter(p => p !== diskPath);
        card.classList.remove('selected');
        card.querySelector('.raid-disk-check').textContent = '';
      } else {
        if (selectedDiskPaths.length >= 2) {
          toast('RAID 1 requires exactly two (2) drives.', 'warning');
          return;
        }
        selectedDiskPaths.push(diskPath);
        card.classList.add('selected');
        card.querySelector('.raid-disk-check').textContent = '✓';
      }
      updateModalState();
    });
  });

  document.getElementById('raid-name-input')?.addEventListener('input', updateModalState);

  document.getElementById('raid-submit-btn')?.addEventListener('click', async () => {
    const arrayName = document.getElementById('raid-name-input').value.trim();
    const filesystem = document.getElementById('raid-fs-select').value;
    const btn = document.getElementById('raid-submit-btn');

    if (selectedDiskPaths.length !== 2 || !arrayName) {
      toast('Please select exactly 2 drives and enter an array name.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin-right:8px"></span> Building RAID 1 Array...';

    const r = await POST('/api/raid/create', { arrayName, diskPaths: selectedDiskPaths, filesystem });
    if (r?.ok) {
      toast(`RAID 1 Volume "${arrayName}" created successfully!`, 'success');
      close();
      navigate('storage');
    } else {
      toast(r?.data?.error || 'Failed to create RAID 1 volume', 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>🚀 Create & Initialize RAID 1</span>';
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: STORAGE
// ═════════════════════════════════════════════════════════════════════════════
async function storage(container) {
  const [rDrives, rRaid] = await Promise.all([
    GET('/api/drives'),
    GET('/api/raid/volumes')
  ]);
  const drives = rDrives?.data || [];
  const raidVolumes = rRaid?.data?.volumes || [];

  container.innerHTML = `
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div><h2>Storage & Storage Pools</h2><p>Manage drives and RAID volumes registered with your Personal NAS</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="create-raid-btn">🛡️ Create RAID 1 Array</button>
          <button class="btn btn-ghost" id="add-storage-btn">+ Add Storage</button>
          <button class="btn btn-ghost" id="upload-file-btn">📤 Upload File</button>
          <button class="btn btn-ghost" id="scan-drives-btn">🔍 Scan Drives</button>
        </div>
      </div>

      <!-- RAID VOLUMES SECTION -->
      ${raidVolumes.length > 0 ? `
        <div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h3 style="font-size:16px;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:8px">
              🛡️ Active RAID Storage Pools <span class="badge badge-green">${raidVolumes.length} Active</span>
            </h3>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(360px, 1fr));gap:16px">
            ${raidVolumes.map(vol => `
              <div class="card" style="border-color:var(--border-glow);background:linear-gradient(135deg,rgba(2,132,199,0.06) 0%,rgba(16,185,129,0.06) 100%)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                  <div style="display:flex;align-items:center;gap:12px">
                    <div style="font-size:26px;width:48px;height:48px;border-radius:14px;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;border:1px solid var(--border-glow)">🛡️</div>
                    <div>
                      <h4 style="font-size:16px;font-weight:800;margin:0">${escapeHtml(vol.name)}</h4>
                      <span class="badge badge-blue" style="font-size:10px;padding:1px 8px">${vol.raid_level} Mirror</span>
                    </div>
                  </div>
                  <span class="badge badge-green">● Healthy</span>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
                  <div class="flex justify-between"><span>Usable Capacity:</span><strong style="color:var(--text-primary)">${vol.usable_capacity_formatted}</strong></div>
                  <div class="flex justify-between"><span>Filesystem:</span><span class="font-mono">${vol.filesystem || 'ext4'}</span></div>
                  <div class="flex justify-between"><span>Mount Point:</span><code class="font-mono" style="color:var(--accent)">${vol.mount_point || '/mnt/storage'}</code></div>
                  <div class="flex justify-between"><span>Member Disks:</span><span class="font-mono">${(vol.member_disks || []).join(', ')}</span></div>
                </div>
                <div style="display:flex;gap:8px">
                  <button class="btn btn-primary btn-sm" onclick="showUploadModal('${vol.mount_point || vol.name}')">📤 Upload</button>
                  <button class="btn btn-ghost btn-sm" onclick="navigate('files', { drive: '${vol.mount_point || vol.name}' })">📂 Browse</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- STANDARD DISKS SECTION -->
      <h3 style="font-size:16px;font-weight:800;color:var(--text-primary);margin-bottom:14px;display:flex;align-items:center;gap:8px">
        💾 Registered Storage Drives
      </h3>

      ${drives.length === 0 ? `
        <div class="card empty-state">
          <div class="icon">💿</div>
          <h3>No drives registered</h3>
          <p>Click "Add Storage" or "Create RAID 1 Array" to initialize storage with your NAS.</p>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:16px" id="storage-list">
          ${drives.map(d => {
            const used = (d.size||0) - (d.freeSpace||0);
            const pct = d.size ? Math.round((used/d.size)*100) : 0;
            const cls = pctClass(pct);
            return `
            <div class="card">
              <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
                <div class="drive-icon">${d.isUsb?'🔌':d.isCustom?'🔗':'💽'}</div>
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

  document.getElementById('create-raid-btn')?.addEventListener('click', showRaidSetupModal);
  document.getElementById('upload-file-btn')?.addEventListener('click', () => showUploadModal());
  document.getElementById('add-storage-btn')?.addEventListener('click', showAddStorageModal);
  document.getElementById('scan-drives-btn')?.addEventListener('click', () => { toast('Refreshing drives...','info'); navigate('storage'); });

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
    const currentSubfolder = filePath.length > 1 ? filePath.slice(1).join('\\') : '';
    showUploadModal(currentDrive, currentSubfolder);
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
let currentGalleryPage = 1;
const galleryPageLimit = 500;

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
          <p>Photos and videos across all your registered NAS disks (Max 500 items per page)</p>
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
      currentGalleryPage = 1;
      loadGalleryMedia();
    });
  });

  document.getElementById('gallery-drive-filter').addEventListener('change', (e) => {
    selectedGalleryDrive = e.target.value;
    currentGalleryPage = 1;
    loadGalleryMedia();
  });

  document.getElementById('refresh-gallery-btn').addEventListener('click', async () => {
    toast('Scanning NAS drives for photos & videos in background...', 'info');
    await POST('/api/gallery/rescan');
    currentGalleryPage = 1;
    loadGalleryMedia();
  });

  await loadGalleryMedia();
}

async function loadGalleryMedia(targetPage = null) {
  if (targetPage !== null) currentGalleryPage = targetPage;
  const contentEl = document.getElementById('gallery-content');
  if (!contentEl) return;
  contentEl.innerHTML = `<div class="page-loading"><div class="spinner large"></div><p>Loading media page ${currentGalleryPage}...</p></div>`;

  const driveParam = selectedGalleryDrive === 'ALL' ? '' : `&drive=${encodeURIComponent(selectedGalleryDrive)}`;
  const ep = `/api/gallery?page=${currentGalleryPage}&limit=${galleryPageLimit}${driveParam}`;
  const r = await GET(ep);
  const rawData = r?.data;
  const media = Array.isArray(rawData) ? rawData : (rawData?.items || []);
  const page = rawData?.page || currentGalleryPage;
  const totalPages = rawData?.totalPages || 1;
  const totalItems = rawData?.totalItems || media.length;

  let filteredMedia = media;
  if (selectedMediaType === 'photos') {
    filteredMedia = media.filter(m => !m.isVideo);
  } else if (selectedMediaType === 'videos') {
    filteredMedia = media.filter(m => m.isVideo);
  }

  const paginationHtml = `
    <div class="gallery-pagination-bar">
      <button class="btn btn-sm btn-ghost prev-gallery-page-btn" ${page <= 1 ? 'disabled' : ''}>← Previous Page</button>
      <div class="pagination-info">
        Page <strong>${page}</strong> of <strong>${totalPages}</strong> (${totalItems.toLocaleString()} total items • 500 per page)
      </div>
      <button class="btn btn-sm btn-ghost next-gallery-page-btn" ${page >= totalPages ? 'disabled' : ''}>Next Page →</button>
    </div>`;

  if (filteredMedia.length === 0) {
    contentEl.innerHTML = `
      ${paginationHtml}
      <div class="card empty-state" style="margin-top:16px">
        <div class="icon">${selectedMediaType === 'videos' ? '🎬' : '🖼️'}</div>
        <h3>No ${selectedMediaType === 'videos' ? 'video' : selectedMediaType === 'photos' ? 'photo' : 'media'} files found on Page ${page}</h3>
        <p>No ${selectedMediaType === 'videos' ? 'videos' : selectedMediaType === 'photos' ? 'photos' : 'media'} were detected on ${selectedGalleryDrive === 'ALL' ? 'your NAS drives' : 'drive ' + selectedGalleryDrive}.</p>
      </div>`;
    bindPaginationButtons(page, totalPages);
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

  contentEl.innerHTML = `
    ${paginationHtml}
    ${galleryHtml}
    ${paginationHtml}
  `;

  bindPaginationButtons(page, totalPages);

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

function bindPaginationButtons(currentPage, totalPages) {
  document.querySelectorAll('.prev-gallery-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentGalleryPage > 1) {
        currentGalleryPage--;
        loadGalleryMedia();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  document.querySelectorAll('.next-gallery-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentGalleryPage < totalPages) {
        currentGalleryPage++;
        loadGalleryMedia();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
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
  const tunnel = await GET('/api/tunnel/status').then(r => r?.data || {});
  const sys = await GET('/api/system').then(r => r?.data || {});
  const isRunning = tunnel.status === 'running';
  const savedConfig = tunnel.savedConfig || {};

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2>Remote Access</h2>
        <p>Access your Personal NAS securely from anywhere over Cloudflare Tunnels (100% Free)</p>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
          <div style="display:flex;align-items:center;gap:16px">
            <div class="stat-icon ${isRunning ? 'blue' : 'yellow'}" style="width:58px;height:58px;font-size:28px">${isRunning?'🌐':'🔌'}</div>
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <h3 style="font-size:18px;font-weight:700">${isRunning ? (tunnel.mode === 'named' ? 'Permanent Named Tunnel Active' : 'Quick Tunnel Active') : 'Tunnel Inactive'}</h3>
                <span class="badge ${isRunning ? 'badge-green' : ''}">● ${isRunning ? 'Running' : 'Stopped'}</span>
                <span class="badge ${tunnel.mode === 'named' ? 'badge-purple' : 'badge-blue'}">${tunnel.mode === 'named' ? 'Custom Domain' : 'Quick URL'}</span>
              </div>
              <p style="color:var(--text-secondary);font-size:13px">
                ${isRunning ? `Accessible at ${tunnel.url}` : 'Start a Quick Tunnel or configure a Permanent Named Tunnel with your custom domain.'}
              </p>
            </div>
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn ${isRunning ? 'btn-danger' : 'btn-primary'}" id="tunnel-toggle-btn">
              ${isRunning ? '⏹ Stop Tunnel' : '🚀 Start Quick Tunnel'}
            </button>
          </div>
        </div>

        ${isRunning ? `
          <hr class="divider"/>
          <div style="margin-bottom:8px"><label>Your Public Tunnel URL</label></div>
          <div class="tunnel-url-box">
            <span id="tunnel-url-text">${tunnel.url}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${tunnel.url}');toast('URL copied!','success')">📋 Copy</button>
              <button class="btn btn-ghost btn-sm" onclick="window.open('${tunnel.url}','_blank')">↗ Open</button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- PERMANENT NAMED TUNNEL CONFIGURATION CARD FOR MYNAS-HI.ONLINE -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div>
            <h3 class="card-title">🌐 Permanent Named Tunnel — <code>mynas-hi.online</code></h3>
            <p class="card-subtitle">Connect your custom <code>mynas-hi.online</code> domain using your Cloudflare Zero Trust token.</p>
          </div>
          <span class="badge badge-green">Custom Domain</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px;margin-top:12px">
          <div>
            <label for="named-token-input">Cloudflare Zero Trust Tunnel Token</label>
            <textarea id="named-token-input" class="input font-mono" style="height:70px;font-size:11px;resize:none" placeholder="Paste your cloudflared tunnel token (eyJh...)"></textarea>
          </div>

          <div>
            <label for="named-domain-input">Custom Public Domain URL</label>
            <input id="named-domain-input" class="input font-mono" type="text" placeholder="https://mynas-hi.online" value="${escapeHtml(savedConfig.customUrl || 'https://mynas-hi.online')}" />
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button class="btn btn-primary" id="save-named-tunnel-btn">
              🔒 Save & Connect https://mynas-hi.online
            </button>
          </div>
        </div>

        <hr class="divider"/>

        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:16px">
          <h4 style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:10px">📋 3-Step Setup for <code>mynas-hi.online</code> on Cloudflare:</h4>
          <ol style="margin-left:18px;font-size:12px;color:var(--text-secondary);display:flex;flex-direction:column;gap:6px">
            <li><b>Cloudflare Active</b>: Site <code>mynas-hi.online</code> added at <a href="https://dash.cloudflare.com" target="_blank" style="color:var(--accent);text-decoration:underline">dash.cloudflare.com</a>.</li>
            <li><b>DNS Configured</b>: Delete standard A record and ensure CNAME points to your Tunnel target.</li>
            <li><b>Create Tunnel & Paste Token</b>: Go to <a href="https://one.dash.cloudflare.com" target="_blank" style="color:var(--accent);text-decoration:underline">one.dash.cloudflare.com</a> ➔ <b>Networks ➔ Tunnels</b>, map <code>https://mynas-hi.online</code> to <code>http://localhost:3000</code>, copy your token (<code>eyJh...</code>), and paste it above!</li>
          </ol>
        </div>
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

  document.getElementById('save-named-tunnel-btn')?.addEventListener('click', async () => {
    const rawToken = document.getElementById('named-token-input').value.trim();
    const customUrl = document.getElementById('named-domain-input').value.trim() || 'https://mynas-hi.online';
    const btn = document.getElementById('save-named-tunnel-btn');

    if (!rawToken) {
      toast('Please paste your Cloudflare Zero Trust Tunnel Token', 'error');
      return;
    }

    // Automatically extract token if user pasted full command like "cloudflared.exe service install eyJh..."
    let token = rawToken;
    const tokenMatch = rawToken.match(/ey[A-Za-z0-9_-]+/);
    if (tokenMatch) {
      token = tokenMatch[0];
    }

    btn.disabled = true;
    btn.textContent = 'Connecting Permanent Tunnel...';
    toast('Starting Cloudflare Named Tunnel...', 'info');

    const res = await POST('/api/tunnel/configure-named', { token, customUrl });
    btn.disabled = false;
    btn.textContent = '🔒 Save & Connect ' + customUrl;

    if (res?.ok) {
      toast('Permanent Named Tunnel connected successfully!', 'success');
      navigate('remote');
    } else {
      toast(res?.data?.error || 'Failed to connect named tunnel', 'error');
    }
  });

  if (isRunning && tunnel.url) {
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) {
      // Embed URL and session token so mobile app can auto-login as this user
      const qrPayload = JSON.stringify({ url: tunnel.url, token: Auth.getToken() });
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;
      img.style.borderRadius = '8px';
      img.alt = 'QR Code for tunnel URL and auto-login';
      qrContainer.appendChild(img);

      const hint = document.createElement('p');
      hint.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-top:10px;text-align:center';
      hint.textContent = '⚡ Scan in mobile app to pair & auto-login seamlessly';
      qrContainer.appendChild(hint);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ═════════════════════════════════════════════════════════════════════════════
async function settings(container) {
  try {
    const [sysR, usersR] = await Promise.all([
      GET('/api/system').catch(() => null),
      GET('/api/users').catch(() => null)
    ]);
    const sys = sysR?.data || {};
    const usersList = Array.isArray(usersR?.data?.users) ? usersR.data.users : [];

    container.innerHTML = `
      <div class="page">
        <div class="page-header"><h2>Settings</h2><p>Server configuration, user management and security</p></div>

        <div class="card settings-section" style="margin-bottom:20px">
          <div class="card-header" style="margin-bottom:12px">
            <h3 style="margin-bottom:0;border-bottom:none;padding-bottom:0">👥 Registered NAS Accounts (${usersList.length})</h3>
            <span class="badge badge-blue">SQLite DB</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                ${usersList.length > 0 ? usersList.map(u => `
                  <tr>
                    <td style="font-weight:700;color:var(--text-primary)">👤 ${escapeHtml(u.username)}</td>
                    <td><span class="badge ${u.emailVerified ? 'badge-green' : 'badge-yellow'}">${u.emailVerified ? 'Verified' : 'Pending'}</span></td>
                    <td style="font-size:12px;color:var(--text-secondary)">${formatTime(u.createdAt)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:18px">No registered accounts found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card settings-section" style="margin-bottom:20px">
          <h3>🔒 Security & Authentication</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <h4>Dashboard Passcode</h4>
              <p>6-digit master passcode authentication is active and encrypted with bcrypt.</p>
            </div>
            <span class="badge badge-green">Encrypted</span>
          </div>
        </div>

        <div class="card settings-section">
          <h3>⚙️ Server Info</h3>
          <div class="settings-row"><div class="settings-row-info"><h4>Hostname</h4></div><span class="font-mono">${escapeHtml(sys.hostname || '—')}</span></div>
          <div class="settings-row"><div class="settings-row-info"><h4>Port</h4></div><span class="font-mono" style="color:var(--accent)">${sys.port || 3000}</span></div>
          <div class="settings-row"><div class="settings-row-info"><h4>Uptime</h4></div><span>${escapeHtml(sys.uptime || '—')}</span></div>
        </div>
      </div>`;
  } catch (err) {
    console.error('Error rendering settings page:', err);
    container.innerHTML = `
      <div class="page">
        <div class="page-header"><h2>Settings</h2><p>Server configuration, user management and security</p></div>
        <div class="card" style="padding:28px;text-align:center">
          <h3 style="color:var(--red)">⚠️ Unable to load Settings</h3>
          <p style="margin-top:8px;color:var(--text-secondary)">${escapeHtml(err.message || 'Server connection error.')}</p>
          <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('settings')">Retry</button>
        </div>
      </div>`;
  }
}

function initPinBoxes() {
  const pinBoxes = document.querySelectorAll('.pin-box');
  const hiddenInput = document.getElementById('passcode-input');
  if (!pinBoxes.length || !hiddenInput) return;

  const updateHiddenPasscode = () => {
    let passcode = '';
    pinBoxes.forEach(box => {
      passcode += box.value;
      if (box.value) {
        box.classList.add('filled');
      } else {
        box.classList.remove('filled');
      }
    });
    hiddenInput.value = passcode;
    return passcode;
  };

  pinBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val;
      const fullCode = updateHiddenPasscode();

      if (val && idx < pinBoxes.length - 1) {
        pinBoxes[idx + 1].focus();
      }

      if (fullCode.length === 6) {
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        pinBoxes[idx - 1].focus();
      }
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      if (!pasted) return;

      const digits = pasted.slice(0, 6).split('');
      digits.forEach((digit, i) => {
        if (pinBoxes[i]) {
          pinBoxes[i].value = digit;
        }
      });
      const fullCode = updateHiddenPasscode();
      const nextIdx = Math.min(digits.length, pinBoxes.length - 1);
      if (pinBoxes[nextIdx]) pinBoxes[nextIdx].focus();

      if (fullCode.length === 6) {
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
      }
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════════
async function init() {
  initPinBoxes();
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

  const handleUserPasswordLogin = async (e) => {
    if (e) e.preventDefault();
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('user-login-btn') || document.getElementById('login-account-btn');

    errEl.classList.add('hidden');
    if (!username || !password) {
      errEl.textContent = 'Username and password are required';
      errEl.classList.remove('hidden');
      return;
    }

    if (btn) btn.disabled = true;
    try {
      await doLogin({ username, password });
      showApp();
      await loadSystemInfo();
      navigate('dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  const userBtn = document.getElementById('user-login-btn') || document.getElementById('login-account-btn');
  userBtn?.addEventListener('click', handleUserPasswordLogin);

  document.getElementById('password-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUserPasswordLogin(e);
  });
  document.getElementById('username-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUserPasswordLogin(e);
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
      bindThemeSwitches();
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
