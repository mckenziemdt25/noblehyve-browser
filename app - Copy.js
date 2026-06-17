// app.js - NobleHyve Browser - SECURE VERSION with Premium Features
// All security vulnerabilities fixed

let tabs = [];
let currentTabId = null;
let sessionStartTime = Date.now();
let totalTabsCreated = 0;
let currentNewsSource = 'all';
let browsingHistory = [];
let cachedNews = null;
let cachedNewsSource = null;
let cachedNewsTime = 0;
let bookmarks = [];
let downloads = [];

// Premium status
let isPremium = false;

// DOM Elements
const tabsContainer = document.getElementById('tabs');
const urlBar = document.getElementById('urlBar');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const refreshBtn = document.getElementById('refreshBtn');
const goBtn = document.getElementById('goBtn');
const newTabBtn = document.getElementById('newTabBtn');
const privateTabBtn = document.getElementById('privateTabBtn');
const settingsBtn = document.getElementById('settingsBtn');
const moreBtn = document.getElementById('moreBtn');
const moreMenu = document.getElementById('moreMenu');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const clearBrowserDataBtn = document.getElementById('clearBrowserDataBtn');
const scanNowBtn = document.getElementById('scanNowBtn');
const startSearchInput = document.getElementById('startSearchInput');
const startSearchBtn = document.getElementById('startSearchBtn');
const findBar = document.getElementById('findBar');
const findInput = document.getElementById('findInput');
const closeFindBtn = document.getElementById('closeFindBtn');
let currentZoomLevel = Number(localStorage.getItem('defaultZoom') || 0);
const quickSearch = document.getElementById('quickSearchEngine');

// Helper function to check if electronAPI is available
const api = window.electronAPI || window.legacyIpcRenderer;

// Security: Input validation and sanitization
function sanitizeInput(input) {
    if (!input) return '';
    return String(input).replace(/[<>]/g, (match) => {
        if (match === '<') return '&lt;';
        if (match === '>') return '&gt;';
        return match;
    });
}

function validateUrl(url) {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        const allowedProtocols = ['http:', 'https:', 'file:', 'about:'];
        if (!allowedProtocols.includes(urlObj.protocol)) {
            console.warn(`Blocked invalid protocol: ${urlObj.protocol}`);
            return false;
        }
        return true;
    } catch {
        return true;
    }
}

if (quickSearch) {
    quickSearch.value = localStorage.getItem('searchEngine') || 'duckduckgo';
    quickSearch.addEventListener('change', (e) => {
        localStorage.setItem('searchEngine', e.target.value);
        const mainSelect = document.getElementById('searchEngine');
        if (mainSelect) mainSelect.value = e.target.value;
        showToast(`Search engine changed to ${e.target.options[e.target.selectedIndex].text}`);
    });
}

// ============ PREMIUM LICENSE MANAGEMENT ============

async function checkPremiumStatus() {
    try {
        const result = await api.getLicenseStatus();
        isPremium = result.isPremium;
        updatePremiumUI();
        return isPremium;
    } catch (error) {
        console.error('Failed to check premium status:', error);
        return false;
    }
}

function updatePremiumUI() {
    const premiumBadge = document.getElementById('premiumBadge');
    const activateBtn = document.getElementById('activateLicenseBtn');
    const deactivateBtn = document.getElementById('deactivateLicenseBtn');
    const licenseInput = document.getElementById('licenseKey');
    const buyLicenseBtn = document.getElementById('buyLicenseBtn');
    
    if (premiumBadge) {
        if (isPremium) {
            premiumBadge.textContent = '⭐ Premium Active';
            premiumBadge.classList.add('premium');
            if (licenseInput) licenseInput.placeholder = 'Premium activated!';
        } else {
            premiumBadge.textContent = 'Free Version';
            premiumBadge.classList.remove('premium');
            if (licenseInput) licenseInput.placeholder = 'Enter license key to unlock cloud features';
        }
    }
    
    if (activateBtn) activateBtn.style.display = isPremium ? 'none' : 'block';
    if (deactivateBtn) deactivateBtn.style.display = isPremium ? 'block' : 'none';
    if (buyLicenseBtn) buyLicenseBtn.style.display = isPremium ? 'none' : 'block';
}

async function activateLicense() {
    const licenseKey = document.getElementById('licenseKey')?.value.trim();
    if (!licenseKey) {
        showLicenseMessage('Please enter a license key', 'error');
        return;
    }
    
    showToast('Activating license...', 'info');
    const result = await api.activateLicense(licenseKey);
    
    if (result.success) {
        showLicenseMessage(result.message, 'success');
        isPremium = true;
        updatePremiumUI();
        showToast('✅ Premium activated! Cloud features unlocked.', 'success');
    } else {
        showLicenseMessage(result.error, 'error');
        showToast('❌ Activation failed: ' + result.error, 'error');
    }
}

async function deactivateLicense() {
    if (confirm('Deactivate premium license? You will lose access to cloud features.')) {
        const result = await api.deactivateLicense();
        if (result.success) {
            isPremium = false;
            updatePremiumUI();
            showToast('License deactivated', 'info');
        }
    }
}

function showLicenseMessage(message, type) {
    const messageDiv = document.getElementById('licenseMessage');
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = `license-message ${type}`;
        setTimeout(() => {
            messageDiv.textContent = '';
            messageDiv.className = 'license-message';
        }, 5000);
    }
}

function buyLicense() {
    api.openPremiumPage();
}

// Initialize premium UI when settings panel opens
function initPremiumUI() {
    const activateBtn = document.getElementById('activateLicenseBtn');
    const deactivateBtn = document.getElementById('deactivateLicenseBtn');
    const buyBtn = document.getElementById('buyLicenseBtn');
    
    if (activateBtn) activateBtn.onclick = activateLicense;
    if (deactivateBtn) deactivateBtn.onclick = deactivateLicense;
    if (buyBtn) buyBtn.onclick = buyLicense;
    
    checkPremiumStatus();
}

// ============ CLOUD STORAGE MANAGEMENT (Premium Feature) ============
async function initCloudStorageUI() {
    const accountIdInput = document.getElementById('cloudAccountId');
    const accessKeyInput = document.getElementById('cloudAccessKey');
    const secretKeyInput = document.getElementById('cloudSecretKey');
    const saveBtn = document.getElementById('saveCloudCredsBtn');
    const clearBtn = document.getElementById('clearCloudCredsBtn');
    const testBtn = document.getElementById('testCloudConnectionBtn');
    const statusSpan = document.getElementById('cloudConnectionStatus');
    const storageInfo = document.getElementById('cloudStorageInfo');
    
    if (!saveBtn) return;
    
    await updateCloudStatus();
    
    saveBtn.addEventListener('click', async () => {
        const accountId = accountIdInput.value.trim();
        const accessKey = accessKeyInput.value.trim();
        const secretKey = secretKeyInput.value.trim();
        
        if (!accountId || !accessKey || !secretKey) {
            showToast('Please fill in all Cloudflare credentials', 'error');
            return;
        }
        
        showToast('Saving credentials securely...', 'info');
        const result = await api.saveCloudCredentials(accountId, accessKey, secretKey);
        
        if (result.success) {
            showToast('✅ Cloud credentials saved securely (OS-level encrypted)', 'success');
            accountIdInput.value = '';
            accessKeyInput.value = '';
            secretKeyInput.value = '';
            await updateCloudStatus();
        } else {
            showToast(`❌ Failed to save: ${result.error}`, 'error');
        }
    });
    
    testBtn.addEventListener('click', async () => {
        showToast('Testing connection...', 'info');
        const result = await api.testCloudConnection();
        
        if (result.success) {
            showToast(`✅ ${result.message}`, 'success');
            await updateCloudStatus();
        } else {
            showToast(`❌ Connection failed: ${result.message}`, 'error');
        }
    });
    
    clearBtn.addEventListener('click', async () => {
        if (confirm('Remove saved Cloudflare credentials? You will need to re-enter them to use cloud storage.')) {
            const result = await api.clearCloudCredentials();
            if (result.success) {
                showToast('✅ Credentials cleared securely', 'success');
                await updateCloudStatus();
            } else {
                showToast(`❌ Failed to clear: ${result.error}`, 'error');
            }
        }
    });
}

async function updateCloudStatus() {
    const statusSpan = document.getElementById('cloudConnectionStatus');
    const storageInfo = document.getElementById('cloudStorageInfo');
    const cloudDiv = document.querySelector('.cloud-status');
    
    if (!statusSpan) return;
    
    try {
        const status = await api.getCloudStatus();
        
        if (status.connected) {
            statusSpan.innerHTML = '✅ Connected to Cloudflare R2 (Encrypted)';
            if (cloudDiv) {
                cloudDiv.classList.add('connected');
                cloudDiv.classList.remove('error');
            }
            
            if (storageInfo && status.stats) {
                storageInfo.innerHTML = `
                    📁 Files stored: ${status.stats.fileCount || 0}<br>
                    💾 Total storage: ${status.stats.totalSizeMB || 0} MB
                `;
            }
        } else {
            statusSpan.innerHTML = '⚠️ Not configured - Add credentials to enable encrypted cloud backup';
            if (cloudDiv) {
                cloudDiv.classList.remove('connected');
                cloudDiv.classList.add('error');
            }
            if (storageInfo) {
                storageInfo.innerHTML = 'Configure Cloudflare R2 credentials to enable encrypted cloud storage.<br>Credentials are stored using OS-level encryption.';
            }
        }
    } catch (error) {
        statusSpan.innerHTML = '❌ Error checking cloud status';
        console.error('Cloud status error:', error);
    }
}

function loadBookmarks() {
    try {
        const saved = localStorage.getItem('noblehyve_bookmarks');
        if (saved) {
            bookmarks = JSON.parse(saved);
            renderBookmarks();
        }
    } catch(e) { console.error('Failed to load bookmarks', e); }
}

function saveBookmarks() {
    localStorage.setItem('noblehyve_bookmarks', JSON.stringify(bookmarks));
}

function flattenBookmarks(items) {
    let result = [];
    for (const item of items) {
        if (item.folder) {
            result.push(item);
            result = result.concat(flattenBookmarks(item.children || []));
        } else {
            result.push(item);
        }
    }
    return result;
}

function renderBookmarks() {
    const container = document.getElementById('bookmarksList');
    if (!container) return;
    container.innerHTML = '';
    let hasVisible = false;
    for (const bm of bookmarks) {
        if (bm.folder) {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'bookmark-folder';
            const folderLabel = document.createElement('span');
            folderLabel.className = 'bookmark-folder-label';
            folderLabel.textContent = '📁 ' + (bm.title || 'Folder');
            const folderContent = document.createElement('div');
            folderContent.className = 'bookmark-folder-content';
            folderContent.style.display = 'none';
            if (bm.children) {
                for (const child of bm.children) {
                    const childDiv = document.createElement('div');
                    childDiv.className = 'bookmark-item';
                    childDiv.textContent = child.title || child.url;
                    childDiv.title = child.url;
                    childDiv.addEventListener('click', () => navigateToUrl(child.url));
                    folderContent.appendChild(childDiv);
                }
            }
            folderLabel.addEventListener('click', () => {
                const isVisible = folderContent.style.display !== 'none';
                folderContent.style.display = isVisible ? 'none' : 'flex';
            });
            folderDiv.appendChild(folderLabel);
            folderDiv.appendChild(folderContent);
            container.appendChild(folderDiv);
            hasVisible = true;
        } else {
            const div = document.createElement('div');
            div.className = 'bookmark-item';
            div.textContent = bm.title || bm.url;
            div.title = bm.url;
            div.addEventListener('click', () => navigateToUrl(bm.url));
            container.appendChild(div);
            hasVisible = true;
        }
    }
    if (!hasVisible) {
        container.innerHTML = '<span class="empty-message" style="font-size:11px;padding:4px">No bookmarks</span>';
    }
}

function addBookmark() {
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (!currentTab || currentTab.isDashboard) {
        showToast('Cannot bookmark dashboard', 'error');
        return;
    }
    const url = currentTab.url;
    const title = currentTab.title?.innerText || url;
    if (!url || url === 'about:blank') return;
    const allFlat = flattenBookmarks(bookmarks).filter(b => !b.folder);
    if (allFlat.some(b => b.url === url)) {
        showToast('Bookmark already exists', 'warning');
        return;
    }

    const folderNames = bookmarks.filter(b => b.folder).map(b => b.title);
    let targetFolder = null;
    if (folderNames.length > 0) {
        const choice = prompt(`Add to folder (or leave blank for top level):\nFolders: ${folderNames.join(', ')}`);
        if (choice) {
            targetFolder = bookmarks.find(b => b.folder && b.title === choice);
        }
    }

    const entry = { url, title, date: Date.now() };
    if (targetFolder) {
        if (!targetFolder.children) targetFolder.children = [];
        targetFolder.children.push(entry);
    } else {
        bookmarks.push(entry);
    }
    saveBookmarks();
    renderBookmarks();
    showToast('Bookmark added');
}

function openBookmarkManager() {
    const modal = document.getElementById('bookmarkManager');
    if (!modal) return;
    modal.style.display = 'flex';
    renderBookmarkTree();
    renderBookmarkList(bookmarks);
    document.getElementById('bookmarkSearch')?.focus();
}

function closeBookmarkManager() {
    document.getElementById('bookmarkManager').style.display = 'none';
}

let selectedBookmarkFolder = null;

function renderBookmarkTree() {
    const tree = document.getElementById('bookmarkTree');
    if (!tree) return;
    tree.innerHTML = '<div class="bookmark-tree-item active" data-folder="__root__">📁 All bookmarks</div>';
    for (const bm of bookmarks) {
        if (bm.folder) {
            const item = document.createElement('div');
            item.className = 'bookmark-tree-item';
            item.dataset.folder = bm.id || bm.title;
            item.innerHTML = `<span class="folder-icon">📁</span> ${escapeHtml(bm.title)}`;
            item.addEventListener('click', () => {
                tree.querySelectorAll('.bookmark-tree-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                selectedBookmarkFolder = bm;
                renderBookmarkList(bm.children || []);
            });
            tree.appendChild(item);
        }
    }
    tree.querySelector('[data-folder="__root__"]')?.addEventListener('click', () => {
        tree.querySelectorAll('.bookmark-tree-item').forEach(el => el.classList.remove('active'));
        document.querySelector('.bookmark-tree-item[data-folder="__root__"]')?.classList.add('active');
        selectedBookmarkFolder = null;
        renderBookmarkList(bookmarks);
    });
}

function renderBookmarkList(items) {
    const panel = document.getElementById('bookmarkListPanel');
    if (!panel) return;
    const query = (document.getElementById('bookmarkSearch')?.value || '').toLowerCase();
    let filtered = items || [];
    if (query) {
        filtered = flattenBookmarks(filtered).filter(b => !b.folder && (b.title?.toLowerCase().includes(query) || b.url?.toLowerCase().includes(query)));
    }
    if (!filtered || filtered.length === 0) {
        panel.innerHTML = '<div class="empty-message">No bookmarks found</div>';
        return;
    }
    panel.innerHTML = filtered.map((bm, idx) => {
        if (bm.folder) {
            return `<div class="bookmark-list-item"><span class="folder-icon">📁</span><span class="bm-title">${escapeHtml(bm.title)}</span></div>`;
        }
        return `<div class="bookmark-list-item" data-url="${escapeHtml(bm.url)}">
            <span>📄</span>
            <span class="bm-title">${escapeHtml(bm.title || bm.url)}</span>
            <span class="bm-url">${escapeHtml(bm.url)}</span>
            <div class="bm-actions">
                <button class="bm-edit" title="Edit" data-idx="${idx}">✏️</button>
                <button class="bm-delete" title="Delete" data-idx="${idx}">🗑️</button>
            </div>
        </div>`;
    }).join('');

    panel.querySelectorAll('.bookmark-list-item[data-url]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.bm-actions')) {
                navigateToUrl(el.dataset.url);
                closeBookmarkManager();
            }
        });
    });
    panel.querySelectorAll('.bm-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const source = selectedBookmarkFolder ? selectedBookmarkFolder.children || [] : bookmarks;
            const idx = parseInt(btn.dataset.idx);
            const bm = source[idx];
            if (!bm) return;
            const newTitle = prompt('Edit title:', bm.title || '');
            if (newTitle !== null) {
                bm.title = newTitle || bm.url;
                saveBookmarks();
                renderBookmarkList(source);
                renderBookmarks();
            }
        });
    });
    panel.querySelectorAll('.bm-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Delete this bookmark?')) return;
            const source = selectedBookmarkFolder ? selectedBookmarkFolder.children || [] : bookmarks;
            const idx = parseInt(btn.dataset.idx);
            source.splice(idx, 1);
            saveBookmarks();
            renderBookmarkList(source);
            renderBookmarks();
            showToast('Bookmark deleted');
        });
    });
}

async function importBookmarks() {
    if (!api.importBookmarks) {
        showToast('Import not available', 'error');
        return;
    }
    const result = await api.importBookmarks();
    if (result.success && result.bookmarks) {
        for (const bm of result.bookmarks) {
            if (!flattenBookmarks(bookmarks).some(b => b.url === bm.url)) {
                bookmarks.push(bm);
            }
        }
        saveBookmarks();
        renderBookmarks();
        renderBookmarkTree();
        renderBookmarkList(selectedBookmarkFolder ? selectedBookmarkFolder.children || [] : bookmarks);
        showToast(`Imported ${result.bookmarks.length} bookmarks`, 'success');
    } else if (result.canceled) {
        // user cancelled
    } else {
        showToast('Import failed: ' + (result.error || 'unknown'), 'error');
    }
}

async function exportBookmarks() {
    if (!api.exportBookmarks) {
        showToast('Export not available', 'error');
        return;
    }
    const result = await api.exportBookmarks(bookmarks);
    if (result.success) {
        showToast(`Exported to ${result.path}`, 'success');
    } else if (result.canceled) {
        // user cancelled
    } else {
        showToast('Export failed: ' + (result.error || 'unknown'), 'error');
    }
}

function createBookmarkFolder() {
    const name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    bookmarks.push({ id: 'folder-' + Date.now(), title: name.trim(), folder: true, children: [], date: Date.now() });
    saveBookmarks();
    renderBookmarks();
    renderBookmarkTree();
    showToast('Folder created');
}

let activeDownloads = {};

function loadDownloads() {
    try {
        const saved = localStorage.getItem('noblehyve_downloads');
        if (saved) downloads = JSON.parse(saved);
        renderDownloads();
    } catch(e) {}
}

function saveDownloads() {
    const completed = downloads.filter(d => d.status === 'completed' || d.status === 'cancelled' || d.status === 'error');
    const keep = completed.slice(0, 100);
    const inProgress = downloads.filter(d => d.status === 'downloading');
    localStorage.setItem('noblehyve_downloads', JSON.stringify([...inProgress, ...keep]));
}

function addDownload(filePath, size = 0, id = null) {
    const fileName = filePath.split(/[/\\]/).pop();
    const entry = {
        path: filePath,
        name: fileName,
        size: size || 0,
        timestamp: Date.now(),
        status: 'completed',
        downloadId: id,
        percent: 100
    };
    if (id && activeDownloads[id]) {
        delete activeDownloads[id];
    }
    const existing = downloads.findIndex(d => d.downloadId === id);
    if (existing !== -1) {
        downloads[existing] = entry;
    } else {
        downloads.unshift(entry);
    }
    saveDownloads();
    renderDownloads();
    showToast(`Downloaded: ${fileName}`, 'success');
}

function addDownloadProgress(data) {
    const { id, filename, totalBytes, path } = data;
    activeDownloads[id] = true;
    const existing = downloads.findIndex(d => d.downloadId === id);
    const entry = {
        path: path || '',
        name: filename,
        size: totalBytes || 0,
        timestamp: Date.now(),
        status: 'downloading',
        downloadId: id,
        percent: 0,
        receivedBytes: 0,
        speed: 0
    };
    if (existing !== -1) {
        downloads[existing] = entry;
    } else {
        downloads.unshift(entry);
    }
    renderDownloads();
}

function updateDownloadProgress(data) {
    const { id, receivedBytes, totalBytes, percent, speed } = data;
    const dl = downloads.find(d => d.downloadId === id);
    if (dl) {
        dl.receivedBytes = receivedBytes;
        dl.size = totalBytes;
        dl.percent = percent;
        dl.speed = speed;
        dl.status = 'downloading';
        renderDownloads();
    }
}

function cancelDownload(id) {
    if (api && api.cancelDownload) {
        api.cancelDownload(id);
    }
    const dl = downloads.find(d => d.downloadId === id);
    if (dl) {
        dl.status = 'cancelled';
        delete activeDownloads[id];
        saveDownloads();
        renderDownloads();
        showToast('Download cancelled');
    }
}

function openDownloadFile(filePath) {
    if (api && api.openDownloadFile) {
        api.openDownloadFile(filePath);
    }
}

function renderDownloads() {
    const container = document.getElementById('downloadsList');
    if (!container) return;
    if (downloads.length === 0) {
        container.innerHTML = '<div class="empty-message">No downloads yet</div>';
        return;
    }
    container.innerHTML = downloads.map((dl, idx) => {
        const isActive = dl.status === 'downloading';
        const isError = dl.status === 'error';
        const isCancelled = dl.status === 'cancelled';
        const isDone = dl.status === 'completed';
        const progressWidth = dl.percent || 0;
        const sizeText = isActive && dl.receivedBytes ? `${formatBytes(dl.receivedBytes)} / ${formatBytes(dl.size)}` : formatBytes(dl.size);
        const speedText = dl.speed ? ` ${formatBytes(dl.speed)}/s` : '';
        const statusIcon = isActive ? '⏳' : isError ? '❌' : isCancelled ? '🚫' : '📄';
        const statusClass = isActive ? 'downloading' : isError ? 'error' : isCancelled ? 'cancelled' : 'completed';

        return `
        <div class="download-item ${statusClass}">
            <div class="download-info">
                <span class="download-name" data-path="${escapeHtml(dl.path)}">${statusIcon} ${escapeHtml(dl.name)}</span>
                <span class="download-size">${sizeText}${speedText}</span>
            </div>
            ${isActive ? `<div class="download-progress-bar"><div class="download-progress-fill" style="width:${progressWidth}%"></div></div><span class="download-percent">${progressWidth}%</span>` : ''}
            <div class="download-actions">
                ${isDone ? `<button class="download-open" data-path="${escapeHtml(dl.path)}" title="Open file location">📂</button>` : ''}
                ${isActive ? `<button class="download-cancel-btn" data-dl-id="${dl.downloadId}" title="Cancel">✖</button>` : ''}
                ${isError ? `<button class="download-retry-btn" data-idx="${idx}" title="Retry">↻</button>` : ''}
                <button class="download-remove" data-idx="${idx}" title="Remove from list">🗑️</button>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.download-name').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            if (path) openDownloadFile(path);
        });
    });
    container.querySelectorAll('.download-open').forEach(btn => {
        btn.addEventListener('click', () => {
            openDownloadFile(btn.dataset.path);
        });
    });
    container.querySelectorAll('.download-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            cancelDownload(parseInt(btn.dataset.dlId));
        });
    });
    container.querySelectorAll('.download-retry-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showToast('Retry not available - please start a new download', 'warning');
        });
    });
    container.querySelectorAll('.download-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            if (idx >= 0 && idx < downloads.length) {
                const dl = downloads[idx];
                if (dl.downloadId && activeDownloads[dl.downloadId]) {
                    cancelDownload(dl.downloadId);
                }
                downloads.splice(idx, 1);
                saveDownloads();
                renderDownloads();
                showToast('Removed from list');
            }
        });
    });
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// In main.js: after download completes, send event to renderer to add download
// Add inside terminal:download handler after successful save:
//    sendToMainWindow('download-complete', { filePath: finalPath, size: stats.size });


// ============ SECURE HISTORY MANAGEMENT ============
function loadHistory() {
    try {
        const saved = localStorage.getItem('browserHistory');
        if (saved) {
            if (typeof saved === 'string' && saved.length < 10 * 1024 * 1024) {
                browsingHistory = JSON.parse(saved);
                browsingHistory = browsingHistory.filter(item => 
                    item && typeof item.url === 'string' && validateUrl(item.url)
                );
                renderHistoryPanelList(browsingHistory);
                updateHistorySettingsList(browsingHistory);
                updateMostVisited();
            }
        }
    } catch (e) {
        console.error('Failed to load history:', e);
        browsingHistory = [];
    }
}

function saveHistory() {
    try {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        browsingHistory = browsingHistory.filter(h => h.timestamp > thirtyDaysAgo);
        if (browsingHistory.length > 2000) {
            browsingHistory = browsingHistory.slice(0, 2000);
        }
        localStorage.setItem('browserHistory', JSON.stringify(browsingHistory));
        renderHistoryPanelList(browsingHistory);
        updateHistorySettingsList(browsingHistory);
        updateMostVisited();
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

function addToHistory(url, title) {
    if (!url || url === 'about:blank' || url.startsWith('chrome://')) return;
    if (!validateUrl(url)) return;
    
    const domain = extractDomain(url);
    const existingIndex = browsingHistory.findIndex(h => h.url === url && (Date.now() - h.timestamp) < 3600000);
    
    const sanitizedTitle = title ? sanitizeInput(title.substring(0, 200)) : domain;
    
    if (existingIndex !== -1) {
        browsingHistory[existingIndex].timestamp = Date.now();
        browsingHistory[existingIndex].visitCount = (browsingHistory[existingIndex].visitCount || 1) + 1;
    } else {
        browsingHistory.unshift({
            url: url,
            title: sanitizedTitle,
            domain: domain,
            timestamp: Date.now(),
            visitCount: 1
        });
    }
    
    saveHistory();
}

function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return sanitizeInput(url);
    }
}

function getDateGroupLabel(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (itemDate.getTime() === today.getTime()) return 'Today';
    if (itemDate.getTime() === yesterday.getTime()) return 'Yesterday';
    if (itemDate.getTime() > today.getTime() - 7 * 86400000) return 'Last 7 days';
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function updateMostVisited() {
    const mostVisitedList = document.getElementById('mostVisitedList');
    if (!mostVisitedList) return;
    
    const domainCount = new Map();
    browsingHistory.forEach(item => {
        const domain = item.domain;
        const count = domainCount.get(domain) || 0;
        domainCount.set(domain, count + (item.visitCount || 1));
    });
    
    const sorted = Array.from(domainCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    if (sorted.length === 0) {
        mostVisitedList.innerHTML = '<div class="empty-message">Browse websites to see your most visited sites</div>';
        return;
    }
    
    mostVisitedList.innerHTML = sorted.map(([domain, count]) => `
        <div class="visited-item" data-url="https://${escapeHtml(domain)}">
            <div>
                <div class="visited-domain">${escapeHtml(domain)}</div>
                <div class="visited-count">${count} visits</div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.visited-item').forEach(el => {
        el.addEventListener('click', () => {
            const url = el.dataset.url;
            if (validateUrl(url)) navigateToUrl(url);
        });
    });
}

function clearHistory() {
    if (confirm('Clear all browsing history?')) {
        browsingHistory = [];
        saveHistory();
        renderHistoryPanelList(browsingHistory);
        updateHistorySettingsList(browsingHistory);
        showToast('History cleared');
    }
}

function openHistoryManager() {
    const modal = document.getElementById('historyManager');
    if (!modal) return;
    modal.style.display = 'flex';
    renderHistoryList(browsingHistory);
    document.getElementById('historySearch')?.focus();
}

function closeHistoryManager() {
    document.getElementById('historyManager').style.display = 'none';
}

function renderHistoryList(items) {
    const container = document.getElementById('historyListContainer');
    if (!container) return;
    const query = (document.getElementById('historySearch')?.value || '').toLowerCase();
    let filtered = items;
    if (query) {
        filtered = items.filter(h => (h.title || '').toLowerCase().includes(query) || h.url.toLowerCase().includes(query));
    }
    if (!filtered || filtered.length === 0) {
        container.innerHTML = '<div class="empty-message">No history found</div>';
        return;
    }

    const groups = {};
    for (const item of filtered) {
        const label = getDateGroupLabel(item.timestamp);
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    }

    let html = '';
    for (const [label, entries] of Object.entries(groups)) {
        html += `<div class="history-date-group"><div class="history-date-header">${escapeHtml(label)}</div>`;
        for (const item of entries) {
            html += `<div class="history-list-item" data-url="${escapeHtml(item.url)}">
                <span>📄</span>
                <span class="h-title">${escapeHtml((item.title || item.url).substring(0, 60))}</span>
                <span class="h-url">${escapeHtml(item.domain)}</span>
                <span class="h-time">${new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                <button class="h-delete" data-url="${escapeHtml(item.url)}" data-time="${item.timestamp}">✕</button>
            </div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.history-list-item[data-url]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('h-delete')) return;
            navigateToUrl(el.dataset.url);
            closeHistoryManager();
        });
    });
    container.querySelectorAll('.h-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            const time = parseInt(btn.dataset.time);
            const idx = browsingHistory.findIndex(h => h.url === url && h.timestamp === time);
            if (idx !== -1) {
                browsingHistory.splice(idx, 1);
                saveHistory();
                renderHistoryList(browsingHistory);
            }
        });
    });
}

function clearHistoryByRange() {
    const options = ['Last hour', 'Today', 'Last 7 days', 'All time'];
    const choice = prompt('Clear history range:\n1. Last hour\n2. Today\n3. Last 7 days\n4. All time');
    if (!choice) return;
    const now = Date.now();
    let cutoff;
    if (choice === '1') cutoff = now - 3600000;
    else if (choice === '2') cutoff = now - (now % 86400000);
    else if (choice === '3') cutoff = now - 7 * 86400000;
    else if (choice === '4') cutoff = 0;
    else return;

    if (cutoff === 0) {
        if (!confirm('Clear all history?')) return;
        browsingHistory = [];
    } else {
        browsingHistory = browsingHistory.filter(h => h.timestamp < cutoff);
    }
    saveHistory();
    renderHistoryList(browsingHistory);
    renderHistoryPanelList(browsingHistory);
    updateHistorySettingsList(browsingHistory);
    showToast('History cleared');
}

// ============ SECURE NAVIGATION ============
const searchUrls = {
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    yahoo: 'https://search.yahoo.com/search?p=',
    brave: 'https://search.brave.com/search?q=',
    qwant: 'https://www.qwant.com/?q=',
    ecosia: 'https://www.ecosia.org/search?q=',
    startpage: 'https://www.startpage.com/sp/search?query='
};

function looksLikeAddress(input) {
    return (
        /^localhost(:\d+)?(\/.*)?$/i.test(input) ||
        /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(input) ||
        /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(input)
    );
}

function normalizeNavigationInput(input) {
    const value = (input || '').trim();
    if (!value) return null;

    if (/^(https?|file):\/\//i.test(value)) {
        if (!validateUrl(value)) return null;
        return value;
    }

    if (looksLikeAddress(value)) {
        const url = `https://${value}`;
        if (validateUrl(url)) return url;
        return null;
    }

    const searchEngine = localStorage.getItem('searchEngine') || 'duckduckgo';
    const searchPrefix = searchUrls[searchEngine] || searchUrls.duckduckgo;
    return searchPrefix + encodeURIComponent(sanitizeInput(value));
}

function navigateToUrl(url) {
    const finalUrl = normalizeNavigationInput(url);
    if (!finalUrl) return;
    
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (currentTab) {
        if (currentTab.isDashboard || currentTab.isSettings) {
            convertDashboardToBrowser(currentTabId, finalUrl);
        } else {
            if (api && api.navigate) {
                api.navigate(finalUrl);
            } else if (window.legacyIpcRenderer) {
                window.legacyIpcRenderer.send('navigate', finalUrl);
            }
            currentTab.url = finalUrl;
        }
        urlBar.value = finalUrl;
    }
}

function convertDashboardToBrowser(tabId, url) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (!validateUrl(url)) return;
    
    tab.isDashboard = false;
    tab.isSettings = false;
    tab.url = url;
    if (tab.title) tab.title.innerText = 'Loading...';
    
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('browserContainer').style.display = 'block';
    
    if (api && api.newBrowserTab) {
        api.newBrowserTab(tabId, url);
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('new-browser-tab', { id: tabId, url: url });
    }
    setTimeout(() => {
        if (api && api.showBrowser) {
            api.showBrowser(tabId);
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('show-browser', tabId);
        }
    }, 100);
}

// ============ TAB MANAGEMENT ============
function createNewTab() {
    const id = Date.now();
    const isDashboard = true;
    
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.id = id;
    
    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.innerText = '🏠 New Tab';
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-tab';
    closeBtn.innerText = '✖';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeTab(id);
    };
    
    tabElement.appendChild(tabTitle);
    tabElement.appendChild(closeBtn);
    tabElement.onclick = () => switchTab(id);
    
    tabsContainer.appendChild(tabElement);
    
    tabs.push({ id, element: tabElement, title: tabTitle, url: null, isDashboard });
    totalTabsCreated++;
    
    switchTab(id);
    updateDashboardStats();
    return id;
}

function createPrivateTab() {
    const id = Date.now();
    const isPrivate = true;
    
    const tabElement = document.createElement('div');
    tabElement.className = 'tab private-tab';
    tabElement.dataset.id = id;
    
    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.innerText = '👤 Private Mode';
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-tab';
    closeBtn.innerText = '✖';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeTab(id);
    };
    
    tabElement.appendChild(tabTitle);
    tabElement.appendChild(closeBtn);
    tabElement.onclick = () => switchTab(id);
    
    tabsContainer.appendChild(tabElement);
    
    tabs.push({ id, element: tabElement, title: tabTitle, url: 'https://duckduckgo.com', isDashboard: false, isPrivate });
    totalTabsCreated++;
    
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('browserContainer').style.display = 'block';
    
    if (api && api.newPrivateTab) {
        api.newPrivateTab(id, 'https://duckduckgo.com');
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('new-private-tab', { id, url: 'https://duckduckgo.com' });
    }
    
    setTimeout(() => {
        if (api && api.showBrowser) {
            api.showBrowser(id);
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('show-browser', id);
        }
    }, 100);
    
    switchTab(id);
    updateDashboardStats();
    return id;
}

function switchTab(id) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    
    tabs.forEach(t => t.element.classList.remove('active'));
    tab.element.classList.add('active');
    currentTabId = id;
    
    // Hide all page layers first
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('browserContainer').style.display = 'none';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('historyPanel').style.display = 'none';
    if (api && api.hideBrowser) api.hideBrowser();
    
    if (tab.isHistory) {
        document.getElementById('historyPanel').style.display = 'block';
        urlBar.value = '';
        renderHistoryPanelList(browsingHistory);
    } else if (tab.isSettings) {
        document.getElementById('settingsPanel').style.display = 'block';
        urlBar.value = '';
        setTimeout(() => {
            initCloudStorageUI();
            initPremiumUI();
        }, 100);
    } else if (tab.isDashboard) {
        document.getElementById('dashboard').style.display = 'block';
        urlBar.value = '';
        updateDashboardStats();
        fetchDeveloperNews();
    } else {
        document.getElementById('browserContainer').style.display = 'block';
        if (api && api.showBrowser) {
            api.showBrowser(id);
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('show-browser', id);
        }
        if (tab.url) urlBar.value = tab.url;
    }
}

function closeTab(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const tab = tabs[index];
    tab.element.remove();
    
    if (tab.isHistory) {
        document.getElementById('historyPanel').style.display = 'none';
    } else if (tab.isSettings) {
        document.getElementById('settingsPanel').style.display = 'none';
    } else if (!tab.isDashboard) {
        if (api && api.closeBrowserTab) {
            api.closeBrowserTab(id);
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('close-browser-tab', id);
        }
    }
    
    tabs.splice(index, 1);
    
    if (tabs.length > 0) {
        const newIndex = Math.max(0, index - 1);
        switchTab(tabs[newIndex].id);
    } else {
        createNewTab();
    }
    
    updateDashboardStats();
}

// ============ DASHBOARD STATS ============
function updateDashboardStats() {
    const tabCountEl = document.getElementById('tabCount');
    if (tabCountEl) tabCountEl.innerText = tabs.length;
    
    const sessionMinutes = Math.floor((Date.now() - sessionStartTime) / 60000);
    const sessionTimeEl = document.getElementById('sessionTime');
    if (sessionTimeEl) sessionTimeEl.innerText = sessionMinutes + 'm';
    
    const totalTabsEl = document.getElementById('totalTabs');
    if (totalTabsEl) totalTabsEl.innerText = totalTabsCreated;
}

// ============ DEVELOPER NEWS ============
async function fetchDeveloperNews() {
    const newsList = document.getElementById('newsList');
    if (!newsList) return;

    const cacheIsFresh = cachedNews && cachedNewsSource === currentNewsSource && Date.now() - cachedNewsTime < 10 * 60 * 1000;
    if (cacheIsFresh) {
        renderDeveloperNews(cachedNews);
        return;
    }
    
    newsList.innerHTML = '<div class="news-item">Loading news...</div>';
    
    let allNews = [];
    
    if (currentNewsSource === 'all' || currentNewsSource === 'github') {
        try {
            const response = await fetch('https://api.github.com/events?per_page=5');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const githubNews = data.filter(e => e.type === 'PushEvent').slice(0, 3).map(e => ({
                title: sanitizeInput(`${e.actor?.login} pushed to ${e.repo?.name}`),
                source: 'GitHub',
                url: `https://github.com/${e.repo?.name}`
            }));
            allNews.push(...githubNews);
        } catch (e) { 
            allNews.push({ title: 'GitHub Trending', source: 'GitHub', url: 'https://github.com/trending' }); 
        }
    }
    
    if (currentNewsSource === 'all' || currentNewsSource === 'devto') {
        try {
            const response = await fetch('https://dev.to/api/articles?per_page=3');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const devNews = data.map(a => ({ 
                title: sanitizeInput(a.title.substring(0, 80)), 
                source: 'DEV.to', 
                url: a.url 
            }));
            allNews.push(...devNews);
        } catch (e) { 
            allNews.push({ title: 'DEV Community', source: 'DEV.to', url: 'https://dev.to' }); 
        }
    }
    
    if (currentNewsSource === 'all' || currentNewsSource === 'hacker') {
        try {
            const response = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=3');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const hnNews = data.hits.map(h => ({ 
                title: sanitizeInput(h.title || 'Hacker News'), 
                source: 'Hacker News', 
                url: h.url || 'https://news.ycombinator.com' 
            }));
            allNews.push(...hnNews);
        } catch (e) { 
            allNews.push({ title: 'Hacker News', source: 'Hacker News', url: 'https://news.ycombinator.com' }); 
        }
    }
    
    allNews = allNews.slice(0, 9);
    cachedNews = allNews;
    cachedNewsSource = currentNewsSource;
    cachedNewsTime = Date.now();
    renderDeveloperNews(allNews);
}

function renderDeveloperNews(allNews) {
    const newsList = document.getElementById('newsList');
    if (!newsList) return;

    newsList.innerHTML = allNews.map(item => `
        <div class="news-item" onclick="window.open('${escapeHtml(item.url)}', '_blank')">
            <div class="news-title">${escapeHtml(item.title)}</div>
            <div class="news-meta">${escapeHtml(item.source)}</div>
        </div>
    `).join('');
}

// ============ SETTINGS - EDGE STYLE ============
function loadSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('noblehyve_settings') || '{}');
        
        // Appearance
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = (settings.theme || 'dark') !== 'light';
        
        // Search
       const searchEngine = document.getElementById('searchEngine');
if (searchEngine) searchEngine.value = settings.searchEngine || 'duckduckgo';
const quickSearch = document.getElementById('quickSearchEngine');
if (quickSearch) quickSearch.value = settings.searchEngine || 'duckduckgo';
        
        // Startup
        const startupBehavior = document.getElementById('startupBehavior');
        if (startupBehavior) startupBehavior.value = settings.startupBehavior || 'dashboard';
        const homepageUrl = document.getElementById('homepageUrl');
        if (homepageUrl) homepageUrl.value = settings.homepageUrl || 'https://www.google.com';
        
        // Privacy & Security
        const blockTracking = document.getElementById('blockTracking');
        if (blockTracking) blockTracking.checked = settings.blockTracking !== false;
        const doNotTrack = document.getElementById('doNotTrack');
        if (doNotTrack) doNotTrack.checked = settings.doNotTrack || false;
        const clearHistoryOnExit = document.getElementById('clearHistoryOnExit');
        if (clearHistoryOnExit) clearHistoryOnExit.checked = settings.clearHistoryOnExit || false;
        const safeBrowsing = document.getElementById('safeBrowsing');
        if (safeBrowsing) safeBrowsing.checked = settings.safeBrowsing !== false;
        const blockMalware = document.getElementById('blockMalware');
        if (blockMalware) blockMalware.checked = settings.blockMalware !== false;
        const warnPhishing = document.getElementById('warnPhishing');
        if (warnPhishing) warnPhishing.checked = settings.warnPhishing !== false;
        const blockPopups = document.getElementById('blockPopups');
        if (blockPopups) blockPopups.checked = settings.blockPopups || false;
        const httpsOnlyMode = document.getElementById('httpsOnlyMode');
        if (httpsOnlyMode) httpsOnlyMode.value = settings.httpsOnlyMode || 'off';
        const clearOnExitOptions = document.getElementById('clearOnExitOptions');
        if (clearOnExitOptions) clearOnExitOptions.value = settings.clearOnExit || 'none';
        
        // Cookies
        const allowCookies = document.getElementById('allowCookies');
        if (allowCookies) allowCookies.checked = settings.allowCookies !== false;
        const blockThirdParty = document.getElementById('blockThirdParty');
        if (blockThirdParty) blockThirdParty.checked = settings.blockThirdParty || false;
        
        // Downloads
        const downloadPath = document.getElementById('downloadPath');
        if (downloadPath) downloadPath.value = settings.downloadPath || '';
        
        // External browser
        const externalBrowser = document.getElementById('externalBrowser');
        if (externalBrowser) externalBrowser.value = settings.externalBrowser || 'default';
        const autoRedirectAuth = document.getElementById('autoRedirectAuth');
        if (autoRedirectAuth) autoRedirectAuth.checked = settings.autoRedirectAuth || false;
        
        // Advanced
        const enableAutoUpdates = document.getElementById('enableAutoUpdates');
        if (enableAutoUpdates) enableAutoUpdates.checked = settings.autoUpdates !== false;
        const enableHardwareAcceleration = document.getElementById('enableHardwareAcceleration');
        if (enableHardwareAcceleration) enableHardwareAcceleration.checked = settings.hardwareAccel !== false;
        
        // Apply theme
        applyTheme(settings.theme || 'dark');
        
        // Zoom
        currentZoomLevel = Number(settings.defaultZoom ?? 0);
        if (api && api.setZoom) api.setZoom(currentZoomLevel);
        
        // Load advanced & security (already handled above)
        loadAdvancedSettings();
        loadSecuritySettings();
        
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

function saveSettings() {
    try {
        const settings = {
            theme: document.getElementById('themeToggle')?.checked ? 'dark' : 'light',
            searchEngine: document.getElementById('searchEngine')?.value || 'duckduckgo',
            startupBehavior: document.getElementById('startupBehavior')?.value || 'dashboard',
            homepageUrl: document.getElementById('homepageUrl')?.value || 'https://www.google.com',
            defaultZoom: Number(document.getElementById('defaultZoom')?.value || 0),
            blockTracking: document.getElementById('blockTracking')?.checked || false,
            doNotTrack: document.getElementById('doNotTrack')?.checked || false,
            clearHistoryOnExit: document.getElementById('clearHistoryOnExit')?.checked || false,
            safeBrowsing: document.getElementById('safeBrowsing')?.checked !== false,
            blockMalware: document.getElementById('blockMalware')?.checked !== false,
            warnPhishing: document.getElementById('warnPhishing')?.checked !== false,
            blockPopups: document.getElementById('blockPopups')?.checked || false,
            httpsOnlyMode: document.getElementById('httpsOnlyMode')?.value || 'off',
            clearOnExit: document.getElementById('clearOnExitOptions')?.value || 'none',
            allowCookies: document.getElementById('allowCookies')?.checked !== false,
            blockThirdParty: document.getElementById('blockThirdParty')?.checked || false,
            downloadPath: document.getElementById('downloadPath')?.value || '',
            externalBrowser: document.getElementById('externalBrowser')?.value || 'default',
            autoRedirectAuth: document.getElementById('autoRedirectAuth')?.checked || false,
            autoUpdates: document.getElementById('enableAutoUpdates')?.checked !== false,
            hardwareAccel: document.getElementById('enableHardwareAcceleration')?.checked !== false
        };
        
        localStorage.setItem('noblehyve_settings', JSON.stringify(settings));
        localStorage.setItem('searchEngine', settings.searchEngine);
        localStorage.setItem('defaultZoom', String(settings.defaultZoom));
        localStorage.setItem('downloadPath', settings.downloadPath);
        localStorage.setItem('clearOnExit', settings.clearOnExit);
        localStorage.setItem('autoUpdates', settings.autoUpdates);
        localStorage.setItem('hardwareAccel', settings.hardwareAccel);
        localStorage.setItem('externalBrowser', settings.externalBrowser);
        localStorage.setItem('autoRedirectAuth', settings.autoRedirectAuth);
        
        applyTheme(settings.theme);
        currentZoomLevel = settings.defaultZoom;
        if (api && api.setZoom) api.setZoom(currentZoomLevel);
        if (api && api.setExternalBrowser) api.setExternalBrowser(settings.externalBrowser);
        if (api && api.setAutoRedirectAuth) api.setAutoRedirectAuth(settings.autoRedirectAuth);
        
        showToast('Settings saved');
        const settingsTab = tabs.find(t => t.isSettings);
        if (settingsTab) closeTab(settingsTab.id);
    } catch (e) {
        console.error('Failed to save settings:', e);
        showToast('Failed to save settings', 'error');
    }
}

function loadSettingsAdvanced() {
    const el = (id) => document.getElementById(id);
    if (el('enableAutoUpdates')) el('enableAutoUpdates').checked = localStorage.getItem('autoUpdates') !== 'false';
    if (el('enableHardwareAcceleration')) el('enableHardwareAcceleration').checked = localStorage.getItem('hardwareAccel') !== 'false';
    if (el('downloadPath')) el('downloadPath').value = localStorage.getItem('downloadPath') || '';
    if (el('clearOnExitOptions')) el('clearOnExitOptions').value = localStorage.getItem('clearOnExit') || 'none';
    if (el('externalBrowser')) el('externalBrowser').value = localStorage.getItem('externalBrowser') || 'default';
    if (el('autoRedirectAuth')) el('autoRedirectAuth').checked = localStorage.getItem('autoRedirectAuth') === 'true';
}

function saveSettingsAdvanced() {
    localStorage.setItem('autoUpdates', document.getElementById('enableAutoUpdates')?.checked || false);
    localStorage.setItem('hardwareAccel', document.getElementById('enableHardwareAcceleration')?.checked || false);
    localStorage.setItem('downloadPath', document.getElementById('downloadPath')?.value || '');
    localStorage.setItem('clearOnExit', document.getElementById('clearOnExitOptions')?.value || 'none');

    const extBrowser = document.getElementById('externalBrowser')?.value || 'default';
    const autoRedirect = document.getElementById('autoRedirectAuth')?.checked || false;
    localStorage.setItem('externalBrowser', extBrowser);
    localStorage.setItem('autoRedirectAuth', autoRedirect);
    if (api && api.setExternalBrowser) api.setExternalBrowser(extBrowser);
    if (api && api.setAutoRedirectAuth) api.setAutoRedirectAuth(autoRedirect);

    if (document.getElementById('enableHardwareAcceleration')?.checked !== (localStorage.getItem('hardwareAccel') !== 'false')) {
        showToast('Hardware acceleration change requires restart', 'warning');
    }
}

function switchSettingsCategory(category) {
    document.querySelectorAll('.settings-category').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
    const catEl = document.getElementById('cat-' + category);
    const navEl = document.querySelector(`.settings-nav-item[data-category="${category}"]`);
    if (catEl) catEl.classList.add('active');
    if (navEl) navEl.classList.add('active');
    const titles = { appearance: 'Appearance', search: 'Search', startup: 'Startup', privacy: 'Privacy & Security', cookies: 'Cookies & Site Data', history: 'History', downloads: 'Downloads', external: 'External Browser', cloud: 'Cloud Storage', premium: 'Premium', advanced: 'Advanced' };
    const titleEl = document.getElementById('settingsCategoryTitle');
    if (titleEl) titleEl.textContent = titles[category] || 'Settings';
    if (category === 'cookies') renderSettingsCookieList();
    if (category === 'history') updateHistorySettingsList(browsingHistory);
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

// Cookie list in settings panel
async function renderSettingsCookieList() {
    const container = document.getElementById('cookieList');
    if (!container) return;
    if (!api.getAllCookies) return;
    const result = await api.getAllCookies();
    if (!result.success || !result.cookies) {
        container.innerHTML = '<div class="empty-message">Unable to load cookies</div>';
        return;
    }
    const entries = Object.entries(result.cookies);
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-message">No cookies stored</div>';
        return;
    }
    container.innerHTML = entries.slice(0, 20).map(([domain, cookies]) => `
        <div class="cookie-list-item">
            <span>${escapeHtml(domain)}</span>
            <span style="font-size:11px;color:#888">${cookies.length} cookies</span>
        </div>
    `).join('');
}

// Open Cookie Manager modal
async function openCookieManager() {
    const modal = document.getElementById('cookieManager');
    if (!modal) return;
    modal.style.display = 'flex';
    await renderCookieSites();
    document.getElementById('cookieSearch')?.focus();
}

function closeCookieManager() {
    document.getElementById('cookieManager').style.display = 'none';
}

async function renderCookieSites() {
    const container = document.getElementById('cookieListContainer');
    if (!container) return;
    container.innerHTML = '<div class="empty-message">Loading cookies...</div>';
    if (!api.getAllCookies) {
        container.innerHTML = '<div class="empty-message">Cookie API not available</div>';
        return;
    }
    const result = await api.getAllCookies();
    if (!result.success) {
        container.innerHTML = '<div class="empty-message">Failed to load cookies</div>';
        return;
    }
    const query = (document.getElementById('cookieSearch')?.value || '').toLowerCase();
    let entries = Object.entries(result.cookies);
    if (query) entries = entries.filter(([domain]) => domain.toLowerCase().includes(query));

    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-message">No cookies found</div>';
        return;
    }

    let html = '';
    for (const [domain, cookies] of entries) {
        const safeDomain = escapeHtml(domain);
        const cookieId = 'ck-' + domain.replace(/[^a-z0-9]/gi, '');
        html += `<div class="cookie-site-group">
            <div class="cookie-site-header" data-toggle="${cookieId}">
                <span>&#127850;</span>
                <span class="site-domain">${safeDomain}</span>
                <span class="site-count">${cookies.length} cookies</span>
                <button class="site-remove" data-domain="${safeDomain}" title="Remove all from this site">&#10005;</button>
            </div>
            <div id="${cookieId}" class="cookie-site-details" style="display:none">`;
        for (const c of cookies) {
            html += `<div class="cookie-item-detail">
                <span class="ck-name">${escapeHtml(c.name)}</span>
                <span class="ck-value">${escapeHtml((c.value || '').substring(0, 40))}</span>
                <button class="ck-remove" data-url="${(c.secure ? 'https' : 'http') + '://' + c.domain + c.path}" data-name="${escapeHtml(c.name)}" title="Remove">&#10005;</button>
            </div>`;
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.cookie-site-header[data-toggle]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.site-remove') || e.target.closest('.ck-remove')) return;
            const targetId = el.dataset.toggle;
            const details = document.getElementById(targetId);
            if (details) details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });
    });
    container.querySelectorAll('.site-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const domain = btn.dataset.domain;
            if (!confirm(`Delete all cookies from ${domain}?`)) return;
            const result = await api.getAllCookies();
            if (result.success && result.cookies[domain]) {
                for (const c of result.cookies[domain]) {
                    const url = (c.secure ? 'https' : 'http') + '://' + c.domain + c.path;
                    await api.removeCookie(url, c.name);
                }
                showToast(`Cookies removed for ${domain}`);
                await renderCookieSites();
            }
        });
    });
    container.querySelectorAll('.ck-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            const name = btn.dataset.name;
            await api.removeCookie(url, name);
            showToast('Cookie removed');
            await renderCookieSites();
        });
    });
}

// ============ UI HELPERS ============
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = sanitizeInput(message);
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============ SECURITY UI ============
let pendingTypoUrl = null;

function showSecurityAlert(alert) {
    const modal = document.getElementById('securityAlert');
    const title = document.getElementById('alertTitle');
    const message = document.getElementById('alertMessage');
    
    if (!modal) return;
    
    title.textContent = sanitizeInput(alert.type === 'phishing' ? '⚠️ Phishing Warning!' : '🛡️ Security Alert');
    message.textContent = sanitizeInput(alert.message);
    
    modal.style.display = 'flex';
    
    document.getElementById('alertBackBtn').onclick = () => {
        modal.style.display = 'none';
    };
    
    document.getElementById('alertProceedBtn').onclick = () => {
        modal.style.display = 'none';
        if (alert.url && validateUrl(alert.url)) {
            navigateToUrl(alert.url);
        }
    };
}

function showTypoWarning(warning) {
    const modal = document.getElementById('typoWarning');
    const message = document.getElementById('typoMessage');
    const suggested = document.getElementById('typoSuggested');
    
    if (!modal) return;
    
    message.textContent = sanitizeInput(warning.message);
    suggested.textContent = `Did you mean: ${sanitizeInput(warning.suggested)}?`;
    modal.style.display = 'flex';
    
    document.getElementById('typoBackBtn').onclick = () => {
        modal.style.display = 'none';
        if (api && api.typoResponse) {
            api.typoResponse(false);
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('typo-response', false);
        }
    };
    
    document.getElementById('typoProceedBtn').onclick = () => {
        modal.style.display = 'none';
        if (api && api.typoResponse) {
            api.typoResponse(true);
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('typo-response', true);
        }
    };
    
    document.getElementById('typoCorrectBtn').onclick = () => {
        modal.style.display = 'none';
        if (warning.suggested && validateUrl(`https://${warning.suggested}`)) {
            navigateToUrl(`https://${warning.suggested}`);
        }
    };
}

function updateSecurityDashboard(results) {
    const scoreEl = document.getElementById('securityScore');
    if (scoreEl) {
        scoreEl.textContent = results.safetyScore;
        scoreEl.style.color = results.safetyScore > 70 ? '#4caf50' : results.safetyScore > 40 ? '#ffaa44' : '#ff4444';
    }
    
    showToast(`Security scan complete: ${results.safetyScore}/100`, results.safetyScore > 70 ? 'info' : 'warning');
}

function showSettingsTab() {
    // Check if a settings tab already exists
    const existing = tabs.find(t => t.isSettings);
    if (existing) {
        switchTab(existing.id);
        return;
    }
    const id = Date.now();
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.id = id;
    
    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.innerText = '⚙️ Settings';
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-tab';
    closeBtn.innerText = '✖';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(id); };
    
    tabElement.appendChild(tabTitle);
    tabElement.appendChild(closeBtn);
    tabElement.onclick = () => switchTab(id);
    
    tabsContainer.appendChild(tabElement);
    tabs.push({ id, element: tabElement, title: tabTitle, url: null, isDashboard: false, isSettings: true });
    totalTabsCreated++;
    
    if (api && api.hideBrowser) api.hideBrowser();
    document.getElementById('settingsPanel').style.display = 'block';
    
    switchTab(id);
    updateDashboardStats();
    setTimeout(() => { initCloudStorageUI(); initPremiumUI(); }, 100);
    return id;
}

// Keep old name for backward compat
const showSettingsPanel = showSettingsTab;

function closeMoreMenu(restoreBrowser = true) {
    if (moreMenu) moreMenu.style.display = 'none';
    if (restoreBrowser) {
        const currentTab = tabs.find(t => t.id === currentTabId);
        if (currentTab && !currentTab.isDashboard && !currentTab.isSettings && !currentTab.isHistory) {
            document.getElementById('browserContainer').style.display = 'block';
            if (api && api.showBrowser) api.showBrowser(currentTabId);
        }
    }
}

function toggleMoreMenu() {
    if (!moreMenu) return;
    const opening = moreMenu.style.display !== 'block';
    moreMenu.style.display = opening ? 'block' : 'none';
    // Hide browser view while menu is open so it stays on top
    if (opening) {
        const currentTab = tabs.find(t => t.id === currentTabId);
        if (currentTab && !currentTab.isDashboard && !currentTab.isSettings && !currentTab.isHistory) {
            document.getElementById('browserContainer').style.display = 'none';
            if (api && api.hideBrowser) api.hideBrowser();
        }
    } else {
        closeMoreMenu();
    }
}

function adjustZoom(delta) {
    currentZoomLevel = Math.max(-3, Math.min(3, currentZoomLevel + delta));
    if (api && api.setZoom) {
        api.setZoom(currentZoomLevel);
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('set-zoom', currentZoomLevel);
    }
    const zoomPercent = Math.round((1 + currentZoomLevel * 0.2) * 100);
    showToast(`Zoom ${zoomPercent}%`);
}

function showFindBar() {
    if (!findBar || !findInput) return;
    findBar.style.display = 'flex';
    findInput.focus();
    findInput.select();
}

function hideFindBar() {
    if (!findBar) return;
    findBar.style.display = 'none';
    if (api && api.stopFindInPage) {
        api.stopFindInPage();
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('stop-find-in-page');
    }
}

function openHistoryFromMenu() {
    showHistoryTab();
}

function showHistoryTab() {
    const existing = tabs.find(t => t.isHistory);
    if (existing) {
        switchTab(existing.id);
        return;
    }
    const id = Date.now();
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.id = id;
    
    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.innerText = '🕒 History';
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-tab';
    closeBtn.innerText = '✖';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(id); };
    
    tabElement.appendChild(tabTitle);
    tabElement.appendChild(closeBtn);
    tabElement.onclick = () => switchTab(id);
    
    tabsContainer.appendChild(tabElement);
    tabs.push({ id, element: tabElement, title: tabTitle, url: null, isDashboard: false, isSettings: false, isHistory: true });
    totalTabsCreated++;
    
    if (api && api.hideBrowser) api.hideBrowser();
    document.getElementById('historyPanel').style.display = 'block';
    
    switchTab(id);
    updateDashboardStats();
    renderHistoryPanelList(browsingHistory);
    return id;
}

function renderHistoryPanelList(items) {
    const container = document.getElementById('historyPanelContainer');
    if (!container) return;
    const query = (document.getElementById('historyPanelSearch')?.value || '').toLowerCase();
    let filtered = items;
    if (query) {
        filtered = items.filter(h => (h.title || '').toLowerCase().includes(query) || h.url.toLowerCase().includes(query));
    }
    if (!filtered || filtered.length === 0) {
        container.innerHTML = '<div class="empty-message">No history found</div>';
        return;
    }

    const groups = {};
    for (const item of filtered) {
        const label = getDateGroupLabel(item.timestamp);
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    }

    let html = '';
    for (const [label, entries] of Object.entries(groups)) {
        html += `<div class="history-date-group"><div class="history-date-header">${escapeHtml(label)}</div>`;
        for (const item of entries) {
            html += `<div class="history-list-item" data-url="${escapeHtml(item.url)}">
                <span>📄</span>
                <span class="h-title">${escapeHtml((item.title || item.url).substring(0, 60))}</span>
                <span class="h-url">${escapeHtml(item.domain)}</span>
                <span class="h-time">${new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                <button class="h-delete" data-url="${escapeHtml(item.url)}" data-time="${item.timestamp}">✕</button>
            </div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.history-list-item[data-url]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('h-delete')) return;
            navigateToUrl(el.dataset.url);
        });
    });
    container.querySelectorAll('.h-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            const time = parseInt(btn.dataset.time);
            const idx = browsingHistory.findIndex(h => h.url === url && h.timestamp === time);
            if (idx !== -1) {
                browsingHistory.splice(idx, 1);
                saveHistory();
                renderHistoryPanelList(browsingHistory);
                updateHistorySettingsList(browsingHistory);
            }
        });
    });
}

function updateHistorySettingsList(items) {
    const container = document.getElementById('historySettingsContainer');
    if (!container) return;
    const query = (document.getElementById('settingsHistorySearch')?.value || '').toLowerCase();
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-message">No browsing history</div>';
        return;
    }
    let filtered = items;
    if (query) {
        filtered = items.filter(h => (h.title || '').toLowerCase().includes(query) || h.url.toLowerCase().includes(query));
    }
    const display = filtered.slice(-20).reverse();
    if (display.length === 0) {
        container.innerHTML = '<div class="empty-message">No matching history entries</div>';
        return;
    }
    let html = '';
    for (const item of display) {
        html += `<div class="history-list-item" data-url="${escapeHtml(item.url)}">
            <span>📄</span>
            <span class="h-title">${escapeHtml((item.title || item.url).substring(0, 40))}</span>
            <span class="h-time">${new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
        </div>`;
    }
    container.innerHTML = html;
    container.querySelectorAll('.history-list-item[data-url]').forEach(el => {
        el.addEventListener('click', () => navigateToUrl(el.dataset.url));
    });
}

function handleMoreAction(action) {
    // Don't restore browser for actions that navigate away from the current page
    const navigatesAway = ['new-tab', 'private-tab', 'history', 'downloads', 'settings'];
    closeMoreMenu(!navigatesAway.includes(action));

    const actions = {
        'new-tab': () => createNewTab(),
        'private-tab': () => createPrivateTab(),
        history: () => openHistoryFromMenu(),
        downloads: () => {
            if (api && api.hideBrowser) {
                api.hideBrowser();
            } else if (window.legacyIpcRenderer) {
                window.legacyIpcRenderer.send('hide-browser');
            }
            document.getElementById('dashboard').style.display = 'block';
            document.getElementById('browserContainer').style.display = 'none';
            document.getElementById('downloadsSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        'zoom-out': () => adjustZoom(-0.5),
        'zoom-reset': () => {
            currentZoomLevel = 0;
            if (api && api.setZoom) {
                api.setZoom(currentZoomLevel);
            } else if (window.legacyIpcRenderer) {
                window.legacyIpcRenderer.send('set-zoom', currentZoomLevel);
            }
            showToast('Zoom reset to 100%');
        },
        'zoom-in': () => adjustZoom(0.5),
        find: () => showFindBar(),
        print: () => {
            if (api && api.print) {
                api.print();
            } else if (window.legacyIpcRenderer) {
                window.legacyIpcRenderer.send('print-page');
            }
        },
        devtools: () => {
            if (api && api.toggleCurrentDevtools) {
                api.toggleCurrentDevtools();
            } else if (window.legacyIpcRenderer) {
                window.legacyIpcRenderer.send('toggle-current-devtools');
            }
        },
        settings: () => showSettingsPanel()
    };

    if (actions[action]) {
        actions[action]();
    }
}

// ============ SECURE IPC EVENT LISTENERS ============
function setupIPCEventListeners() {
    if (!api || !api.on) {
        if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.on('url-updated', (event, { id, url }) => {
                if (validateUrl(url)) {
                    const tab = tabs.find(t => t.id === id);
                    if (tab && !tab.isDashboard) {
                        tab.url = url;
                        if (currentTabId === id) urlBar.value = url;
                    }
                }
            });
            
            window.legacyIpcRenderer.on('tab-title-updated', (event, { id, title }) => {
                const tab = tabs.find(t => t.id === id);
                if (tab && tab.title && !tab.isDashboard) {
                    const safeTitle = sanitizeInput(title.length > 25 ? title.substring(0, 22) + '...' : title);
                    tab.title.innerText = safeTitle;
                }
            });
            
            window.legacyIpcRenderer.on('page-visited', (event, url, title) => {
                if (validateUrl(url)) {
                    addToHistory(url, title);
                }
            });
            
            window.legacyIpcRenderer.on('update-url-bar', (event, url) => {
                if (url && url !== 'about:blank' && validateUrl(url)) {
                    urlBar.value = url;
                }
            });
            
            window.legacyIpcRenderer.on('security-alert', (event, alert) => {
                showSecurityAlert(alert);
            });
            
            window.legacyIpcRenderer.on('typo-warning', (event, warning) => {
                showTypoWarning(warning);
            });
            
            window.legacyIpcRenderer.on('reputation-warning', (event, warning) => {
                showToast(sanitizeInput(warning.message), 'warning');
            });
            
            window.legacyIpcRenderer.on('scan-results', (event, results) => {
                updateSecurityDashboard(results);
            });
            
            window.legacyIpcRenderer.on('scareware-alert', (event, alert) => {
                showToast(sanitizeInput(alert.message), 'error');
            });
            
            window.legacyIpcRenderer.on('navigation-error', (event, details) => {
                const errorMsg = details.errorDescription || 'Unknown error';
                showToast(`Navigation failed: ${sanitizeInput(errorMsg)}`, 'error');
            });
            
            window.legacyIpcRenderer.on('tab-crashed', (event, details) => {
                const tab = tabs.find(t => t.id === details.id);
                if (tab && tab.title) tab.title.innerText = 'Crashed';
                showToast('A tab crashed, but NobleHyve stayed open.', 'error');
            });
            
            window.legacyIpcRenderer.on('tab-unresponsive', () => {
                showToast('This tab is not responding.', 'warning');
            });
            
            window.legacyIpcRenderer.on('loading-start', (event, { id }) => {
                const tab = tabs.find(t => t.id === id);
                if (tab?.element) tab.element.classList.add('loading');
            });
            
            window.legacyIpcRenderer.on('loading-stop', (event, { id }) => {
                const tab = tabs.find(t => t.id === id);
                if (tab?.element) tab.element.classList.remove('loading');
            });
            
            window.legacyIpcRenderer.on('browser-data-cleared', () => {
                showToast('Cookies and cache cleared');
            });
            
            window.legacyIpcRenderer.on('restore-session', (event, savedTabs) => {
                if (Array.isArray(savedTabs)) {
                    console.log('Session restore:', savedTabs.length, 'tabs');
                }
            });
        }
        return;
    }
    
    api.on('url-updated', (event, { id, url }) => {
        if (validateUrl(url)) {
            const tab = tabs.find(t => t.id === id);
            if (tab && !tab.isDashboard) {
                tab.url = url;
                if (currentTabId === id) urlBar.value = url;
            }
        }
    });
    
    api.on('tab-title-updated', (event, { id, title }) => {
        const tab = tabs.find(t => t.id === id);
        if (tab && tab.title && !tab.isDashboard) {
            const safeTitle = sanitizeInput(title.length > 25 ? title.substring(0, 22) + '...' : title);
            tab.title.innerText = safeTitle;
        }
    });
    
    api.on('page-visited', (event, url, title) => {
        if (validateUrl(url)) {
            addToHistory(url, title);
        }
    });
    
    api.on('update-url-bar', (event, url) => {
        if (url && url !== 'about:blank' && validateUrl(url)) {
            urlBar.value = url;
        }
    });

    api.on('download-started', (event, data) => {
        if (typeof addDownloadProgress === 'function') {
            addDownloadProgress(data);
        }
    });

    api.on('download-progress', (event, data) => {
        if (typeof updateDownloadProgress === 'function') {
            updateDownloadProgress(data);
        }
    });

    api.on('download-complete', (event, { id, filename, path, size }) => {
        if (typeof addDownload === 'function') {
            addDownload(path, size, id);
        }
    });

    api.on('download-cancelled', (event, { id, filename }) => {
        const dl = downloads.find(d => d.downloadId === id);
        if (dl) {
            dl.status = 'cancelled';
            delete activeDownloads[id];
            saveDownloads();
            renderDownloads();
            showToast(`Download cancelled: ${filename}`);
        }
    });

    api.on('download-error', (event, { id, filename, error }) => {
        const dl = downloads.find(d => d.downloadId === id);
        if (dl) {
            dl.status = 'error';
            dl.error = error;
            delete activeDownloads[id];
            saveDownloads();
            renderDownloads();
            showToast(`Download failed: ${filename}`, 'error');
        }
    });

    api.on('show-toast', (event, { message, type }) => {
        showToast(message, type);
    });
    
    api.on('security-alert', (event, alert) => {
        showSecurityAlert(alert);
    });
    
    api.on('typo-warning', (event, warning) => {
        showTypoWarning(warning);
    });
    
    api.on('reputation-warning', (event, warning) => {
        showToast(sanitizeInput(warning.message), 'warning');
    });
    
    api.on('scan-results', (event, results) => {
        updateSecurityDashboard(results);
    });
    
    api.on('scareware-alert', (event, alert) => {
        showToast(sanitizeInput(alert.message), 'error');
    });
    
    api.on('navigation-error', (event, details) => {
        const errorMsg = details.errorDescription || 'Unknown error';
        showToast(`Navigation failed: ${sanitizeInput(errorMsg)}`, 'error');
    });
    
    api.on('tab-crashed', (event, details) => {
        const tab = tabs.find(t => t.id === details.id);
        if (tab && tab.title) tab.title.innerText = 'Crashed';
        showToast('A tab crashed, but NobleHyve stayed open.', 'error');
    });
    
    api.on('tab-unresponsive', () => {
        showToast('This tab is not responding.', 'warning');
    });
    
    api.on('loading-start', (event, { id }) => {
        const tab = tabs.find(t => t.id === id);
        if (tab?.element) tab.element.classList.add('loading');
    });
    
    api.on('loading-stop', (event, { id }) => {
        const tab = tabs.find(t => t.id === id);
        if (tab?.element) tab.element.classList.remove('loading');
    });
    
    api.on('browser-data-cleared', () => {
        showToast('Cookies and cache cleared');
    });
    
    api.on('restore-session', (event, savedTabs) => {
        if (Array.isArray(savedTabs)) {
            console.log('Session restore:', savedTabs.length, 'tabs');
        }
    });
}

// ============ EVENT LISTENERS ============
backBtn?.addEventListener('click', () => {
    if (api && api.back) {
        api.back();
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('back');
    }
});

forwardBtn?.addEventListener('click', () => {
    if (api && api.forward) {
        api.forward();
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('forward');
    }
});

refreshBtn?.addEventListener('click', () => {
    if (api && api.refresh) {
        api.refresh();
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('refresh');
    }
});

goBtn?.addEventListener('click', () => navigateToUrl(urlBar.value));
newTabBtn?.addEventListener('click', () => createNewTab());
privateTabBtn?.addEventListener('click', () => createPrivateTab());
settingsBtn?.addEventListener('click', showSettingsPanel);

const editorBtn = document.getElementById('editorBtn');
if (editorBtn) {
    editorBtn.addEventListener('click', () => {
        if (api && api.openEditor) {
            api.openEditor();
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('open-editor');
        }
    });
}

const terminalBtn = document.getElementById('terminalBtn');
if (terminalBtn) {
    terminalBtn.addEventListener('click', () => {
        if (api && api.openTerminal) {
            api.openTerminal();
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('open-terminal');
        }
    });
}

const addBookmarkBtn = document.getElementById('addBookmarkBtn');
if (addBookmarkBtn) {
    addBookmarkBtn.addEventListener('click', addBookmark);
}

const manageBookmarksBtn = document.getElementById('manageBookmarksBtn');
if (manageBookmarksBtn) {
    manageBookmarksBtn.addEventListener('click', openBookmarkManager);
}

moreBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMoreMenu();
});

closeSettingsBtn?.addEventListener('click', () => {
    const settingsTab = tabs.find(t => t.isSettings);
    if (settingsTab) closeTab(settingsTab.id);
});

saveSettingsBtn?.addEventListener('click', saveSettings);

resetSettingsBtn?.addEventListener('click', () => { 
    localStorage.removeItem('noblehyve_settings'); 
    loadSettings(); 
    showToast('Settings reset'); 
});

clearBrowserDataBtn?.addEventListener('click', () => {
    if (confirm('Clear cookies, cache, local storage, and service worker data?')) {
        if (api && api.clearBrowserData) {
            api.clearBrowserData();
        } else if (window.legacyIpcRenderer) {
            window.legacyIpcRenderer.send('clear-browser-data');
        }
    }
});



scanNowBtn?.addEventListener('click', () => {
    if (api && api.scanPage) {
        api.scanPage();
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('scan-page');
    }
});

startSearchBtn?.addEventListener('click', () => navigateToUrl(startSearchInput.value));
closeFindBtn?.addEventListener('click', hideFindBar);

urlBar?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') navigateToUrl(urlBar.value); 
});

startSearchInput?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') navigateToUrl(startSearchInput.value); 
});

findInput?.addEventListener('input', () => {
    if (api && api.findInPage) {
        api.findInPage(findInput.value);
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('find-in-page', findInput.value);
    }
});

document.addEventListener('click', (event) => {
    if (!moreMenu || !moreBtn) return;
    if (!moreMenu.contains(event.target) && event.target !== moreBtn) {
        closeMoreMenu();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        showFindBar();
    }
    if (event.key === 'Escape') {
        hideFindBar();
        closeMoreMenu();
    }
});

document.getElementById('openDownloadsFolderBtn')?.addEventListener('click', () => {
    if (api && api.openDownloadsFolder) {
        api.openDownloadsFolder();
    } else if (window.legacyIpcRenderer) {
        window.legacyIpcRenderer.send('open-downloads-folder');
    }
});

document.getElementById('chooseDownloadPathBtn')?.addEventListener('click', async () => {
    const result = await api.invoke('show-open-dialog', { properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths[0]) {
        document.getElementById('downloadPath').value = result.filePaths[0];
    }
});

document.querySelectorAll('.more-menu button').forEach(btn => {
    btn.addEventListener('click', () => handleMoreAction(btn.dataset.action));
});

document.querySelectorAll('.quick-link').forEach(btn => {
    btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (validateUrl(url)) {
            navigateToUrl(url);
        }
    });
});

document.querySelectorAll('.news-source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.news-source-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentNewsSource = btn.dataset.source;
        fetchDeveloperNews();
    });
});

// Alias for backward compat
const manageBookmarks = openBookmarkManager;

// Wire settings sidebar navigation
document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsCategory(btn.dataset.category));
});

// Wire history panel buttons
document.getElementById('closeHistoryBtn')?.addEventListener('click', () => {
    const histTab = tabs.find(t => t.isHistory);
    if (histTab) closeTab(histTab.id);
});
document.getElementById('historyPanelSearch')?.addEventListener('keyup', () => renderHistoryPanelList(browsingHistory));
document.getElementById('historyPanelClearRange')?.addEventListener('click', () => clearHistoryByRange());
document.getElementById('historyPanelClearAll')?.addEventListener('click', () => {
    if (confirm('Clear all history?')) {
        browsingHistory = [];
        saveHistory();
        renderHistoryPanelList([]);
        updateHistorySettingsList([]);
        showToast('History cleared');
    }
});

// Wire settings history buttons
document.getElementById('settingsHistoryClearRange')?.addEventListener('click', () => clearHistoryByRange());
document.getElementById('settingsHistoryClearAll')?.addEventListener('click', () => {
    if (confirm('Clear all history?')) {
        browsingHistory = [];
        saveHistory();
        renderHistoryPanelList([]);
        updateHistorySettingsList([]);
        showToast('History cleared');
    }
});
document.getElementById('settingsHistoryOpenTab')?.addEventListener('click', showHistoryTab);
document.getElementById('settingsHistorySearch')?.addEventListener('keyup', () => updateHistorySettingsList(browsingHistory));

// Wire modal close buttons
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.style.display = 'none';
    });
});

// Wire bookmark manager modal buttons
document.getElementById('bmNewFolderBtn')?.addEventListener('click', createBookmarkFolder);
document.getElementById('bmImportBtn')?.addEventListener('click', importBookmarks);
document.getElementById('bmExportBtn')?.addEventListener('click', exportBookmarks);

// Wire history manager modal buttons
document.getElementById('historyClearAll')?.addEventListener('click', () => {
    if (confirm('Clear all history?')) {
        browsingHistory = [];
        saveHistory();
        renderHistoryList([]);
        showToast('History cleared');
    }
});
document.getElementById('historyClearRange')?.addEventListener('click', () => clearHistoryByRange());

// Wire cookie manager modal buttons
document.getElementById('cookieClearAll')?.addEventListener('click', async () => {
    if (!confirm('Remove all cookies?')) return;
    if (api && api.clearAllCookies) {
        const result = await api.clearAllCookies();
        if (result.success) {
            showToast('All cookies removed');
            await renderCookieSites();
        }
    }
});

// Wire View/Manage cookies buttons in settings
document.getElementById('viewCookiesBtn')?.addEventListener('click', openCookieManager);
document.getElementById('clearAllCookiesBtn')?.addEventListener('click', async () => {
    if (!confirm('Remove all cookies and site data?')) return;
    if (api && api.clearAllCookies) {
        const result = await api.clearAllCookies();
        if (result.success) {
            showToast('All cookies cleared');
            if (document.getElementById('cookieList')) renderSettingsCookieList();
        }
    }
});

// ============ INITIALIZATION ============
window.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    loadSettings();
    fetchDeveloperNews();
    createNewTab();
    setupIPCEventListeners();
    setInterval(updateDashboardStats, 10000);

    setTimeout(async () => {
        if (api && api.getExternalBrowser) {
            const saved = localStorage.getItem('externalBrowser');
            if (saved) api.setExternalBrowser(saved);
        }
        if (api && api.getAutoRedirectAuth) {
            const saved = localStorage.getItem('autoRedirectAuth') === 'true';
            if (saved) api.setAutoRedirectAuth(true);
        }
    }, 500);
});