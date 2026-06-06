let currentServers = []
let currentPathId = 'root'
let pathStack = ['root']
let isSelectMode = false
let selectedItems = new Map()
let currentListItems = []
let currentServerType = null

function showSnackbar(message) {
    const snackbar = document.getElementById('snackbar')
    snackbar.textContent = message
    snackbar.classList.add('show')
    setTimeout(() => {
        snackbar.classList.remove('show')
    }, 3000)
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
    const headers = { 'Content-Type': 'application/json' }
    try {
        const authData = localStorage.getItem('songloft-auth')
        if (authData) {
            const auth = JSON.parse(authData)
            if (auth.accessToken) {
                headers['Authorization'] = 'Bearer ' + auth.accessToken
            }
        }
    } catch (e) {}
    return headers
}

function updateFormVisibility() {
    const type = document.getElementById('serverType').value
    const saltGroup = document.getElementById('saltGroup')
    const usernameGroup = document.getElementById('usernameGroup')
    
    if (type === 'subsonic') {
        saltGroup.style.display = 'block'
        usernameGroup.style.display = 'block'
    } else if (type === 'dav') {
        saltGroup.style.display = 'none'
        usernameGroup.style.display = 'block'
    }
}

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
    const type = document.getElementById('serverType').value
    const baseData = {
        type,
        name: document.getElementById('subName').value.trim(),
        url: document.getElementById('subUrl').value.trim()
    }
    
    if (type === 'subsonic') {
        return {
            ...baseData,
            username: document.getElementById('subUsername').value.trim(),
            password: document.getElementById('subPassword').value.trim(),
            salt: document.getElementById('subSalt').value.trim(),
            version: '1.16.1'
        }
    } else if (type === 'dav') {
        return {
            ...baseData,
            username: document.getElementById('subUsername').value.trim(),
            password: document.getElementById('subPassword').value.trim()
        }
    }
    return baseData
}

async function testServer() {
    const data = getFormData()
    if (!data.url) { showSnackbar('地址不能为空'); return }
    if (data.type === 'subsonic' && !data.username) { showSnackbar('用户名不能为空'); return }
    
    try {
        const res = await fetch('./test', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) })
        if (!res.ok) throw new Error(await res.text())
        const result = await res.json()
        if (result.success) showSnackbar('测试通过！')
        else showSnackbar('测试失败: ' + (result.error || '未知错误'))
    } catch (e) { showSnackbar('测试请求出错: ' + e) }
}

async function addServer() {
    const data = getFormData()
    if (!data.name || !data.url) { showSnackbar('名称和地址不能为空'); return }
    if (data.type === 'subsonic' && !data.username) { showSnackbar('用户名不能为空'); return }
    
    try {
        const res = await fetch('./lists', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) })
        if (res.ok) {
            showSnackbar('保存成功')
            document.getElementById('subName').value = ''
            document.getElementById('subUrl').value = ''
            document.getElementById('subUsername').value = ''
            document.getElementById('subPassword').value = ''
            document.getElementById('subSalt').value = ''
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
    
    const usernameGroup = document.getElementById('editUsernameGroup')
    const passwordGroup = document.getElementById('editPasswordGroup')
    const saltGroup = document.getElementById('editSaltGroup')
    
    if (server.type === 'subsonic') {
        usernameGroup.style.display = 'block'
        passwordGroup.style.display = 'block'
        saltGroup.style.display = 'block'
        document.getElementById('editUsername').value = server.username || ''
        document.getElementById('editPassword').value = ''
        document.getElementById('editSalt').value = server.salt || ''
    } else if (server.type === 'dav') {
        usernameGroup.style.display = 'block'
        passwordGroup.style.display = 'block'
        saltGroup.style.display = 'none'
        document.getElementById('editUsername').value = server.username || ''
        document.getElementById('editPassword').value = ''
    }
    
    document.getElementById('editDialog').classList.add('show')
}

function closeEditDialog() { document.getElementById('editDialog').classList.remove('show') }

async function saveEditServer() {
    const name = document.getElementById('editName').value.trim()
    const server = currentServers.find(s => s.name === name)
    if (!server) return
    
    const data = {
        type: server.type,
        name,
        url: document.getElementById('editUrl').value.trim(),
        username: document.getElementById('editUsername').value.trim(),
        password: document.getElementById('editPassword').value.trim()
    }
    
    if (server.type === 'subsonic') {
        data.salt = document.getElementById('editSalt').value.trim()
        data.version = '1.16.1'
    }
    
    if (!data.url) { showSnackbar('地址不能为空'); return }
    if (data.type === 'subsonic' && !data.username) { showSnackbar('用户名不能为空'); return }
    
    try {
        const res = await fetch('./lists', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) })
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
        
        const typeLabel = server.type === 'subsonic' ? 'Subsonic' : 'WebDAV'
        const typeColor = server.type === 'subsonic' ? 'var(--md-primary)' : 'var(--md-secondary)'
        
        item.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:16px;color:var(--md-on-surface);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${server.name}</span>
                    <span style="font-size:12px;padding:2px 8px;background:${typeColor}20;color:${typeColor};border-radius:4px;">${typeLabel}</span>
                </div>
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

function renderBrowserSelect() {
    const select = document.getElementById('browserServerSelect')
    const currentVal = select.value
    select.innerHTML = '<option value="">请选择服务器...</option>'
    currentServers.forEach(server => {
        const opt = document.createElement('option')
        opt.value = server.name
        const typeLabel = server.type === 'subsonic' ? '(Subsonic)' : '(WebDAV)'
        opt.textContent = `${server.name} ${typeLabel}`
        select.appendChild(opt)
    })
    
    if (currentServers.some(s => s.name === currentVal)) {
        select.value = currentVal
        updateDiscoveryArea(currentVal)
        document.getElementById('toggleSelectModeBtn').style.display = 'block'
    } else {
        document.getElementById('browserList').innerHTML = '<div class="empty-state">请选择服务器进行浏览</div>'
        document.getElementById('discoveryArea').style.display = 'none'
        document.getElementById('toggleSelectModeBtn').style.display = 'none'
        pathStack = ['root']
        currentPathId = 'root'
    }
}

function updateDiscoveryArea(serverName) {
    const server = currentServers.find(s => s.name === serverName)
    if (!server) return
    
    currentServerType = server.type
    document.getElementById('discoveryArea').style.display = 'flex'
    
    const chipStarred = document.getElementById('chipStarred')
    const chipRandom = document.getElementById('chipRandom')
    const chipPlaylists = document.getElementById('chipPlaylists')
    const searchInput = document.getElementById('searchInput')
    const searchBtn = document.getElementById('searchBtn')
    
    if (server.type === 'subsonic') {
        chipStarred.style.display = 'flex'
        chipRandom.style.display = 'flex'
        chipPlaylists.style.display = 'flex'
        searchInput.style.display = 'block'
        searchBtn.style.display = 'block'
    } else if (server.type === 'dav') {
        chipStarred.style.display = 'none'
        chipRandom.style.display = 'none'
        chipPlaylists.style.display = 'none'
        searchInput.style.display = 'none'
        searchBtn.style.display = 'none'
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
    
    if (isSelectMode) {
        const selectAllDiv = document.createElement('div')
        selectAllDiv.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant);cursor:pointer;gap:12px;'
        const allSelected = items.every(item => item.type !== 'directory' && selectedItems.has(item.id))
        selectAllDiv.innerHTML = `
            <input type="checkbox" class="checkbox-custom" ${allSelected ? 'checked' : ''} style="pointer-events:none">
            <span style="font-weight:500;font-size:14px;color:var(--md-primary)">全选本页歌曲</span>
        `
        selectAllDiv.onclick = () => {
            const willSelect = !allSelected
            items.forEach(item => {
                if (item.type !== 'directory') {
                    if (willSelect) selectedItems.set(item.id, item)
                    else selectedItems.delete(item.id)
                }
            })
            renderItems(items, title)
            updateFAB()
        }
        container.appendChild(selectAllDiv)
    }

    items.forEach(item => {
        const el = document.createElement('div')
        el.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--md-outline-variant);cursor:pointer;'
        el.classList.add('browser-item')
        
        const isSelected = selectedItems.has(item.id)
        const icon = item.type === 'directory' ? 'folder_special' : 'music_note'
        const color = item.type === 'directory' ? 'var(--md-primary)' : 'var(--md-on-surface)'
        const subtitle = item.type === 'directory' ? '目录' : (item.artist ? item.artist + ' - ' : '') + (item.album || '')
        
        let leadingHtml = ''
        if (isSelectMode && item.type !== 'directory') {
            leadingHtml = `<input type="checkbox" class="checkbox-custom" ${isSelected ? 'checked' : ''} style="pointer-events:none;margin-right:12px;">`
        } else {
            leadingHtml = `<span class="material-symbols-outlined" style="color:${color};margin-right:12px">${icon}</span>`
        }

        let trailingHtml = ''
        if (item.type !== 'directory') {
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
                if (item.isPlaylist) {
                    pathStack.push({ type: 'playlist', id: item.id })
                    loadPlaylist(serverName, item.id)
                } else {
                    pathStack.push(item.id)
                    loadDirectory(serverName, item.id)
                }
            } else {
                if (isSelectMode) {
                    if (isSelected) selectedItems.delete(item.id)
                    else selectedItems.set(item.id, item)
                    renderItems(items, title)
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
    const title = document.getElementById('browserPathDisplay').textContent
    renderItems(currentListItems, title)
}

async function loadDirectory(serverName, dirId) {
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    document.getElementById('browserUpBtn').style.display = dirId === 'root' ? 'none' : 'block'
    
    const server = currentServers.find(s => s.name === serverName)
    if (!server) return
    
    try {
        let url
        if (server.type === 'subsonic') {
            url = `./lists/${encodeURIComponent(serverName)}/items?id=${encodeURIComponent(dirId)}`
        } else if (server.type === 'dav') {
            url = `./lists/${encodeURIComponent(serverName)}/items?path=${encodeURIComponent(dirId === 'root' ? '/' : dirId)}`
        }
        
        const res = await fetch(url, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = dirId
        renderItems(items, dirId === 'root' ? (server.type === 'subsonic' ? '艺术家' : '根目录') : `[ID: ${dirId}]`)
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

async function loadPlaylist(serverName, playlistId) {
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    document.getElementById('browserUpBtn').style.display = 'block'
    
    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/playlists/${encodeURIComponent(playlistId)}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const items = await res.json()
        currentPathId = playlistId
        renderItems(items, '歌单')
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

async function searchSongsList() {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return
    const keyword = document.getElementById('searchInput').value.trim()
    if (!keyword) return
    
    pathStack = ['root']
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

async function fetchSpecialList(type, title) {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return
    
    pathStack = ['root']
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

async function fetchPlaylists() {
    const serverName = document.getElementById('browserServerSelect').value
    if (!serverName) return
    
    pathStack = ['root']
    document.getElementById('browserUpBtn').style.display = 'none'
    const container = document.getElementById('browserList')
    container.innerHTML = '<div class="empty-state">加载中...</div>'
    
    try {
        const res = await fetch(`./lists/${encodeURIComponent(serverName)}/playlists`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error(await res.text())
        const playlists = await res.json()
        currentPathId = 'playlists'
        
        const items = playlists.map(p => ({
            id: p.id,
            name: p.name,
            type: 'directory',
            isPlaylist: true,
            songCount: p.songCount,
            comment: p.comment
        }))
        
        renderItems(items, '服务器歌单')
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color:var(--md-error)">加载失败: ${e}</div>`
    }
}

async function submitImport(itemsToImport) {
    const serverName = document.getElementById('browserServerSelect').value
    const server = currentServers.find(s => s.name === serverName)
    if (!server) return null
    
    const reqs = itemsToImport.map(item => {
        const sourceData = server.type === 'subsonic' 
            ? { configName: serverName, songId: item.id, type: 'subsonic' }
            : { configName: serverName, path: item.id, type: 'dav' }
        
        const dedupKey = server.type === 'subsonic'
            ? `subsonic_${serverName}_${item.id}`
            : `dav_${serverName}_${item.id}`
        
        return {
            title: item.name,
            artist: item.artist || 'Unknown',
            album: item.album || '',
            cover_url: item.coverArt || '',
            duration: item.duration || 0,
            plugin_entry_path: 'unified',
            source_data: JSON.stringify(sourceData),
            dedup_key: dedupKey
        }
    })
    
    try {
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
    
    document.getElementById('serverType').onchange = updateFormVisibility
    updateFormVisibility()
    
    document.getElementById('refreshBtn').onclick = fetchServers
    document.getElementById('testServerBtn').onclick = testServer
    document.getElementById('addServerBtn').onclick = addServer
    document.getElementById('cancelEditBtn').onclick = closeEditDialog
    document.getElementById('saveEditBtn').onclick = saveEditServer
    
    document.getElementById('browserServerSelect').onchange = (e) => {
        const val = e.target.value
        if (val) {
            updateDiscoveryArea(val)
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
        
        if (typeof parentId === 'object' && parentId.type === 'playlist') {
            // 从歌单返回歌单列表
            fetchPlaylists()
        } else if (parentId === 'root' || typeof parentId === 'string') {
            loadDirectory(server, parentId)
        }
    }

    document.getElementById('searchBtn').onclick = searchSongsList
    document.getElementById('searchInput').onkeydown = (e) => {
        if (e.key === 'Enter') searchSongsList()
    }
    document.getElementById('chipStarred').onclick = () => fetchSpecialList('starred', '我的收藏')
    document.getElementById('chipRandom').onclick = () => fetchSpecialList('random', '随便听听')
    document.getElementById('chipPlaylists').onclick = fetchPlaylists
    
    document.getElementById('toggleSelectModeBtn').onclick = toggleSelectMode
    document.getElementById('fabCancelBtn').onclick = toggleSelectMode
    
    document.getElementById('fabImportBtn').onclick = async () => {
        if (selectedItems.size === 0) return
        showProgress(true, '批量导入', `正在导入 ${selectedItems.size} 首歌曲...`)
        try {
            await submitImport(Array.from(selectedItems.values()))
            showProgress(false)
            showSnackbar(`成功导入 ${selectedItems.size} 首歌曲`)
            toggleSelectMode()
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
            const songs = await submitImport(Array.from(selectedItems.values()))
            const songIds = songs.map(s => s.id)
            
            const playlistRes = await fetch(window.location.origin + '/api/v1/playlists', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, description: '从统一音乐源导入', type: 'normal' })
            })
            if (!playlistRes.ok) throw new Error('创建歌单失败')
            const playlist = await playlistRes.json()
            
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

    fetchServers()
})
