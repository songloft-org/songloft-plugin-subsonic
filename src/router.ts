import { createRouter, jsonResponse, createSearchHandler, createMusicUrlHandler } from '@songloft/plugin-sdk'
import type { HTTPRequest, SearchResultItem } from '@songloft/plugin-sdk'
import { getConfigs, saveConfigs, getConfig, UnifiedConfig, isSubsonicConfig, isDavConfig } from './config'
import { 
  pingConfig, 
  getItems, 
  getStreamUrl, 
  searchSongs, 
  getStarred, 
  getRandomSongs, 
  getLyrics,
  getPlaylists,
  getPlaylist,
  getSubsonicStreamUrl,
  buildDavStreamUrl,
  propfindDav
} from './client'

function parseBody(req: HTTPRequest): any {
  if (!req.body) return {}
  try {
    const str = typeof req.body === 'string'
      ? req.body
      : String.fromCharCode.apply(null, Array.from(req.body as Uint8Array))
    return JSON.parse(str)
  } catch {
    return {}
  }
}

const router = createRouter()

// 列出所有配置
router.get('/lists', async (req: HTTPRequest) => {
  const configs = await getConfigs()
  return jsonResponse(configs.map(c => ({
    id: c.name,
    name: c.name,
    url: c.url,
    type: c.type,
    username: 'username' in c ? c.username : undefined,
    salt: 'salt' in c ? c.salt : undefined
  })))
})

// 添加/更新配置
router.post('/lists', async (req: HTTPRequest) => {
  const data = parseBody(req) as UnifiedConfig
  const configs = await getConfigs()
  const existing = configs.findIndex(c => c.name === data.name)
  if (existing >= 0) {
    const oldConfig = configs[existing]
    if (!data.password && !('token' in data && data.token)) {
      if ('password' in oldConfig) {
        data.password = oldConfig.password
      }
      if ('token' in oldConfig && 'token' in data) {
        data.token = oldConfig.token
        data.salt = oldConfig.salt
      }
    }
    configs[existing] = data
  } else {
    configs.push(data)
  }
  await saveConfigs(configs)
  return jsonResponse({ success: true })
})

// 删除配置
router.delete('/lists/:id', async (req: HTTPRequest, params) => {
  const configs = await getConfigs()
  const filtered = configs.filter(c => c.name !== params.id)
  await saveConfigs(filtered)
  return jsonResponse({ success: true })
})

// 测试连接
router.post('/test', async (req: HTTPRequest) => {
  const data = parseBody(req)
  try {
    const ok = await pingConfig(data as UnifiedConfig)
    return jsonResponse({ success: ok })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) })
  }
})

// 获取特定配置的目录项
router.get('/lists/:id/items', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) {
    return jsonResponse({ error: 'Config not found' }, 404)
  }

  let pathOrId = ''
  if (req.query) {
    if (isDavConfig(config)) {
      const match = req.query.match(/(?:^|&)path=([^&]*)/)
      if (match) pathOrId = decodeURIComponent(match[1])
    } else {
      const match = req.query.match(/(?:^|&)id=([^&]*)/)
      if (match) pathOrId = decodeURIComponent(match[1])
    }
  }

  try {
    const items = await getItems(config, pathOrId)
    
    if (isSubsonicConfig(config)) {
      if (!pathOrId || pathOrId === 'root') {
        return jsonResponse(items.map(a => ({
          id: a.id,
          name: a.name,
          type: 'directory'
        })))
      } else {
        return jsonResponse(items.map(item => ({
          id: item.id,
          name: item.title || item.name,
          type: item.isDir ? 'directory' : 'file',
          artist: item.artist,
          album: item.album,
          duration: item.duration,
          size: item.size,
          streamUrl: item.isDir ? '' : getStreamUrl(config, item.id),
          coverArt: item.coverArt ? getSubsonicStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
          lyric: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
          lyric_source: 'url',
          lyricUrl: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
        })))
      }
    } else if (isDavConfig(config)) {
      const configUrlObj = new URL(config.url)
      const configUrlPath = decodeURIComponent(configUrlObj.pathname).replace(/\/$/, '')
      const reqPath = (pathOrId || '/') === '/' ? '' : pathOrId.replace(/\/$/, '')
      const expectedPathname = configUrlPath + reqPath

      const filteredItems = items.filter(i => {
        let itemPathname = i.filename
        if (itemPathname.startsWith('http')) {
          try {
            itemPathname = new URL(itemPathname).pathname
          } catch {}
        }
        itemPathname = decodeURIComponent(itemPathname).replace(/\/$/, '')
        return itemPathname !== expectedPathname
      })

      return jsonResponse(filteredItems.map(item => ({
        id: item.filename,
        name: item.basename,
        type: item.type,
        size: item.size,
        streamUrl: item.type === 'file' ? getStreamUrl(config, item.filename) : ''
      })))
    }

    return jsonResponse([])
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 获取歌单列表
router.get('/lists/:id/playlists', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) {
    return jsonResponse({ error: 'Config not found' }, 404)
  }

  try {
    if (!isSubsonicConfig(config)) {
      return jsonResponse([])
    }

    const playlists = await getPlaylists(config)
    return jsonResponse(playlists.map(p => ({
      id: p.id,
      name: p.name,
      songCount: p.songCount,
      comment: p.comment,
      coverArt: p.coverArt ? getSubsonicStreamUrl(config, p.coverArt).replace('stream', 'getCoverArt') : undefined
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 获取歌单中的歌曲
router.get('/lists/:id/playlists/:playlistId', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) {
    return jsonResponse({ error: 'Config not found' }, 404)
  }

  try {
    if (!isSubsonicConfig(config)) {
      return jsonResponse([])
    }

    const songs = await getPlaylist(config, params.playlistId)
    return jsonResponse(songs.map(item => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getSubsonicStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || '')}`
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 全局搜索
router.post('/api/search', createSearchHandler({
  search: async (keyword: string, page = 1, pageSize = 20) => {
    const configs = await getConfigs()
    if (configs.length === 0) return []

    const results: SearchResultItem[] = []

    await Promise.all(configs.map(async (config) => {
      try {
        if (!isSubsonicConfig(config)) return

        const songs = await searchSongs(config, keyword, page, pageSize)
        for (const s of songs) {
          results.push({
            title: s.title,
            artist: s.artist,
            album: s.album,
            duration: s.duration || 0,
            cover_url: s.coverArt ? getSubsonicStreamUrl(config, s.coverArt).replace('stream', 'getCoverArt') : undefined,
            source_data: { configName: config.name, songId: s.id, type: config.type },
            lyric: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(s.artist || '')}&title=${encodeURIComponent(s.title || '')}`,
            lyric_source: 'url',
            lyricUrl: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(s.artist || '')}&title=${encodeURIComponent(s.title || '')}`
          })
        }
      } catch (e) {
        console.error('Unified search error for ' + config.name + ':', String(e))
      }
    }))

    return results
  }
}))

// 播放链接解析
router.post('/api/music/url', createMusicUrlHandler({
  resolveUrl: async (sourceData: Record<string, unknown>) => {
    const configName = sourceData.configName as string
    const songId = sourceData.songId as string
    const path = sourceData.path as string
    const type = sourceData.type as string
    if (!configName) throw new Error('Invalid source_data')

    const config = await getConfig(configName)
    if (!config) throw new Error('Config not found: ' + configName)

    if (type === 'subsonic' || isSubsonicConfig(config)) {
      if (!songId) throw new Error('Invalid songId')
      return getStreamUrl(config, songId)
    } else if (type === 'dav' || isDavConfig(config)) {
      if (!path) throw new Error('Invalid path')
      return getStreamUrl(config, path)
    }

    throw new Error('Unsupported config type')
  }
}))

// POST /api/search/topone — 搜索+匹配+URL解析三合一
router.post('/api/search/topone', async (req: HTTPRequest) => {
  const body = parseBody(req)
  const keyword = String(body.keyword || '').trim()
  const hint: { title?: string; artist?: string; duration?: number } | undefined = body.hint
  const quality = String(body.quality || '320k').trim()

  if (!keyword) return jsonResponse({ code: 400, msg: '缺少 keyword', data: null }, 400)

  const configs = await getConfigs()
  if (configs.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 404, msg: 'song not found', data: null }) }
  }

  const allCandidates: Array<{ score: number; item: any; configName: string; config: UnifiedConfig }> = []
  const searchResults = await Promise.allSettled(
    configs.filter(isSubsonicConfig).map(async (config) => {
      try {
        const songs = await searchSongs(config, keyword, 1, 10)
        return { configName: config.name, config, items: songs }
      } catch {
        return null
      }
    }),
  )

  for (const result of searchResults) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const { configName, config, items } = result.value
    for (const item of items) {
      const title = String(item.title || item.name || '')
      const artist = String(item.artist || '')
      if (!title) continue

      let score = 0
      if (hint) {
        if (hint.title) {
          if (title === hint.title) score += 0.5
          else if (title.includes(hint.title) || hint.title.includes(title)) score += 0.3
        }
        if (hint.artist) {
          if (artist === hint.artist) score += 0.3
          else if (artist.includes(hint.artist) || hint.artist.includes(artist)) score += 0.15
        }
      } else {
        score = 1
      }

      if (score < 0.4) continue
      allCandidates.push({ score, item, configName, config })
    }
  }

  if (allCandidates.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 404, msg: 'song not found', data: null }) }
  }

  allCandidates.sort((a, b) => b.score - a.score)

  let lastError = ''
  for (const candidate of allCandidates) {
    const { item, configName, config } = candidate
    try {
      const url = getStreamUrl(config, item.id)
      if (url) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 0,
            msg: 'success',
            data: {
              title: item.title || item.name || '',
              artist: item.artist || '',
              album: item.album || '',
              duration: item.duration || 0,
              cover_url: item.coverArt ? getSubsonicStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
              url,
              source_data: { configName, songId: item.id, type: config.type },
            },
          }),
        }
      }
    } catch (e: any) {
      lastError = e.message || String(e)
    }
  }

  console.warn(`[search/topone] 所有候选 URL 获取均失败，最后错误: ${lastError}`)
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 404, msg: 'song not found', data: null }) }
})

// 新增前端 API - 扁平化搜索
router.get('/lists/:id/search', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

  if (!isSubsonicConfig(config)) {
    return jsonResponse([])
  }

  let keyword = ''
  if (req.query) {
    const match = req.query.match(/(?:^|&)q=([^&]*)/)
    if (match) keyword = decodeURIComponent(match[1])
  }

  try {
    const songs = await searchSongs(config, keyword, 1, 100)
    return jsonResponse(songs.map(item => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getSubsonicStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 新增前端 API - 我的收藏
router.get('/lists/:id/starred', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

  if (!isSubsonicConfig(config)) {
    return jsonResponse([])
  }

  try {
    const songs = await getStarred(config)
    return jsonResponse(songs.map((item: any) => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getSubsonicStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 新增前端 API - 随机/随便听听
router.get('/lists/:id/random', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

  if (!isSubsonicConfig(config)) {
    return jsonResponse([])
  }

  try {
    const songs = await getRandomSongs(config, 50)
    return jsonResponse(songs.map((item: any) => ({
      id: item.id,
      name: item.title,
      type: 'file',
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      size: item.size,
      streamUrl: getStreamUrl(config, item.id),
      coverArt: item.coverArt ? getSubsonicStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-unified/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 歌词抓取
router.get('/lists/:id/lyric', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

  let artist = ''
  let title = ''
  if (req.query) {
    const artistMatch = req.query.match(/(?:^|&)artist=([^&]*)/)
    if (artistMatch) artist = decodeURIComponent(artistMatch[1])

    const titleMatch = req.query.match(/(?:^|&)title=([^&]*)/)
    if (titleMatch) title = decodeURIComponent(titleMatch[1])
  }

  try {
    const lyric = await getLyrics(config, artist, title)
    return jsonResponse({
      code: 0,
      data: {
        lyric: lyric
      },
      message: 'success'
    })
  } catch (e) {
    return jsonResponse({ code: 1, message: String(e) })
  }
})

export default router
