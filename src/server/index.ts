import type { HTTPRequest, HTTPResponse } from '@songloft/plugin-sdk'
import { validateAuth, getServerConfig, saveServerConfig, ServerConfig } from './auth'
import { okResponse, errorResponse } from './responses'

type Handler = (req: HTTPRequest, query: URLSearchParams) => Promise<HTTPResponse>

function authError(query: URLSearchParams): HTTPResponse {
  const r = errorResponse(query, 40, 'Wrong username or password')
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- System ---

const handlePing: Handler = async (_req, query) => {
  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetUser: Handler = async (_req, query) => {
  const config = await getServerConfig()
  const r = okResponse(query, {
    user: {
      username: config.username,
      adminRole: true,
      streamRole: true,
      downloadRole: true,
      coverArtRole: true,
      scrobbleRole: true,
    }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Browsing ---

const handleGetArtists: Handler = async (_req, query) => {
  const songs = await songloft.songs.list({ limit: 100000 })
  const artistMap = new Map<string, number>()
  const artistAlbums = new Map<string, Set<string>>()
  for (const song of songs) {
    const a = song.artist || 'Unknown'
    artistMap.set(a, (artistMap.get(a) || 0) + 1)
    if (!artistAlbums.has(a)) artistAlbums.set(a, new Set())
    artistAlbums.get(a)!.add(song.album || 'Unknown')
  }

  const indexes: Record<string, any[]> = {}
  for (const [name] of artistMap) {
    const letter = (name[0] || '#').toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!indexes[key]) indexes[key] = []
    indexes[key].push({
      id: `ar-${name}`,
      name,
      albumCount: artistAlbums.get(name)?.size || 0,
      coverArt: `ar-${name}`,
    })
  }

  const indexArr = Object.entries(indexes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, artists]) => ({ name, artist: artists }))

  const r = okResponse(query, { artists: { ignoredArticles: 'The El La', index: indexArr } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetMusicFolders: Handler = async (_req, query) => {
  const r = okResponse(query, { musicFolders: { musicFolder: [{ id: 1, name: 'Music' }] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbumList2: Handler = async (_req, query) => {
  const type = query.get('type') || 'newest'
  const size = Math.min(parseInt(query.get('size') || '20'), 500)
  const offset = parseInt(query.get('offset') || '0')

  const songs = await songloft.songs.list({ limit: 100000 })

  const albumMap = new Map<string, { artist: string; songCount: number; id: number; created: string }>()
  for (const song of songs) {
    const album = song.album || 'Unknown'
    if (!albumMap.has(album)) {
      albumMap.set(album, { artist: song.artist, songCount: 0, id: song.id, created: (song as any).added_at || '' })
    }
    albumMap.get(album)!.songCount++
  }

  let albums = Array.from(albumMap.entries()).map(([name, info]) => ({
    id: `al-${info.id}`,
    name,
    artist: info.artist,
    songCount: info.songCount,
    coverArt: `al-${info.id}`,
    created: info.created,
  }))

  if (type === 'alphabeticalByName') {
    albums.sort((a, b) => a.name.localeCompare(b.name))
  } else if (type === 'alphabeticalByArtist') {
    albums.sort((a, b) => a.artist.localeCompare(b.artist))
  } else if (type === 'random') {
    for (let i = albums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [albums[i], albums[j]] = [albums[j], albums[i]]
    }
  }

  albums = albums.slice(offset, offset + size)
  const r = okResponse(query, { albumList2: { album: albums } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbumList: Handler = async (_req, query) => {
  const type = query.get('type') || 'newest'
  const size = Math.min(parseInt(query.get('size') || '20'), 500)
  const offset = parseInt(query.get('offset') || '0')

  const songs = await songloft.songs.list({ limit: 100000 })

  const albumMap = new Map<string, { artist: string; songCount: number; id: number; created: string }>()
  for (const song of songs) {
    const album = song.album || 'Unknown'
    if (!albumMap.has(album)) {
      albumMap.set(album, { artist: song.artist, songCount: 0, id: song.id, created: (song as any).added_at || '' })
    }
    albumMap.get(album)!.songCount++
  }

  let albums = Array.from(albumMap.entries()).map(([name, info]) => ({
    id: `al-${info.id}`,
    title: name,
    artist: info.artist,
    isDir: 'true',
    parent: '1',
    coverArt: `al-${info.id}`,
    created: info.created,
  }))

  if (type === 'alphabeticalByName') {
    albums.sort((a, b) => a.title.localeCompare(b.title))
  } else if (type === 'alphabeticalByArtist') {
    albums.sort((a, b) => a.artist.localeCompare(b.artist))
  } else if (type === 'random') {
    for (let i = albums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [albums[i], albums[j]] = [albums[j], albums[i]]
    }
  }

  albums = albums.slice(offset, offset + size)
  const r = okResponse(query, { albumList: { album: albums } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbum: Handler = async (_req, query) => {
  const id = query.get('id') || ''
  const seedId = parseInt(id.replace(/^al-/, ''))
  if (isNaN(seedId)) {
    const r = errorResponse(query, 10, 'Invalid album id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const seedSong = await songloft.songs.getById(seedId)
  if (!seedSong) {
    const r = errorResponse(query, 70, 'Album not found')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const albumName = seedSong.album || 'Unknown'
  const allSongs = await songloft.songs.list({ limit: 100000 })
  const albumSongs = allSongs.filter(s => (s.album || 'Unknown') === albumName)

  const r = okResponse(query, {
    album: {
      id,
      name: albumName,
      artist: seedSong.artist,
      songCount: albumSongs.length,
      coverArt: id,
      song: albumSongs.map(s => songToSubsonic(s)),
    }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetArtist: Handler = async (_req, query) => {
  const id = query.get('id') || ''
  const artistName = id.replace(/^ar-/, '')

  const allSongs = await songloft.songs.list({ limit: 100000 })
  const artistSongs = allSongs.filter(s => (s.artist || 'Unknown') === artistName)

  const albumMap = new Map<string, { id: number; songCount: number; created: string }>()
  for (const song of artistSongs) {
    const album = song.album || 'Unknown'
    if (!albumMap.has(album)) {
      albumMap.set(album, { id: song.id, songCount: 0, created: (song as any).added_at || '' })
    }
    albumMap.get(album)!.songCount++
  }

  const albums = Array.from(albumMap.entries()).map(([name, info]) => ({
    id: `al-${info.id}`,
    name,
    artist: artistName,
    songCount: info.songCount,
    coverArt: `al-${info.id}`,
    created: info.created,
  }))

  const r = okResponse(query, {
    artist: { id, name: artistName, albumCount: albums.length, coverArt: id, album: albums }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetMusicDirectory: Handler = async (_req, query) => {
  const id = query.get('id') || ''

  if (id.startsWith('ar-')) {
    const artistName = id.replace(/^ar-/, '')
    const allSongs = await songloft.songs.list({ limit: 100000 })
    const artistSongs = allSongs.filter(s => (s.artist || 'Unknown') === artistName)
    const r = okResponse(query, {
      directory: { id, name: artistName, child: artistSongs.map(s => songToSubsonic(s)) }
    })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  if (id.startsWith('al-')) {
    const seedId = parseInt(id.replace(/^al-/, ''))
    const seedSong = await songloft.songs.getById(seedId)
    if (!seedSong) {
      const r = errorResponse(query, 70, 'Directory not found')
      return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
    }
    const albumName = seedSong.album || 'Unknown'
    const allSongs = await songloft.songs.list({ limit: 100000 })
    const albumSongs = allSongs.filter(s => (s.album || 'Unknown') === albumName)
    const r = okResponse(query, {
      directory: { id, name: albumName, child: albumSongs.map(s => songToSubsonic(s)) }
    })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  // Root music folder
  const songs = await songloft.songs.list({ limit: 100000 })
  const artistMap = new Map<string, number>()
  for (const song of songs) {
    const a = song.artist || 'Unknown'
    artistMap.set(a, (artistMap.get(a) || 0) + 1)
  }
  const children = Array.from(artistMap.entries()).map(([name]) => ({
    id: `ar-${name}`,
    title: name,
    artist: name,
    isDir: 'true',
    parent: id || '1',
  }))
  const r = okResponse(query, { directory: { id: id || '1', name: 'Music', child: children } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Search ---

const handleSearch3: Handler = async (_req, query) => {
  const q = query.get('query') || ''
  const songCount = Math.min(parseInt(query.get('songCount') || '20'), 100)
  const artistCount = Math.min(parseInt(query.get('artistCount') || '20'), 100)
  const albumCount = Math.min(parseInt(query.get('albumCount') || '20'), 100)

  const songs = await songloft.songs.search(q)
  const songResults = songs.slice(0, songCount).map(s => songToSubsonic(s))

  const artistSet = new Map<string, any>()
  const albumSet = new Map<string, any>()
  for (const s of songs) {
    const artist = s.artist || 'Unknown'
    if (!artistSet.has(artist)) {
      artistSet.set(artist, { id: `ar-${artist}`, name: artist })
    }
    const album = s.album || 'Unknown'
    if (!albumSet.has(album)) {
      albumSet.set(album, { id: `al-${s.id}`, name: album, artist, coverArt: `al-${s.id}` })
    }
  }

  const r = okResponse(query, {
    searchResult3: {
      artist: Array.from(artistSet.values()).slice(0, artistCount),
      album: Array.from(albumSet.values()).slice(0, albumCount),
      song: songResults,
    }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleSearch2: Handler = async (_req, query) => {
  const q = query.get('query') || ''
  const songCount = Math.min(parseInt(query.get('songCount') || '20'), 100)
  const artistCount = Math.min(parseInt(query.get('artistCount') || '20'), 100)
  const albumCount = Math.min(parseInt(query.get('albumCount') || '20'), 100)

  const songs = await songloft.songs.search(q)
  const songResults = songs.slice(0, songCount).map(s => songToSubsonic(s))

  const artistSet = new Map<string, any>()
  const albumSet = new Map<string, any>()
  for (const s of songs) {
    const artist = s.artist || 'Unknown'
    if (!artistSet.has(artist)) {
      artistSet.set(artist, { id: `ar-${artist}`, name: artist })
    }
    const album = s.album || 'Unknown'
    if (!albumSet.has(album)) {
      albumSet.set(album, { id: `al-${s.id}`, title: album, artist, isDir: 'true', coverArt: `al-${s.id}`, parent: '1' })
    }
  }

  const r = okResponse(query, {
    searchResult2: {
      artist: Array.from(artistSet.values()).slice(0, artistCount),
      album: Array.from(albumSet.values()).slice(0, albumCount),
      song: songResults,
    }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Media ---

const handleStream: Handler = async (_req, query) => {
  const id = query.get('id')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const songId = parseInt(id)
  if (isNaN(songId)) {
    const r = errorResponse(query, 10, 'Invalid id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const song = await songloft.songs.getById(songId)
  if (!song) {
    const r = errorResponse(query, 70, 'Song not found')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  return { serveFile: { songId } }
}

const handleGetCoverArt: Handler = async (_req, query) => {
  const id = query.get('id') || ''
  const token = await songloft.plugin.getToken()

  if (id.startsWith('pl-')) {
    const plId = id.slice(3)
    return {
      statusCode: 302,
      headers: { 'Location': `/api/v1/playlists/${plId}/cover?access_token=${token}` },
      body: ''
    }
  }

  const numId = parseInt(id.replace(/^(al|ar)-/, ''))
  if (isNaN(numId)) {
    return { statusCode: 404, headers: {} as Record<string, string>, body: '' }
  }
  return {
    statusCode: 302,
    headers: { 'Location': `/api/v1/songs/${numId}/cover?access_token=${token}` } as Record<string, string>,
    body: ''
  }
}

function parseLRC(lrc: string): { synced: boolean; line: { start?: number; value: string }[] } {
  if (!lrc) return { synced: false, line: [] }
  const timeTagRe = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/
  const lines: { start?: number; value: string }[] = []
  let hasTags = false
  for (const raw of lrc.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const m = trimmed.match(timeTagRe)
    if (m) {
      hasTags = true
      const ms = parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + parseInt(m[3].padEnd(3, '0'))
      const text = trimmed.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim()
      if (text) lines.push({ start: ms, value: text })
    } else if (!trimmed.startsWith('[')) {
      lines.push({ value: trimmed })
    }
  }
  return { synced: hasTags && lines.every(l => l.start !== undefined), line: lines }
}

async function fetchLyricPayload(songId: number): Promise<any | null> {
  try {
    const token = await songloft.plugin.getToken()
    const hostUrl = await songloft.plugin.getHostUrl()
    const resp = await fetch(`${hostUrl}/api/v1/songs/${songId}/lyric?access_token=${token}`)
    if (resp.ok) return await resp.json()
  } catch {}
  return null
}

const handleGetLyrics: Handler = async (_req, query) => {
  const artist = query.get('artist') || ''
  const title = query.get('title') || ''

  let songId = 0
  if (title) {
    const songs = await songloft.songs.search(title)
    let exactMatch: any = null
    let titleOnly: any = null
    for (const s of songs) {
      if (artist && s.artist === artist && s.title === title) { exactMatch = s; break }
      if (!titleOnly && s.title === title) titleOnly = s
    }
    const match = exactMatch || titleOnly
    if (match) songId = match.id
  }

  if (!songId) {
    const r = okResponse(query, { lyrics: { artist, title } })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const data = await fetchLyricPayload(songId)
  if (data) {
    const lyric = data.lyric || ''
    const plainText = lyric.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').replace(/\[.*?\]\r?\n?/g, '').trim()
    const r = okResponse(query, { lyrics: { artist, title, value: plainText } })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const r = okResponse(query, { lyrics: { artist, title } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetLyricsBySongId: Handler = async (_req, query) => {
  const id = parseInt(query.get('id') || '0')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const song = await songloft.songs.getById(id)
  if (!song) {
    const r = errorResponse(query, 70, 'Song not found')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const data = await fetchLyricPayload(id)
  if (!data || !data.lyric) {
    const r = okResponse(query, { lyricsList: {} })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const structuredLyrics: any[] = []
  const main = parseLRC(data.lyric)
  if (main.line.length > 0) {
    structuredLyrics.push({
      lang: 'und',
      synced: main.synced,
      line: main.line,
      ...(song.artist ? { displayArtist: song.artist } : {}),
      ...(song.title ? { displayTitle: song.title } : {}),
    })
  }
  if (data.tlyric) {
    const tl = parseLRC(data.tlyric)
    if (tl.line.length > 0) {
      structuredLyrics.push({ lang: 'translation', synced: tl.synced, line: tl.line })
    }
  }

  const r = okResponse(query, { lyricsList: structuredLyrics.length > 0 ? { structuredLyrics } : {} })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Playlists ---

const handleGetPlaylists: Handler = async (_req, query) => {
  const playlists = await songloft.playlists.list()
  const items = (playlists as any[])
    .filter(p => p.type !== 'radio')
    .map(p => ({
      id: String(p.id),
      name: p.name,
      songCount: p.song_count ?? p.songCount ?? 0,
      duration: 0,
      public: true,
      owner: 'admin',
      coverArt: (p.cover_url || p.coverUrl) ? `pl-${p.id}` : '',
      created: p.created_at || p.createdAt || '',
      changed: p.updated_at || p.updatedAt || '',
    }))
  const r = okResponse(query, { playlists: { playlist: items } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetPlaylist: Handler = async (_req, query) => {
  const id = parseInt(query.get('id') || '0')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const playlist = await songloft.playlists.getById(id)
  if (!playlist) {
    const r = errorResponse(query, 70, 'Playlist not found')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const songs = await songloft.playlists.getSongs(id, { limit: 10000 })
  const entries = songs.map(s => songToSubsonic(s))
  const pl: any = playlist
  const totalDuration = songs.reduce((sum, s) => sum + ((s as any).duration || 0), 0)
  const r = okResponse(query, {
    playlist: {
      id: String(pl.id),
      name: pl.name,
      songCount: entries.length,
      duration: Math.round(totalDuration),
      public: true,
      owner: 'admin',
      created: pl.created_at || pl.createdAt || '',
      changed: pl.updated_at || pl.updatedAt || '',
      coverArt: (pl.cover_url || pl.coverUrl) ? `pl-${pl.id}` : '',
      entry: entries,
    }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleCreatePlaylist: Handler = async (_req, query) => {
  const playlistId = query.get('playlistId')
  const name = query.get('name') || ''
  const songIds = query.getAll('songId').map(id => parseInt(id)).filter(id => !isNaN(id))

  const plApi = songloft.playlists as any
  if (playlistId) {
    const id = parseInt(playlistId)
    if (name) {
      await plApi.update(id, { name })
    }
    if (songIds.length > 0) {
      await plApi.addSongs(id, songIds)
    }
  } else if (name) {
    const pl: any = await plApi.create({ name, type: 'normal' })
    if (pl && songIds.length > 0) {
      await plApi.addSongs(pl.id, songIds)
    }
  }

  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleUpdatePlaylist: Handler = async (_req, query) => {
  const id = parseInt(query.get('playlistId') || '0')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: playlistId')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  const plApi = songloft.playlists as any
  const name = query.get('name')
  if (name) {
    await plApi.update(id, { name })
  }

  const addIds = query.getAll('songIdToAdd').map(s => parseInt(s)).filter(n => !isNaN(n))
  if (addIds.length > 0) {
    await plApi.addSongs(id, addIds)
  }

  const removeIndices = query.getAll('songIndexToRemove').map(s => parseInt(s)).filter(n => !isNaN(n))
  if (removeIndices.length > 0) {
    const songs = await songloft.playlists.getSongs(id, { limit: 100000 })
    const removeIds = removeIndices
      .filter(idx => idx >= 0 && idx < songs.length)
      .map(idx => (songs[idx] as any).id)
    if (removeIds.length > 0) {
      await plApi.removeSongs(id, removeIds)
    }
  }

  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleDeletePlaylist: Handler = async (_req, query) => {
  const id = parseInt(query.get('id') || '0')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  await (songloft.playlists as any).delete(id)
  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Star / Unstar ---

const handleStar: Handler = async (_req, query) => {
  const ids = query.getAll('id').map(id => parseInt(id)).filter(id => !isNaN(id))
  const albumIds = query.getAll('albumId')

  const plApi = songloft.playlists as any
  // Star songs by ID
  if (ids.length > 0) {
    await plApi.addSongs(1, ids)
  }

  // Star all songs in album
  if (albumIds.length > 0) {
    for (const alId of albumIds) {
      const seedId = parseInt(alId.replace(/^al-/, ''))
      if (isNaN(seedId)) continue
      const seedSong = await songloft.songs.getById(seedId)
      if (!seedSong) continue
      const albumName = seedSong.album || 'Unknown'
      const allSongs = await songloft.songs.list({ limit: 100000 })
      const albumSongIds = allSongs.filter(s => (s.album || 'Unknown') === albumName).map(s => s.id)
      if (albumSongIds.length > 0) await plApi.addSongs(1, albumSongIds)
    }
  }

  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleUnstar: Handler = async (_req, query) => {
  const ids = query.getAll('id').map(id => parseInt(id)).filter(id => !isNaN(id))
  const albumIds = query.getAll('albumId')

  const plApi = songloft.playlists as any
  if (ids.length > 0) {
    await plApi.removeSongs(1, ids)
  }

  if (albumIds.length > 0) {
    for (const alId of albumIds) {
      const seedId = parseInt(alId.replace(/^al-/, ''))
      if (isNaN(seedId)) continue
      const seedSong = await songloft.songs.getById(seedId)
      if (!seedSong) continue
      const albumName = seedSong.album || 'Unknown'
      const allSongs = await songloft.songs.list({ limit: 100000 })
      const albumSongIds = allSongs.filter(s => (s.album || 'Unknown') === albumName).map(s => s.id)
      if (albumSongIds.length > 0) await plApi.removeSongs(1, albumSongIds)
    }
  }

  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Scrobble ---

const handleScrobble: Handler = async (_req, query) => {
  const r = okResponse(query)
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Single song ---

const handleGetSong: Handler = async (_req, query) => {
  const id = parseInt(query.get('id') || '0')
  if (!id) {
    const r = errorResponse(query, 10, 'Required parameter is missing: id')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const song = await songloft.songs.getById(id)
  if (!song) {
    const r = errorResponse(query, 70, 'Song not found')
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const r = okResponse(query, { song: songToSubsonic(song) })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Starred ---

const handleGetStarred: Handler = async (_req, query) => {
  const songs = await songloft.playlists.getSongs(1, { limit: 100000 })
  const r = okResponse(query, { starred: { song: songs.map(s => songToSubsonic(s)), album: [], artist: [] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetStarred2: Handler = async (_req, query) => {
  const songs = await songloft.playlists.getSongs(1, { limit: 100000 })
  const r = okResponse(query, { starred2: { song: songs.map(s => songToSubsonic(s)), album: [], artist: [] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Indexes ---

const handleGetIndexes: Handler = async (_req, query) => {
  const songs = await songloft.songs.list({ limit: 100000 })
  const artistMap = new Map<string, number>()
  const artistAlbums = new Map<string, Set<string>>()
  for (const song of songs) {
    const a = song.artist || 'Unknown'
    artistMap.set(a, (artistMap.get(a) || 0) + 1)
    if (!artistAlbums.has(a)) artistAlbums.set(a, new Set())
    artistAlbums.get(a)!.add(song.album || 'Unknown')
  }

  const indexes: Record<string, any[]> = {}
  for (const [name] of artistMap) {
    const letter = (name[0] || '#').toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!indexes[key]) indexes[key] = []
    indexes[key].push({ id: `ar-${name}`, name, albumCount: artistAlbums.get(name)?.size || 0 })
  }

  const indexArr = Object.entries(indexes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, artists]) => ({ name, artist: artists }))

  const r = okResponse(query, { indexes: { ignoredArticles: 'The El La', index: indexArr } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Random ---

const handleGetScanStatus: Handler = async (_req, query) => {
  const songs = await songloft.songs.list({ limit: 100000 })
  const r = okResponse(query, { scanStatus: { scanning: 'false', count: songs.length } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetRandomSongs: Handler = async (_req, query) => {
  const size = Math.min(parseInt(query.get('size') || '10'), 500)
  const genre = query.get('genre') || ''
  let songs = await songloft.songs.list({ limit: 100000 })

  if (genre) {
    songs = songs.filter(s => (s as any).genre === genre)
  }

  // Fisher-Yates shuffle
  for (let i = songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [songs[i], songs[j]] = [songs[j], songs[i]]
  }

  const r = okResponse(query, { randomSongs: { song: songs.slice(0, size).map(s => songToSubsonic(s)) } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Genres ---

const handleGetGenres: Handler = async (_req, query) => {
  const songs = await songloft.songs.list({ limit: 100000 })
  const genreMap = new Map<string, { songCount: number; albumCount: number }>()
  const genreAlbums = new Map<string, Set<string>>()
  for (const s of songs) {
    const g = (s as any).genre || ''
    if (!g) continue
    if (!genreMap.has(g)) {
      genreMap.set(g, { songCount: 0, albumCount: 0 })
      genreAlbums.set(g, new Set())
    }
    genreMap.get(g)!.songCount++
    genreAlbums.get(g)!.add((s as any).album || 'Unknown')
  }
  const genres = Array.from(genreMap.entries()).map(([name, info]) => ({
    songCount: info.songCount,
    albumCount: genreAlbums.get(name)!.size,
    value: name,
  }))
  const r = okResponse(query, { genres: { genre: genres } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Songs by genre ---

const handleGetSongsByGenre: Handler = async (_req, query) => {
  const genre = query.get('genre') || ''
  const count = Math.min(parseInt(query.get('count') || '10'), 500)
  const offset = parseInt(query.get('offset') || '0')

  const songs = await songloft.songs.list({ limit: 100000 })
  const filtered = songs.filter(s => (s as any).genre === genre)
  const paged = filtered.slice(offset, offset + count)

  const r = okResponse(query, { songsByGenre: { song: paged.map(s => songToSubsonic(s)) } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Internet Radio ---

const handleGetInternetRadioStations: Handler = async (_req, query) => {
  try {
    const songs = await (songloft.songs as any).list({ type: 'radio', limit: 10000 })
    const stations = songs.map((s: any) => ({
      id: String(s.id),
      name: s.title || '',
      streamUrl: s.source_url || '',
      homePageUrl: '',
    }))
    const r = okResponse(query, { internetRadioStations: { internetRadioStation: stations } })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  } catch {
    const r = okResponse(query, { internetRadioStations: { internetRadioStation: [] } })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
}

// --- Artist / Album Info stubs ---

const handleGetArtistInfo: Handler = async (_req, query) => {
  const r = okResponse(query, {
    artistInfo: { biography: '', musicBrainzId: '', lastFmUrl: '', smallImageUrl: '', mediumImageUrl: '', largeImageUrl: '', similarArtist: [] }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetArtistInfo2: Handler = async (_req, query) => {
  const r = okResponse(query, {
    artistInfo2: { biography: '', musicBrainzId: '', lastFmUrl: '', smallImageUrl: '', mediumImageUrl: '', largeImageUrl: '', similarArtist: [] }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbumInfo: Handler = async (_req, query) => {
  const r = okResponse(query, {
    albumInfo: { notes: '', musicBrainzId: '', lastFmUrl: '', smallImageUrl: '', mediumImageUrl: '', largeImageUrl: '' }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbumInfo2: Handler = async (_req, query) => {
  const r = okResponse(query, {
    albumInfo: { notes: '', musicBrainzId: '', lastFmUrl: '', smallImageUrl: '', mediumImageUrl: '', largeImageUrl: '' }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetSimilarSongs: Handler = async (_req, query) => {
  const r = okResponse(query, { similarSongs: { song: [] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetSimilarSongs2: Handler = async (_req, query) => {
  const r = okResponse(query, { similarSongs2: { song: [] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetTopSongs: Handler = async (_req, query) => {
  const artistName = query.get('artist') || ''
  if (!artistName) {
    const r = okResponse(query, { topSongs: { song: [] } })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }
  const allSongs = await songloft.songs.list({ limit: 100000 })
  const artistSongs = allSongs.filter(s => s.artist === artistName).slice(0, 50)
  const r = okResponse(query, { topSongs: { song: artistSongs.map(s => songToSubsonic(s)) } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Helpers ---

function songToSubsonic(s: any) {
  const fp = s.file_path || s.filePath || ''
  const suffix = s.format || fp.split('.').pop() || 'mp3'
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4',
    ogg: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma', aac: 'audio/aac',
    opus: 'audio/opus', ape: 'audio/x-ape', wv: 'audio/x-wavpack',
  }
  return {
    id: String(s.id),
    parent: '1',
    title: s.title || '',
    artist: s.artist || '',
    album: s.album || '',
    year: s.year || 0,
    genre: s.genre || '',
    duration: s.duration || 0,
    size: s.file_size || s.fileSize || 0,
    bitRate: s.bit_rate || s.bitRate || 320,
    contentType: mimeMap[suffix] || 'audio/mpeg',
    suffix,
    path: fp || `${s.artist || 'Unknown'}/${s.title || 'Unknown'}.${suffix}`,
    isDir: 'false',
    isVideo: 'false',
    coverArt: String(s.id),
    type: 'music',
    created: s.added_at || s.addedAt || s.updated_at || s.updatedAt || '',
  }
}

// --- Route table ---

const routes: Record<string, Handler> = {
  // System
  '/rest/ping.view': handlePing,
  '/rest/ping': handlePing,
  '/rest/getLicense.view': handlePing,
  '/rest/getLicense': handlePing,
  '/rest/getUser.view': handleGetUser,
  '/rest/getUser': handleGetUser,

  // Scan Status
  '/rest/getScanStatus.view': handleGetScanStatus,
  '/rest/getScanStatus': handleGetScanStatus,

  // Browsing
  '/rest/getMusicFolders.view': handleGetMusicFolders,
  '/rest/getMusicFolders': handleGetMusicFolders,
  '/rest/getArtists.view': handleGetArtists,
  '/rest/getArtists': handleGetArtists,
  '/rest/getArtist.view': handleGetArtist,
  '/rest/getArtist': handleGetArtist,
  '/rest/getAlbum.view': handleGetAlbum,
  '/rest/getAlbum': handleGetAlbum,
  '/rest/getAlbumList.view': handleGetAlbumList,
  '/rest/getAlbumList': handleGetAlbumList,
  '/rest/getAlbumList2.view': handleGetAlbumList2,
  '/rest/getAlbumList2': handleGetAlbumList2,
  '/rest/getMusicDirectory.view': handleGetMusicDirectory,
  '/rest/getMusicDirectory': handleGetMusicDirectory,
  '/rest/getIndexes.view': handleGetIndexes,
  '/rest/getIndexes': handleGetIndexes,
  '/rest/getSong.view': handleGetSong,
  '/rest/getSong': handleGetSong,
  '/rest/getGenres.view': handleGetGenres,
  '/rest/getGenres': handleGetGenres,
  '/rest/getSongsByGenre.view': handleGetSongsByGenre,
  '/rest/getSongsByGenre': handleGetSongsByGenre,
  '/rest/getRandomSongs.view': handleGetRandomSongs,
  '/rest/getRandomSongs': handleGetRandomSongs,

  // Search
  '/rest/search2.view': handleSearch2,
  '/rest/search2': handleSearch2,
  '/rest/search3.view': handleSearch3,
  '/rest/search3': handleSearch3,

  // Media
  '/rest/stream.view': handleStream,
  '/rest/stream': handleStream,
  '/rest/download.view': handleStream,
  '/rest/download': handleStream,
  '/rest/getCoverArt.view': handleGetCoverArt,
  '/rest/getCoverArt': handleGetCoverArt,
  '/rest/getLyrics.view': handleGetLyrics,
  '/rest/getLyrics': handleGetLyrics,
  '/rest/getLyricsBySongId.view': handleGetLyricsBySongId,
  '/rest/getLyricsBySongId': handleGetLyricsBySongId,

  // Playlists
  '/rest/getPlaylists.view': handleGetPlaylists,
  '/rest/getPlaylists': handleGetPlaylists,
  '/rest/getPlaylist.view': handleGetPlaylist,
  '/rest/getPlaylist': handleGetPlaylist,
  '/rest/createPlaylist.view': handleCreatePlaylist,
  '/rest/createPlaylist': handleCreatePlaylist,
  '/rest/updatePlaylist.view': handleUpdatePlaylist,
  '/rest/updatePlaylist': handleUpdatePlaylist,
  '/rest/deletePlaylist.view': handleDeletePlaylist,
  '/rest/deletePlaylist': handleDeletePlaylist,

  // Star / Unstar
  '/rest/star.view': handleStar,
  '/rest/star': handleStar,
  '/rest/unstar.view': handleUnstar,
  '/rest/unstar': handleUnstar,
  '/rest/getStarred.view': handleGetStarred,
  '/rest/getStarred': handleGetStarred,
  '/rest/getStarred2.view': handleGetStarred2,
  '/rest/getStarred2': handleGetStarred2,

  // Scrobble
  '/rest/scrobble.view': handleScrobble,
  '/rest/scrobble': handleScrobble,

  // Internet Radio
  '/rest/getInternetRadioStations.view': handleGetInternetRadioStations,
  '/rest/getInternetRadioStations': handleGetInternetRadioStations,

  // Info (stubs)
  '/rest/getArtistInfo.view': handleGetArtistInfo,
  '/rest/getArtistInfo': handleGetArtistInfo,
  '/rest/getArtistInfo2.view': handleGetArtistInfo2,
  '/rest/getArtistInfo2': handleGetArtistInfo2,
  '/rest/getAlbumInfo.view': handleGetAlbumInfo,
  '/rest/getAlbumInfo': handleGetAlbumInfo,
  '/rest/getAlbumInfo2.view': handleGetAlbumInfo2,
  '/rest/getAlbumInfo2': handleGetAlbumInfo2,
  '/rest/getSimilarSongs.view': handleGetSimilarSongs,
  '/rest/getSimilarSongs': handleGetSimilarSongs,
  '/rest/getSimilarSongs2.view': handleGetSimilarSongs2,
  '/rest/getSimilarSongs2': handleGetSimilarSongs2,
  '/rest/getTopSongs.view': handleGetTopSongs,
  '/rest/getTopSongs': handleGetTopSongs,
}

// --- Server config management (exposed via normal auth routes) ---

const handleGetServerConfig: Handler = async (_req, _query) => {
  const config = await getServerConfig()
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: config.enabled, username: config.username })
  }
}

const handleSetServerConfig: Handler = async (req, _query) => {
  const body = req.body ? (typeof req.body === 'string' ? req.body : new TextDecoder().decode(req.body)) : '{}'
  const data = JSON.parse(body) as Partial<ServerConfig>
  const config = await getServerConfig()
  if (data.enabled !== undefined) config.enabled = data.enabled
  if (data.username) config.username = data.username
  if (data.password) config.password = data.password
  await saveServerConfig(config)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: config.enabled, username: config.username })
  }
}

export async function handleServerRoute(req: HTTPRequest): Promise<HTTPResponse | null> {
  const path = req.path
  const query = new URLSearchParams(req.query)

  // Subsonic API: 参数可通过 URL query 或 POST body (form-encoded) 传递
  if (req.body) {
    const bodyStr = typeof req.body === 'string'
      ? req.body
      : String.fromCharCode.apply(null, Array.from(req.body as Uint8Array))
    if (bodyStr && !bodyStr.startsWith('{') && !bodyStr.startsWith('[')) {
      const bodyParams = new URLSearchParams(bodyStr)
      for (const [key, value] of bodyParams.entries()) {
        query.append(key, value)
      }
    }
  }

  // 服务端配置管理（走正常 JWT 认证路由）
  if (path === '/server/config') {
    if (req.method === 'GET') return handleGetServerConfig(req, query)
    if (req.method === 'PUT' || req.method === 'POST') return handleSetServerConfig(req, query)
  }

  // Subsonic REST API 路由
  const handler = routes[path]
  if (!handler) return null

  // Subsonic 认证验证
  if (!await validateAuth(query)) {
    return authError(query)
  }

  return handler(req, query)
}
