let currentServers = []
let currentPathId = 'root'
let pathStack = ['root']
let isSelectMode = false
let selectedItems = new Map() // id -> item
let currentListItems = [] // store current view items

function showSnackbar(message) {
    const snackbar = document.getElementById('snackbar');
    snackbar.textContent = message;
    snackbar.classList.add('show');
    setTimeout(() => {
        snackbar.classList.remove('show');
    }, 3000);
}

function showProgress(show, title = '正在处理', text = '请稍候...') {
    const dlg = document.getElementById('progressDialog')
    if (show) {
        document.getElementById('progressTitle').textContent = title
        document.getElementById('progressText').textContent = text
        dlg.classList.add('show')
    } else {
        dlg.classList.remove('show')
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'))
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'))
    document.getElementById(`tab-${tabId}`).classList.add('active')
    document.querySelector(`.tab-item[data-tab="${tabId}"]`).classList.add('active')
}

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = SongloftPlugin.getAuthToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
}

// ... server management functions ...
async function fetchServers() {
    try {
        const res = await fetch('./lists', { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        currentServers = data
        renderServerList()
        renderBrowserSelect()
    } catch (e) {
        showSnackbar('获取服务器失败: ' + e)
    }
}

function getFormData() {
    return {
        name: document.getElementById('subName').value.trim(),
        url: document.getElementById('subUrl').value.trim(),
        username: document.getElementById('subUsername').value.trim(),
        password: document.getElementById('subPassword').value.trim(),
        salt: document.getElementById('subSalt').value.trim(),
        pathPrefix: document.getElementById('subPathPrefix').value,
    }
}

async function testServer() {
    const data = getFormData()
    if (!data.url || !data.username) { showSnackbar('地址和用户名不能为空'); return }
    const payload = { name: data.name || 'test', url: data.url, username: data.username, version: '1.16.1', pathPrefix: data.pathPrefix }
    if (data.salt) { payload.token = data.password; payload.salt = data.salt } else { payload.password = data.password }
    try {
        const res = await fetch('./test', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) })
        if (!res.ok) throw new Error(await res.text())
        const result = await res.json()
        if (result.success) showSnackbar('测试通过！')
        else showSnackbar('测试失败: ' + (result.error || '未知错误'))
    } catch (e) { showSnackbar('测试请求出错: ' + e) }
}

async function addServer() {
    const data = getFormData()
    if (!data.name || !data.url || !data.username) { showSnackbar('名称、地址和用户名不能为空'); return }
    const payload = { name: data.name, url: data.url, username: data.username, version: '1.16.1', pathPrefix: data.pathPrefix }
    if (data.salt) { payload.token = data.password; payload.salt = data.salt } else { payload.password = data.password }
    try {
        const res = await fetch('./lists', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) })
        if (res.ok) {
            showSnackbar('保存成功')
            document.getElementById('subName').value = ''
            document.getElementById('subUrl').value = ''
            document.getElementById('subUsername').value = ''
            document.getElementById('subPassword').value = ''
            document.getElementById('subSalt').value = ''
            document.getElementById('subPathPrefix').value = '/rest'
            fetchServers()
        }
    } catch (e) { showSnackbar('保存失败: ' + e) }
}

async function deleteServer(name) {
    if (!confirm(`确定删除 ${name} 吗？`)) return
    try {
        const res = await fetch(`./lists/${encodeURIComponent(name)}`, { method: 'DELETE', headers: getAuthHeaders() })
        if (res.ok) { showSnackbar('删除成功'); fetchServers() }
    } catch (e) { showSnackbar('删除失败: ' + e) }
}

function openEditDialog(name) {
    const server = currentServers.find(s => s.name === name)
    if (!server) return
    document.getElementById('editName').value = server.name || ''
    document.getElementById('editUrl').value = server.url || ''
    document.getElementById('editUsername').value = server.username || ''
    document.getElementById('editPassword').value = ''
    document.getElementById('editSalt').value = server.salt || ''
    document.getElementById('editPathPrefix').value = server.pathPrefix !== undefined ? server.pathPrefix : '/rest'
    document.getElementById('editDialog').classList.add('show')
}

function closeEditDialog() { document.getElementById('editDialog').classList.remove('show') }

async function saveEditServer() {
    const data = {
        name: document.getElementById('editName').value.trim(),
        url: document.getElementById('editUrl').value.trim(),
        username: document.getElementById('editUsername').value.trim(),
        password: document.getElementById('editPassword').value.trim(),
        salt: document.getElementById('editSalt').value.trim(),
        pathPrefix: document.getElementById('editPathPrefix').value,
    }
    if (!data.url || !data.username) { showSnackbar('地址和用户名不能为空'); return }
    const payload = { name: data.name, url: data.url, username: data.username, version: '1.16.1', pathPrefix: data.pathPrefix }
    if (data.salt) { payload.token = data.password; payload.salt = data.salt } else { payload.password = data.password }
    try {
        const res = await fetch('./lists', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) })
        if (res.ok) {
            showSnackbar('修改成功')
            closeEditDialog()
            fetchServers()
        } else showSnackbar('修改失败')
    } catch (e) { showSnackbar('修改异常: ' + e) }
}

function renderServerList() {
    const container = document.getElementById('serverList')
    if (currentServers.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无服务器，请先添加</div>'
        return
    }
    container.innerHTML = ''
    currentServers.forEach(server => {
        const item = document.createElement('div')
        item.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant)'
        item.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div style="font-size:16px;color:var(--md-on-surface);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${server.name}</div>
                <div style="font-size:13px;color:var(--md-on-surface-variant);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${server.url}</div>
            </div>
            <div class="list-item-trailing">
                <button class="btn-icon btn-edit" title="编辑" style="color:var(--md-primary)"><span class="material-symbols-outlined">edit</span></button>
                <button class="btn-icon btn-delete" style="color:var(--md-error)" title="删除"><span class="material-symbols-outlined">delete</span></button>
            </div>
        `
        item.querySelector('.btn-edit').onclick = () => openEditDialog(server.name)
        item.querySelector('.btn-delete').onclick = () => deleteServer(server.name)
        container.appendChild(item)
    })
}

// ... browser functions ...
function renderBrowserSelect() {
    const select = document.getElementById('browserServerSelect')
    const currentVal = select.value
    select.innerHTML = '<option value="">请选择服务器...</option>'
    currentServers.forEach(server => {
        const opt = document.createElement('option')
        opt.value = server.name
        opt.textContent = server.name
        select.appendChild(opt)
    })
    
    if (currentServers.some(s => s.name === currentVal)) {
        select.value = currentVal
        document.getElementById('discoveryArea').style.display = 'flex'
        document.getElementById('toggleSelectModeBtn').style.display = 'block'
    } else {
        document.getElementById('browserList').innerHTML = '<div class="empty-state">请选择服务器进行浏览</div>'
        document.getElementById('discoveryArea').style.display = 'none'
        document.getElementById('toggleSelectModeBtn').style.display = 'none'
        pathStack = ['root']
        currentPathId = 'root'
    }
}

function renderItems(items, title) {
    currentListItems = items
    const container = document.getElementById('browserList')
    document.getElementById('browserPathDisplay').textContent = title
    
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">空目录或无结果</div>'
        return
    }
    
    container.innerHTML = ''
    
    // Add "Select All" button in select mode
    if (isSelectMode) {
        const selectAllDiv = document.createElement('div')
        selectAllDiv.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant);cursor:pointer;gap:12px;'
        const allSelected = items.every(item => item.type !== 'file' || selectedItems.has(item.id))
        selectAllDiv.innerHTML = `
            <input type="checkbox" class="checkbox-custom" ${allSelected ? 'checked' : ''} style="pointer-events:none">
            <span style="font-weight:500;font-size:14px;color:var(--md-primary)">全选本页歌曲</span>
        `
        selectAllDiv.onclick = () => {
            const willSelect = !allSelected
            items.forEach(item => {
                if (item.type === 'file') {
                    if (willSelect) selectedItems.set(item.id, item)
                    else selectedItems.delete(item.id)
                }
            })
            renderItems(items, title) // re-render to update checkboxes
            updateFAB()
        }
        container.appendChild(selectAllDiv)
    }

    items.forEach(item => {
        const el = document.createElement('div')
        el.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant);cursor:pointer;'
        el.classList.add('browser-item')
        
        const isSelected = selectedItems.has(item.id)
        
        const icon = item.type === 'directory' ? 'folder_special' : item.type === 'playlist' ? 'queue_music' : 'music_note'
        const color = (item.type === 'directory' || item.type === 'playlist') ? 'var(--md-primary)' : 'var(--md-on-surface)'
        const subtitle = item.type === 'directory' ? 'Artist/Album' : item.type === 'playlist' ? `${item.songCount || 0} 首歌曲` : (item.artist ? item.artist + ' - ' : '') + (item.album || '')
        
        // Front section (Icon or Checkbox)
        let leadingHtml = ''
        if (isSelectMode && item.type === 'file') {
            leadingHtml = `<input type="checkbox" class="checkbox-custom" ${isSelected ? 'checked' : ''} style="pointer-events:none;margin-right:12px;">`
        } else {
            leadingHtml = `<span class="material-symbols-outlined" style="color:${color};margin-right:12px">${icon}</span>`
        }

        // Trailing section (Import button)
        let trailingHtml = ''
        if (item.type === 'file') {
            trailingHtml = `<button class="btn-icon" title="导入此曲" style="color:var(--md-primary);" onclick="event.stopPropagation(); window._importSingle('${item.id}')"><span class="material-symbols-outlined">add_circle</span></button>`
        }

        el.innerHTML = `
            ${leadingHtml}
            <div style="flex:1;overflow:hidden">
                <div style="font-size:14px;color:var(--md-on-surface);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
                <div style="font-size:12px;color:var(--md-on-surface-variant);margin-top:2px">${subtitle}</div>
            </div>
            ${trailingHtml}
        `
        
        el.onclick = () => {
            if (item.type === 'directory') {
                const serverName = document.getElementById('browserServerSelect').value
                pathStack.push(item.id)
                loadDirectory(serverName, item.id)
            } else if (item.type === 'playlist') {
                const serverName = document.getElementById('browserServerSelect').value
                loadPlaylistSongs(serverName, item.id, item.name)
            } else {
                if (isSelectMode) {
                    if (isSelected) selectedItems.delete(item.id)
                    else selectedItems.set(item.id, item)
                    renderItems(items, title) // re-render this item would be better, but re-rendering all is fine for small lists
                    updateFAB()
                } else {
                    showSnackbar('可以直接播放: ' + item.name)
                }
            }
        }
        
        container.appendChild(el)
    })
}

function updateFAB() {
    const fab = document.getElementById('fabContainer')
    if (isSelectMode && selectedItems.size > 0) {
        fab.classList.add('show')
        document.getElementById('fabSelectionCount').textContent = `已选 ${selectedItems.size} 首`
    } else {
        fab.classList.remove('show')
    }
}

function toggleSelectMode() {
    isSelectMode = !isSelectMode
    selectedItems.clear()
    const btn = document.getElementById('toggleSelectModeBtn')
    if (isSelectMode) {
        btn.innerHTML = '<span class="material-symbols-outlined">close</span> 取消选择'
        btn.style.color = 'var(--md-error)'
    } else {
        btn.innerHTML = '<span class="material-symbols-outlined">checklist</span> 多选'
        btn.style.color = 'var(--md-on-surface)'
    }
    updateFAB()
    // Re-render current list
    const title = document.getElementById('browserPathDisplay').textContent
    renderItems(currentListItems, title)
}

async function loadDirectory(serverName, dirId) {
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    document.getElementById('browserUpBtn').style.display = dirId === 'root' ? 'none' : 'block'
    
    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/items?id=${encodeURIComponent(dirId)}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = dirId
        renderItems(items, dirId === 'root' ? 'Artists' : `[ID: ${dirId}]`)
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

async function searchSongsList() {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return
    const keyword = document.getElementById('searchInput').value.trim()
    if (!keyword) return
    
    pathStack = ['root'] // reset stack
    document.getElementById('browserUpBtn').style.display = 'none'
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">搜索中...</div>'
    
    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/search?q=${encodeURIComponent(keyword)}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = 'search'
        renderItems(items, `搜索结果: ${keyword}`)
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">搜索失败: ${e}</div>`
    }
}

async function fetchPlaylists() {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return

    pathStack = ['root', 'playlists']
    document.getElementById('browserUpBtn').style.display = 'block'
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'

    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/playlists`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = 'playlists'
        renderItems(items, '歌单列表')
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

async function loadPlaylistSongs(serverName, playlistId, playlistName) {
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    document.getElementById('browserUpBtn').style.display = 'block'
    pathStack.push(playlistId)

    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/playlists/${encodeURIComponent(playlistId)}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = `playlist_${playlistId}`
        renderItems(items, playlistName)
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

async function fetchSpecialList(type, title) {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return
    
    pathStack = ['root'] // reset stack
    document.getElementById('browserUpBtn').style.display = 'none'
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    
    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/${type}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = type
        renderItems(items, title)
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

// 核心入库逻辑
async function submitImport(itemsToImport) {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return null
    
    const reqs = itemsToImport.map(item => {
        // 列表项已带歌词延迟加载 URL(lyric_source=url),入库时必须一并写入,
        // 否则宿主 songs 表歌词字段全空,播放时 /songs/{id}/lyric 会 404(songloft-org/songloft#254)。
        const lyricUrl = item.lyricUrl || item.lyric || ''
        return {
            title: item.name,
            artist: item.artist || 'Unknown',
            album: item.album || '',
            cover_url: item.coverArt || '',
            duration: item.duration || 0,
            plugin_entry_path: 'subsonic',
            source_data: JSON.stringify({ configName: serverName, songId: item.id }),
            dedup_key: `subsonic_${serverName}_${item.id}`,
            // lyric_remote_url 后端优先级最高,会自动置 lyric_source=url
            ...(lyricUrl ? { lyric_remote_url: lyricUrl } : {})
        }
    })
    
    try {
        // We use absolute path to hit the core API (which is hosted at the root)
        // Since the plugin is at /api/v1/jsplugin/subsonic, the root is 4 levels up.
        // It's safer to use origin
        const coreApiUrl = window.location.origin + '/api/v1/songs/remote'
        const res = await fetch(coreApiUrl, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(reqs)
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return data.songs || []
    } catch (e) {
        console.error('Import failed', e)
        throw e
    }
}

window._importSingle = async function(id) {
    const item = currentListItems.find(i => i.id === id)
    if (!item) return
    showProgress(true, '导入中', '正在将歌曲存入曲库...')
    try {
        await submitImport([item])
        showProgress(false)
        showSnackbar('单曲导入成功！')
    } catch (e) {
        showProgress(false)
        showSnackbar('导入失败: ' + e.message)
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab)
    })
    
    document.getElementById('refreshBtn').onclick = fetchServers
    document.getElementById('testServerBtn').onclick = testServer
    document.getElementById('addServerBtn').onclick = addServer
    document.getElementById('cancelEditBtn').onclick = closeEditDialog
    document.getElementById('saveEditBtn').onclick = saveEditServer
    
    document.getElementById('browserServerSelect').onchange = (e) => {
        const val = e.target.value
        if (val) {
            document.getElementById('discoveryArea').style.display = 'flex'
            document.getElementById('toggleSelectModeBtn').style.display = 'block'
            pathStack = ['root']
            loadDirectory(val, 'root')
        } else {
            document.getElementById('browserList').innerHTML = '<div class="empty-state">请选择服务器进行浏览</div>'
            document.getElementById('discoveryArea').style.display = 'none'
            document.getElementById('toggleSelectModeBtn').style.display = 'none'
            if(isSelectMode) toggleSelectMode()
        }
    }
    
    document.getElementById('browserUpBtn').onclick = () => {
        const server = document.getElementById('browserServerSelect').value
        if (!server || pathStack.length <= 1) return
        pathStack.pop()
        const parentId = pathStack[pathStack.length - 1]
        if (parentId === 'playlists') {
            fetchPlaylists()
        } else {
            loadDirectory(server, parentId)
        }
    }

    // Discovery UI
    document.getElementById('searchBtn').onclick = searchSongsList
    document.getElementById('searchInput').onkeydown = (e) => {
        if (e.key === 'Enter') searchSongsList()
    }
    document.getElementById('chipPlaylists').onclick = () => fetchPlaylists()
    document.getElementById('chipStarred').onclick = () => fetchSpecialList('starred', '我的收藏')
    document.getElementById('chipRandom').onclick = () => fetchSpecialList('random', '随便听听')
    
    // Select Mode & FAB
    document.getElementById('toggleSelectModeBtn').onclick = toggleSelectMode
    document.getElementById('fabCancelBtn').onclick = toggleSelectMode
    
    document.getElementById('fabImportBtn').onclick = async () => {
        if (selectedItems.size === 0) return
        showProgress(true, '批量导入', `正在导入 ${selectedItems.size} 首歌曲...`)
        try {
            await submitImport(Array.from(selectedItems.values()))
            showProgress(false)
            showSnackbar(`成功导入 ${selectedItems.size} 首歌曲`)
            toggleSelectMode() // exit select mode
        } catch (e) {
            showProgress(false)
            showSnackbar('导入失败: ' + e.message)
        }
    }

    document.getElementById('fabPlaylistBtn').onclick = () => {
        if (selectedItems.size === 0) return
        document.getElementById('playlistName').value = ''
        document.getElementById('playlistDialog').classList.add('show')
    }
    document.getElementById('cancelPlaylistBtn').onclick = () => {
        document.getElementById('playlistDialog').classList.remove('show')
    }
    
    document.getElementById('confirmPlaylistBtn').onclick = async () => {
        const name = document.getElementById('playlistName').value.trim()
        if (!name) { showSnackbar('请输入歌单名称'); return }
        document.getElementById('playlistDialog').classList.remove('show')
        
        showProgress(true, '创建歌单', `正在导入歌曲并创建歌单...`)
        try {
            // 1. 导入歌曲
            const songs = await submitImport(Array.from(selectedItems.values()))
            const songIds = songs.map(s => s.id)
            
            // 2. 创建歌单
            const playlistRes = await fetch(window.location.origin + '/api/v1/playlists', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name: name, description: 'Imported from Subsonic', type: 'normal' })
            })
            if (!playlistRes.ok) throw new Error('创建歌单失败')
            const playlist = await playlistRes.json()
            
            // 3. 将歌曲添加至歌单
            if (songIds.length > 0) {
                const addRes = await fetch(window.location.origin + `/api/v1/playlists/${playlist.id}/songs`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ song_ids: songIds })
                })
                if (!addRes.ok) throw new Error('添加歌曲到歌单失败')
            }
            
            showProgress(false)
            showSnackbar(`成功创建歌单并导入 ${songIds.length} 首歌曲`)
            toggleSelectMode()
        } catch (e) {
            showProgress(false)
            showSnackbar('操作失败: ' + e.message)
        }
    }

    // === 服务端模式 ===
    async function loadServerConfig() {
        try {
            const res = await fetch('server/config', { headers: getAuthHeaders() })
            if (res.ok) {
                const data = await res.json()
                document.getElementById('serverEnabled').checked = data.enabled
                document.getElementById('serverUsername').value = data.username || ''
            }
        } catch {}
        // 显示连接地址（Subsonic 客户端填写到插件根路径即可，/rest 由客户端自动拼接）
        const base = window.location.origin + window.location.pathname.replace(/\/static\/.*|\/+$/, '')
        document.getElementById('serverUrl').textContent = base
    }

    document.getElementById('saveServerModeBtn').addEventListener('click', async () => {
        const enabled = document.getElementById('serverEnabled').checked
        const username = document.getElementById('serverUsername').value.trim()
        const password = document.getElementById('serverPassword').value
        if (enabled && !password && !username) {
            showSnackbar('请设置用户名和密码')
            return
        }
        const body = { enabled, username: username || 'admin' }
        if (password) body.password = password
        try {
            const res = await fetch('server/config', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            })
            if (res.ok) {
                showSnackbar('服务端配置已保存')
            } else {
                showSnackbar('保存失败')
            }
        } catch (e) {
            showSnackbar('保存失败: ' + e.message)
        }
    })

    document.getElementById('copyUrlBtn').addEventListener('click', () => {
        const text = document.getElementById('serverUrl').textContent
        navigator.clipboard.writeText(text).then(() => showSnackbar('已复制连接地址'))
    })

    // tab 切换时加载服务端配置
    document.querySelectorAll('.tab-item').forEach(el => {
        el.addEventListener('click', () => {
            if (el.dataset.tab === 'server-mode') loadServerConfig()
        })
    })

    fetchServers()
})
