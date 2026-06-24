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

  const prefix = config.pathPrefix !== undefined ? config.pathPrefix : '/rest'
  const sep = prefix && !prefix.endsWith('/') ? '/' : ''
  return `${url}${prefix}${sep}${endpoint}?${qs.join('&')}`
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

function collectArtists(indexes: any[]): any[] {
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

export async function getIndexes(config: SubsonicConfig): Promise<any[]> {
  try {
    const res = await fetch(buildUrl(config, 'getIndexes'))
    if (res.ok) {
      const data = await res.json()
      if (data['subsonic-response']?.status === 'ok') {
        return collectArtists(data['subsonic-response'].indexes?.index || [])
      }
    }
  } catch { /* fallback to getArtists */ }

  const res = await fetch(buildUrl(config, 'getArtists'))
  if (!res.ok) throw new Error('Failed to get indexes or artists')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  return collectArtists(data['subsonic-response'].artists?.index || [])
}

export async function getMusicDirectory(config: SubsonicConfig, id: string): Promise<any[]> {
  try {
    const res = await fetch(buildUrl(config, 'getMusicDirectory', { id }))
    if (res.ok) {
      const data = await res.json()
      if (data['subsonic-response']?.status === 'ok') {
        const dir = data['subsonic-response'].directory
        if (dir && dir.child) {
          return Array.isArray(dir.child) ? dir.child : [dir.child]
        }
        return []
      }
    }
  } catch { /* fallback to getArtist/getAlbum */ }

  try {
    const res = await fetch(buildUrl(config, 'getArtist', { id }))
    if (res.ok) {
      const data = await res.json()
      if (data['subsonic-response']?.status === 'ok' && data['subsonic-response'].artist) {
        const artist = data['subsonic-response'].artist
        if (artist && artist.album) {
          const albums = Array.isArray(artist.album) ? artist.album : [artist.album]
          return albums.map(a => ({ ...a, isDir: true }))
        }
        return []
      }
    }
  } catch { /* fallback to getAlbum */ }

  try {
    const res = await fetch(buildUrl(config, 'getAlbum', { id }))
    if (res.ok) {
      const data = await res.json()
      if (data['subsonic-response']?.status === 'ok' && data['subsonic-response'].album) {
        const album = data['subsonic-response'].album
        if (album && album.song) {
          const songs = Array.isArray(album.song) ? album.song : [album.song]
          return songs.map(s => ({ ...s, isDir: false }))
        }
        return []
      }
    }
  } catch { /* all fallbacks failed */ }

  throw new Error('Failed to get directory')
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

export async function getPlaylists(config: SubsonicConfig): Promise<any[]> {
  const res = await fetch(buildUrl(config, 'getPlaylists'))
  if (!res.ok) throw new Error('Failed to get playlists')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const playlists = data['subsonic-response'].playlists?.playlist || []
  return Array.isArray(playlists) ? playlists : [playlists]
}

export async function getPlaylist(config: SubsonicConfig, id: string): Promise<any[]> {
  const res = await fetch(buildUrl(config, 'getPlaylist', { id }))
  if (!res.ok) throw new Error('Failed to get playlist')
  const data = await res.json()
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('API Error: ' + JSON.stringify(data))
  }
  const playlist = data['subsonic-response'].playlist
  if (!playlist) return []
  const entries = playlist.entry || playlist.song || []
  return Array.isArray(entries) ? entries : [entries]
}

