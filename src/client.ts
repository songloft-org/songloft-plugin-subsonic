// global songloft
import { UnifiedConfig, isSubsonicConfig, isDavConfig, SubsonicConfig, DavConfig } from './config'

// ============= Subsonic 客户端功能 =============
function md5(str: string): string {
  if (typeof __go_crypto_md5 !== 'undefined') {
    return __go_crypto_md5(str)
  }
  throw new Error("MD5 is not available in this environment")
}

function buildSubsonicUrl(config: SubsonicConfig, endpoint: string, params: Record<string, string> = {}): string {
  const url = config.url.replace(/\/$/, '')
  const qs: string[] = []
  
  qs.push(`u=${encodeURIComponent(config.username)}`)
  
  if (config.token && config.salt) {
    qs.push(`t=${encodeURIComponent(config.token)}`)
    qs.push(`s=${encodeURIComponent(config.salt)}`)
  } else if (config.password) {
    const salt = Math.random().toString(36).substring(2, 10)
    const token = md5(config.password + salt)
    qs.push(`t=${encodeURIComponent(token)}`)
    qs.push(`s=${encodeURIComponent(salt)}`)
  }
  
  qs.push(`v=${encodeURIComponent(config.version || '1.16.1')}`)
  qs.push(`c=songloft`)
  qs.push(`f=json`)
  
  for (const [k, v] of Object.entries(params)) {
    qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  }
  
  return `${url}/rest/${endpoint}?${qs.join('&')}`
}

export async function pingSubsonic(config: SubsonicConfig): Promise<boolean> {
  const res = await fetch(buildSubsonicUrl(config, 'ping'))
  if (!res.ok) {
    throw new Error(`HTTP Error: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    const err = data['subsonic-response']?.error
    if (err) {
      throw new Error(`API Error [${err.code}]: ${err.message}`)
    }
    throw new Error('API Error: Unknown status failed')
  }
  return true
}

export async function getSubsonicIndexes(config: SubsonicConfig): Promise<any[]> {
  let res = await fetch(buildSubsonicUrl(config, 'getIndexes'))
  let data
  let useFallback = false

  if (res.ok) {
    data = await res.json()
    if (data['subsonic-response']?.status !== 'ok') {
      useFallback = true
    }
  } else {
    useFallback = true
  }

  if (useFallback) {
    res = await fetch(buildSubsonicUrl(config, 'getArtists'))
    if (!res.ok) throw new Error('Failed to get indexes or artists')
    data = await res.json()
    if (data['subsonic-response']?.status !== 'ok') {
      throw new Error('API Error: ' + JSON.stringify(data))
    }
    
    const indexes = data['subsonic-response'].artists?.index || []
    const artists: any[] = []
    
    for (const idx of indexes) {
      if (idx.artist && Array.isArray(idx.artist)) {
        artists.push(...idx.artist)
      } else if (idx.artist) {
        artists.push(idx.artist)
      }
    }
    return artists
  }
  
  const indexes = data['subsonic-response'].indexes?.index || []
  const artists: any[] = []
  
  for (const idx of indexes) {
    if (idx.artist && Array.isArray(idx.artist)) {
      artists.push(...idx.artist)
    } else if (idx.artist) {
      artists.push(idx.artist)
    }
  }
  
  return artists
}

export async function getSubsonicMusicDirectory(config: SubsonicConfig, id: string): Promise<any[]> {
  let res = await fetch(buildSubsonicUrl(config, 'getMusicDirectory', { id }))
  let data
  let useFallback = false

  if (res.ok) {
    data = await res.json()
    if (data['subsonic-response']?.status !== 'ok') {
      useFallback = true
    } else {
      const dir = data['subsonic-response'].directory
      if (dir && dir.child) {
        return Array.isArray(dir.child) ? dir.child : [dir.child]
      }
      return []
    }
  } else {
    useFallback = true
  }

  if (useFallback) {
    let fallbackRes = await fetch(buildSubsonicUrl(config, 'getArtist', { id }))
    if (fallbackRes.ok) {
      let fallbackData = await fallbackRes.json()
      if (fallbackData['subsonic-response']?.status === 'ok' && fallbackData['subsonic-response'].artist) {
        const artist = fallbackData['subsonic-response'].artist
        if (artist && artist.album) {
          const albums = Array.isArray(artist.album) ? artist.album : [artist.album]
          return albums.map(a => ({ ...a, isDir: true }))
        }
        return []
      }
    }

    fallbackRes = await fetch(buildSubsonicUrl(config, 'getAlbum', { id }))
    if (fallbackRes.ok) {
      let fallbackData = await fallbackRes.json()
      if (fallbackData['subsonic-response']?.status === 'ok' && fallbackData['subsonic-response'].album) {
        const album = fallbackData['subsonic-response'].album
        if (album && album.song) {
          const songs = Array.isArray(album.song) ? album.song : [album.song]
          return songs.map(s => ({ ...s, isDir: false }))
        }
        return []
      }
    }

    if (data && data['subsonic-response']?.status !== 'ok') {
      throw new Error('API Error: ' + JSON.stringify(data))
    }
    throw new Error('Failed to get directory')
  }

  return []
}

export function getSubsonicStreamUrl(config: SubsonicConfig, id: string): string {
  return buildSubsonicUrl(config, 'stream', { id })
}

export async function searchSubsonicSongs(config: SubsonicConfig, keyword: string, page: number = 1, pageSize: number = 20): Promise<any[]> {
  const params: Record<string, string> = {
    query: keyword,
    songCount: String(pageSize),
    songOffset: String((page - 1) * pageSize)
  }
  const res = await fetch(buildSubsonicUrl(config, 'search3', params))
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  
  const songs = data['subsonic-response'].searchResult3?.song || []
  return Array.isArray(songs) ? songs : [songs]
}

export async function getSubsonicStarred(config: SubsonicConfig): Promise<any[]> {
  const res = await fetch(buildSubsonicUrl(config, 'getStarred'))
  if (!res.ok) throw new Error('Failed to get starred')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const songs = data['subsonic-response'].starred?.song || []
  return Array.isArray(songs) ? songs : [songs]
}

export async function getSubsonicRandomSongs(config: SubsonicConfig, size: number = 50): Promise<any[]> {
  const res = await fetch(buildSubsonicUrl(config, 'getRandomSongs', { size: String(size) }))
  if (!res.ok) throw new Error('Failed to get random songs')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const songs = data['subsonic-response'].randomSongs?.song || []
  return Array.isArray(songs) ? songs : [songs]
}

export async function getSubsonicLyrics(config: SubsonicConfig, artist: string, title: string): Promise<string> {
  const res = await fetch(buildSubsonicUrl(config, 'getLyrics', { artist, title }))
  if (!res.ok) throw new Error('Failed to get lyrics')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const lyricValue = data['subsonic-response']?.lyrics?.value
  return lyricValue || ''
}

export async function getSubsonicPlaylists(config: SubsonicConfig): Promise<any[]> {
  const res = await fetch(buildSubsonicUrl(config, 'getPlaylists'))
  if (!res.ok) throw new Error('Failed to get playlists')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const playlists = data['subsonic-response'].playlists?.playlist || []
  return Array.isArray(playlists) ? playlists : [playlists]
}

export async function getSubsonicPlaylist(config: SubsonicConfig, id: string): Promise<any[]> {
  const res = await fetch(buildSubsonicUrl(config, 'getPlaylist', { id }))
  if (!res.ok) throw new Error('Failed to get playlist')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const songs = data['subsonic-response'].playlist?.entry || []
  return Array.isArray(songs) ? songs : [songs]
}

// ============= WebDAV 客户端功能 =============
function getBasicAuth(str: string): string {
  try {
    return globalThis.btoa(str)
  } catch {
    return ''
  }
}

function getDavAuthHeader(config: DavConfig): HeadersInit {
  if (config.username && config.password) {
    try {
      const basic = getBasicAuth(`${config.username}:${config.password}`)
      return { 'Authorization': `Basic ${basic}` }
    } catch {
      return {}
    }
  }
  return {}
}

export interface DavItem {
  filename: string
  basename: string
  lastmod: string
  size: number
  type: 'directory' | 'file'
}

function extractTag(xml: string, tag: string): string {
  let searchStr = xml.toLowerCase()
  let lowerTag = tag.toLowerCase()
  let openIdx = searchStr.indexOf(`<${lowerTag}`)
  if (openIdx === -1) {
    openIdx = searchStr.indexOf(`:${lowerTag}`)
    if (openIdx !== -1) {
      const pre = searchStr.lastIndexOf('<', openIdx)
      if (pre !== -1) {
        openIdx = pre
      } else {
        openIdx = -1
      }
    }
  }
  
  if (openIdx === -1) return ''
  
  const closeBracketIdx = searchStr.indexOf(`>`, openIdx)
  if (closeBracketIdx === -1) return ''
  
  const tagContent = searchStr.substring(openIdx + 1, closeBracketIdx)
  const prefix = tagContent.split(' ')[0]
  const closingTag = `</${prefix}>`
  const closeIdx = searchStr.indexOf(closingTag, closeBracketIdx + 1)
  
  if (closeIdx !== -1) {
    return xml.substring(closeBracketIdx + 1, closeIdx)
  }
  return ''
}

function extractAllTags(xml: string, tag: string): string[] {
  const results: string[] = []
  let searchStr = xml.toLowerCase()
  let lowerTag = tag.toLowerCase()
  let currentIndex = 0
  
  while (true) {
    const openIdx = searchStr.indexOf(`<`, currentIndex)
    if (openIdx === -1) break
    
    const closeBracketIdx = searchStr.indexOf(`>`, openIdx)
    if (closeBracketIdx === -1) break
    
    const tagContent = searchStr.substring(openIdx + 1, closeBracketIdx)
    if (tagContent === lowerTag || tagContent.endsWith(`:${lowerTag}`) || tagContent.startsWith(`${lowerTag} `) || tagContent.includes(`:${lowerTag} `)) {
      const prefix = tagContent.split(' ')[0]
      const closingTag = `</${prefix}>`
      const closeIdx = searchStr.indexOf(closingTag, closeBracketIdx + 1)
      
      if (closeIdx !== -1) {
        results.push(xml.substring(closeBracketIdx + 1, closeIdx))
        currentIndex = closeIdx + closingTag.length
      } else {
        currentIndex = closeBracketIdx + 1
      }
    } else {
      currentIndex = closeBracketIdx + 1
    }
  }
  
  return results
}

export async function propfindDav(config: DavConfig, path: string): Promise<DavItem[]> {
  const url = config.url.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path)
  const headers = getDavAuthHeader(config)
  const reqUrl = url.replace(/([^:])\/\//g, '$1/')
  
  const response = await fetch(reqUrl, {
    method: 'PROPFIND',
    headers: {
      ...headers,
      'Depth': '1'
    }
  })
  
  if (!response.ok) {
    throw new Error(`WebDAV PROPFIND failed: ${response.status} ${response.statusText}`)
  }
  
  const xmlText = await response.text()
  const responses = extractAllTags(xmlText, 'response')
  
  return responses.map((r: string) => {
    const href = extractTag(r, 'href')
    const decodedHref = decodeURIComponent(href)
    let basename = decodedHref.split('/').filter(Boolean).pop() || ''
    
    const propstat = extractTag(r, 'propstat')
    const prop = extractTag(propstat, 'prop')
    
    const resourcetype = extractTag(prop, 'resourcetype')
    const isCollection = /<([^:>]+:)?collection/i.test(resourcetype)
    
    const lastmod = extractTag(prop, 'getlastmodified')
    const contentLength = extractTag(prop, 'getcontentlength')
    
    return {
      filename: decodedHref,
      basename,
      lastmod: lastmod || '',
      size: parseInt(contentLength || '0', 10),
      type: isCollection ? 'directory' : 'file'
    }
  })
}

export function buildDavStreamUrl(config: DavConfig, path: string): string {
  let rawUrl: string
  if (path.startsWith('http')) {
    rawUrl = path
  } else {
    const base = config.url.replace(/\/$/, '')
    const encodedPath = path.split('/').map((s: string) => s ? encodeURIComponent(s) : '').join('/')
    const normalizedPath = encodedPath.startsWith('/') ? encodedPath : '/' + encodedPath
    rawUrl = (base + normalizedPath).replace(/([^:])\/\/+/g, '$1/')
  }

  if (config.username && config.password) {
    const protoMatch = rawUrl.match(/^(https?:\/\/)(.*)$/)
    if (protoMatch) {
      const encodedUser = encodeURIComponent(config.username)
      const encodedPass = encodeURIComponent(config.password)
      const rest = protoMatch[2].replace(/^[^@]*@/, '')
      rawUrl = protoMatch[1] + encodedUser + ':' + encodedPass + '@' + rest
    }
  }

  return rawUrl
}

// ============= 统一接口 =============
export async function pingConfig(config: UnifiedConfig): Promise<boolean> {
  if (isSubsonicConfig(config)) {
    return await pingSubsonic(config)
  } else if (isDavConfig(config)) {
    const items = await propfindDav(config, '/')
    return items.length > 0
  }
  return false
}

export async function getItems(config: UnifiedConfig, pathOrId: string): Promise<any[]> {
  if (isSubsonicConfig(config)) {
    if (!pathOrId || pathOrId === 'root') {
      return getSubsonicIndexes(config)
    } else {
      return getSubsonicMusicDirectory(config, pathOrId)
    }
  } else if (isDavConfig(config)) {
    return propfindDav(config, pathOrId || '/')
  }
  return []
}

export function getStreamUrl(config: UnifiedConfig, idOrPath: string): string {
  if (isSubsonicConfig(config)) {
    return getSubsonicStreamUrl(config, idOrPath)
  } else if (isDavConfig(config)) {
    return buildDavStreamUrl(config, idOrPath)
  }
  return ''
}

export async function searchSongs(config: UnifiedConfig, keyword: string, page: number = 1, pageSize: number = 20): Promise<any[]> {
  if (isSubsonicConfig(config)) {
    return searchSubsonicSongs(config, keyword, page, pageSize)
  }
  return []
}

export async function getStarred(config: UnifiedConfig): Promise<any[]> {
  if (isSubsonicConfig(config)) {
    return getSubsonicStarred(config)
  }
  return []
}

export async function getRandomSongs(config: UnifiedConfig, size: number = 50): Promise<any[]> {
  if (isSubsonicConfig(config)) {
    return getSubsonicRandomSongs(config, size)
  }
  return []
}

export async function getLyrics(config: UnifiedConfig, artist: string, title: string): Promise<string> {
  if (isSubsonicConfig(config)) {
    return getSubsonicLyrics(config, artist, title)
  }
  return ''
}

export async function getPlaylists(config: UnifiedConfig): Promise<any[]> {
  if (isSubsonicConfig(config)) {
    return getSubsonicPlaylists(config)
  }
  return []
}

export async function getPlaylist(config: UnifiedConfig, id: string): Promise<any[]> {
  if (isSubsonicConfig(config)) {
    return getSubsonicPlaylist(config, id)
  }
  return []
}
