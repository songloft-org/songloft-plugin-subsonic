// global songloft
import { SubsonicConfig } from './config'

function md5(str: string): string {
  if (typeof __go_crypto_md5 !== 'undefined') {
    return __go_crypto_md5(str)
  }
  throw new Error("MD5 is not available in this environment")
}

function buildUrl(config: SubsonicConfig, endpoint: string, params: Record<string, string> = {}): string {
  const url = config.url.replace(/\/$/, '')
  const qs: string[] = []
  
  qs.push(`u=${encodeURIComponent(config.username)}`)
  
  if (config.token && config.salt) {
    qs.push(`t=${encodeURIComponent(config.token)}`)
    qs.push(`s=${encodeURIComponent(config.salt)}`)
  } else if (config.password) {
    // 强制丢弃 p=enc: 模式，自动静默升级为 MD5 Token 模式以防日志泄露密码
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

export async function ping(config: SubsonicConfig): Promise<boolean> {
  const res = await fetch(buildUrl(config, 'ping'))
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

export async function getIndexes(config: SubsonicConfig): Promise<any[]> {
  let res = await fetch(buildUrl(config, 'getIndexes'))
  let data;
  let useFallback = false;

  if (res.ok) {
    data = await res.json()
    if (data['subsonic-response']?.status !== 'ok') {
      useFallback = true;
    }
  } else {
    useFallback = true;
  }

  if (useFallback) {
    res = await fetch(buildUrl(config, 'getArtists'))
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

export async function getMusicDirectory(config: SubsonicConfig, id: string): Promise<any[]> {
  let res = await fetch(buildUrl(config, 'getMusicDirectory', { id }))
  let data;
  let useFallback = false;

  if (res.ok) {
    data = await res.json()
    if (data['subsonic-response']?.status !== 'ok') {
      useFallback = true;
    } else {
      const dir = data['subsonic-response'].directory
      if (dir && dir.child) {
        return Array.isArray(dir.child) ? dir.child : [dir.child]
      }
      return []
    }
  } else {
    useFallback = true;
  }

  if (useFallback) {
    let fallbackRes = await fetch(buildUrl(config, 'getArtist', { id }))
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

    fallbackRes = await fetch(buildUrl(config, 'getAlbum', { id }))
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

export function getStreamUrl(config: SubsonicConfig, id: string): string {
  return buildUrl(config, 'stream', { id })
}

export async function searchSongs(config: SubsonicConfig, keyword: string, page: number = 1, pageSize: number = 20): Promise<any[]> {
  const params: Record<string, string> = {
    query: keyword,
    songCount: String(pageSize),
    songOffset: String((page - 1) * pageSize)
  }
  const res = await fetch(buildUrl(config, 'search3', params))
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  
  const songs = data['subsonic-response'].searchResult3?.song || []
  return Array.isArray(songs) ? songs : [songs]
}

export async function getStarred(config: SubsonicConfig): Promise<any[]> {
  const res = await fetch(buildUrl(config, 'getStarred'))
  if (!res.ok) throw new Error('Failed to get starred')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const songs = data['subsonic-response'].starred?.song || []
  return Array.isArray(songs) ? songs : [songs]
}

export async function getRandomSongs(config: SubsonicConfig, size: number = 50): Promise<any[]> {
  const res = await fetch(buildUrl(config, 'getRandomSongs', { size: String(size) }))
  if (!res.ok) throw new Error('Failed to get random songs')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const songs = data['subsonic-response'].randomSongs?.song || []
  return Array.isArray(songs) ? songs : [songs]
}

export async function getLyrics(config: SubsonicConfig, artist: string, title: string): Promise<string> {
  const res = await fetch(buildUrl(config, 'getLyrics', { artist, title }))
  if (!res.ok) throw new Error('Failed to get lyrics')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const lyricValue = data['subsonic-response']?.lyrics?.value
  return lyricValue || ''
}

