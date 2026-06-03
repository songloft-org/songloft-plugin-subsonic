import { createRouter, jsonResponse, createSearchHandler, createMusicUrlHandler } from '@songloft/plugin-sdk'
import type { HTTPRequest, SearchResultItem } from '@songloft/plugin-sdk'
import { getConfigs, saveConfigs, getConfig, SubsonicConfig } from './config'
import { ping, getIndexes, getMusicDirectory, getStreamUrl, searchSongs, getStarred, getRandomSongs, getLyrics } from './client'

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

// 列出所有配置的 Subsonic
router.get('/lists', async (req: HTTPRequest) => {
  const configs = await getConfigs()
  return jsonResponse(configs.map(c => ({
    id: c.name,
    name: c.name,
    url: c.url,
    username: c.username,
    salt: c.salt
  })))
})

// 添加/更新 Subsonic 配置
router.post('/lists', async (req: HTTPRequest) => {
  const data = parseBody(req) as SubsonicConfig
  const configs = await getConfigs()
  const existing = configs.findIndex(c => c.name === data.name)
  if (existing >= 0) {
    const oldConfig = configs[existing]
    // 密码留空则保留旧密码配置
    if (!data.password && !data.token) {
      data.password = oldConfig.password
      data.token = oldConfig.token
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
    const ok = await ping(data as SubsonicConfig)
    return jsonResponse({ success: ok })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) })
  }
})

// 获取特定配置的目录项 (Artists 或 directory contents)
router.get('/lists/:id/items', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) {
    return jsonResponse({ error: 'Config not found' }, 404)
  }

  // Parse query string manually or assume query parsing is available if not, but we can do simple regex
  // plugin-sdk passes req.query as string.
  let pathId = ''
  if (req.query) {
    const match = req.query.match(/(?:^|&)id=([^&]*)/)
    if (match) pathId = decodeURIComponent(match[1])
  }

  try {
    if (!pathId || pathId === 'root') {
      // 根目录：获取 Artists
      const artists = await getIndexes(config)
      return jsonResponse(artists.map(a => ({
        id: a.id,
        name: a.name,
        type: 'directory'
      })))
    } else {
      // 获取子目录内容
      const items = await getMusicDirectory(config, pathId)
      return jsonResponse(items.map(item => ({
        id: item.id,
        name: item.title || item.name,
        type: item.isDir ? 'directory' : 'file',
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        size: item.size,
        streamUrl: item.isDir ? '' : getStreamUrl(config, item.id),
        coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
        lyric: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
        lyric_source: 'url',
        lyricUrl: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
      })))
    }
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

    // 并发搜索所有配置的服务器
    await Promise.all(configs.map(async (config) => {
      try {
        const songs = await searchSongs(config, keyword, page, pageSize)
        for (const s of songs) {
          results.push({
            title: s.title,
            artist: s.artist,
            album: s.album,
            duration: s.duration || 0,
            cover_url: s.coverArt ? getStreamUrl(config, s.coverArt).replace('stream', 'getCoverArt') : undefined,
            source_data: { configName: config.name, songId: s.id },
            lyric: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(s.artist || '')}&title=${encodeURIComponent(s.title || '')}`,
            lyric_source: 'url',
            lyricUrl: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(s.artist || '')}&title=${encodeURIComponent(s.title || '')}`
          })
        }
      } catch (e) {
        // 忽略单个服务器错误，但打印日志方便排查
        console.error('Subsonic search error for ' + config.name + ':', String(e))
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
    if (!configName || !songId) throw new Error('Invalid source_data')

    const config = await getConfig(configName)
    if (!config) throw new Error('Subsonic config not found: ' + configName)

    return getStreamUrl(config, songId)
  }
}))

// POST /api/search/topOne — 搜索+匹配+URL解析三合一，返回最佳匹配的可播放 URL
// 供 miot-plus 等插件在本地索引找不到歌曲时调用
router.post('/api/search/topOne', async (req: HTTPRequest) => {
  const body = parseBody(req)
  const keyword = String(body.keyword || '').trim()
  const hint: { title?: string; artist?: string; duration?: number } | undefined = body.hint
  const quality = String(body.quality || '320k').trim()

  if (!keyword) return jsonResponse({ code: 400, msg: '缺少 keyword', data: null }, 400)

  const configs = await getConfigs()
  if (configs.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 404, msg: 'song not found', data: null }) }
  }

  // 跨所有 Subsonic 服务器并行搜索，每服务器取第1页最多10条
  const allCandidates: Array<{ score: number; item: any; configName: string }> = []
  const searchResults = await Promise.allSettled(
    configs.map(async (config) => {
      try {
        const songs = await searchSongs(config, keyword, 1, 10)
        return { configName: config.name, items: songs }
      } catch {
        return null
      }
    }),
  )

  for (const result of searchResults) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const { configName, items } = result.value
    for (const item of items) {
      const title = String(item.title || item.name || '')
      const artist = String(item.artist || '')
      if (!title) continue

      let score = 0
      if (hint) {
        // 评分逻辑：title 和 artist 匹配度
        if (hint.title) {
          if (title === hint.title) score += 0.5
          else if (title.includes(hint.title) || hint.title.includes(title)) score += 0.3
        }
        if (hint.artist) {
          if (artist === hint.artist) score += 0.3
          else if (artist.includes(hint.artist) || hint.artist.includes(artist)) score += 0.15
        }
      } else {
        // 无 hint 时，给所有有效结果一个基础分，保证能返回
        score = 1
      }

      if (score < 0.4) continue
      allCandidates.push({ score, item, configName })
    }
  }

  if (allCandidates.length === 0) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 404, msg: 'song not found', data: null }) }
  }

  // 按评分降序排列，依次尝试获取 URL
  allCandidates.sort((a, b) => b.score - a.score)

  let lastError = ''
  for (const candidate of allCandidates) {
    const { item, configName } = candidate
    const config = await getConfig(configName)
    if (!config) continue
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
              cover_url: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
              url,
              source_data: { configName, songId: item.id },
            },
          }),
        }
      }
    } catch (e: any) {
      lastError = e.message || String(e)
      // 单个失败继续尝试下一个候选
    }
  }

  console.warn(`[search/topOne] 所有候选 URL 获取均失败，最后错误: ${lastError}`)
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 404, msg: 'song not found', data: null }) }
})

// 新增前端 API - 扁平化搜索
router.get('/lists/:id/search', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

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
      coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 新增前端 API - 我的收藏
router.get('/lists/:id/starred', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

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
      coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
    })))
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})

// 新增前端 API - 随机/随便听听
router.get('/lists/:id/random', async (req: HTTPRequest, params) => {
  const config = await getConfig(params.id)
  if (!config) return jsonResponse({ error: 'Config not found' }, 404)

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
      coverArt: item.coverArt ? getStreamUrl(config, item.coverArt).replace('stream', 'getCoverArt') : undefined,
      lyric: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`,
      lyric_source: 'url',
      lyricUrl: `/api/plugin/songloft-plugin-subsonic/lists/${encodeURIComponent(config.name)}/lyric?artist=${encodeURIComponent(item.artist || '')}&title=${encodeURIComponent(item.title || item.name || '')}`
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
    // 即使失败也返回标准结构但 code != 0
    return jsonResponse({ code: 1, message: String(e) })
  }
})

export default router
