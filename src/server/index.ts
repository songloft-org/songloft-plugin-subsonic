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
  for (const song of songs) {
    const a = song.artist || 'Unknown'
    artistMap.set(a, (artistMap.get(a) || 0) + 1)
  }

  const indexes: Record<string, any[]> = {}
  for (const [name, count] of artistMap) {
    const letter = (name[0] || '#').toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!indexes[key]) indexes[key] = []
    indexes[key].push({ id: `ar-${name}`, name, albumCount: 0, songCount: count })
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

  // 按 album 聚合
  const albumMap = new Map<string, { artist: string; songCount: number; id: number }>()
  for (const song of songs) {
    const album = song.album || 'Unknown'
    if (!albumMap.has(album)) {
      albumMap.set(album, { artist: song.artist, songCount: 0, id: song.id })
    }
    albumMap.get(album)!.songCount++
  }

  let albums = Array.from(albumMap.entries()).map(([name, info]) => ({
    id: `al-${info.id}`,
    name,
    artist: info.artist,
    songCount: info.songCount,
    coverArt: `al-${info.id}`,
  }))

  if (type === 'alphabeticalByName') {
    albums.sort((a, b) => a.name.localeCompare(b.name))
  }
  // default: newest (original order from DB)

  albums = albums.slice(offset, offset + size)
  const r = okResponse(query, { albumList2: { album: albums } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetAlbum: Handler = async (_req, query) => {
  const id = query.get('id') || ''
  // id 格式为 "al-{songId}"，用该 song 的 album 名聚合同专辑歌曲
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

  // 按 album 聚合
  const albumMap = new Map<string, { id: number; songCount: number }>()
  for (const song of artistSongs) {
    const album = song.album || 'Unknown'
    if (!albumMap.has(album)) {
      albumMap.set(album, { id: song.id, songCount: 0 })
    }
    albumMap.get(album)!.songCount++
  }

  const albums = Array.from(albumMap.entries()).map(([name, info]) => ({
    id: `al-${info.id}`,
    name,
    artist: artistName,
    songCount: info.songCount,
    coverArt: `al-${info.id}`,
  }))

  const r = okResponse(query, {
    artist: { id, name: artistName, albumCount: albums.length, album: albums }
  })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Search ---

const handleSearch3: Handler = async (_req, query) => {
  const q = query.get('query') || ''
  const songCount = Math.min(parseInt(query.get('songCount') || '20'), 100)

  const songs = await songloft.songs.search(q)
  const songResults = songs.slice(0, songCount).map(s => songToSubsonic(s))

  const r = okResponse(query, { searchResult3: { song: songResults } })
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
  return { serveFile: { songId } }
}

const handleGetCoverArt: Handler = async (_req, query) => {
  const id = query.get('id') || ''
  const token = await songloft.plugin.getToken()

  // 歌单封面：pl-{playlistId}
  if (id.startsWith('pl-')) {
    const plId = id.slice(3)
    return {
      statusCode: 302,
      headers: { 'Location': `/api/v1/playlists/${plId}/cover?access_token=${token}` },
      body: ''
    }
  }

  // 歌曲/专辑封面：{songId} 或 al-{songId}
  const numId = parseInt(id.replace(/^(al|ar)-/, ''))
  if (isNaN(numId)) {
    return { statusCode: 404, headers: {}, body: '' }
  }
  return {
    statusCode: 302,
    headers: { 'Location': `/api/v1/songs/${numId}/cover?access_token=${token}` },
    body: ''
  }
}

const handleGetLyrics: Handler = async (_req, query) => {
  const artist = query.get('artist') || ''
  const title = query.get('title') || ''

  // 通过搜索找到匹配的歌曲
  let songId = 0
  if (title) {
    const songs = await songloft.songs.search(title)
    const match = songs.find((s: any) =>
      s.title === title || (artist && s.artist === artist && s.title === title)
    )
    if (match) songId = match.id
  }

  if (!songId) {
    const r = okResponse(query, { lyrics: { artist, title } })
    return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
  }

  // 通过内部 API 获取歌词
  try {
    const token = await songloft.plugin.getToken()
    const hostUrl = await songloft.plugin.getHostUrl()
    const resp = await fetch(`${hostUrl}/api/v1/songs/${songId}/lyric?access_token=${token}`)
    if (resp.ok) {
      const data = await resp.json() as any
      const lyric = data.lyric || ''
      // 去掉 LRC 时间标签，Subsonic getLyrics 返回纯文本
      const plainText = lyric.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').replace(/\[.*?\]\r?\n?/g, '').trim()
      const r = okResponse(query, { lyrics: { artist, title, value: plainText } })
      return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
    }
  } catch {}

  const r = okResponse(query, { lyrics: { artist, title } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Playlists ---

const handleGetPlaylists: Handler = async (_req, query) => {
  const playlists = await songloft.playlists.list()
  const items = playlists.map((p: any) => ({
    id: String(p.id),
    name: p.name,
    songCount: p.song_count ?? p.songCount ?? 0,
    public: true,
    coverArt: (p.cover_url || p.coverUrl) ? `pl-${p.id}` : '',
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
  const r = okResponse(query, {
    playlist: { id: String(pl.id), name: pl.name, songCount: pl.song_count ?? pl.songCount ?? 0, entry: entries }
  })
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
  // 返回空收藏（暂无 star 状态持久化）
  const r = okResponse(query, { starred: { song: [], album: [], artist: [] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

const handleGetStarred2: Handler = async (_req, query) => {
  const r = okResponse(query, { starred2: { song: [], album: [], artist: [] } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Indexes ---

const handleGetIndexes: Handler = async (_req, query) => {
  const songs = await songloft.songs.list({ limit: 100000 })
  const artistMap = new Map<string, number>()
  for (const song of songs) {
    const a = song.artist || 'Unknown'
    artistMap.set(a, (artistMap.get(a) || 0) + 1)
  }

  const indexes: Record<string, any[]> = {}
  for (const [name] of artistMap) {
    const letter = (name[0] || '#').toUpperCase()
    const key = /[A-Z]/.test(letter) ? letter : '#'
    if (!indexes[key]) indexes[key] = []
    indexes[key].push({ id: `ar-${name}`, name })
  }

  const indexArr = Object.entries(indexes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, artists]) => ({ name, artist: artists }))

  const r = okResponse(query, { indexes: { ignoredArticles: 'The El La', index: indexArr } })
  return { statusCode: 200, headers: { 'Content-Type': r.contentType }, body: r.body }
}

// --- Random ---

const handleGetRandomSongs: Handler = async (_req, query) => {
  const size = Math.min(parseInt(query.get('size') || '10'), 500)
  const songs = await songloft.songs.list({ limit: size })
  const r = okResponse(query, { randomSongs: { song: songs.map(s => songToSubsonic(s)) } })
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

// --- Helpers ---

function songToSubsonic(s: any) {
  const fp = s.file_path || s.filePath || ''
  const suffix = fp.split('.').pop() || 'mp3'
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4',
    ogg: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma', aac: 'audio/aac',
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
    size: s.file_size || 0,
    bitRate: s.bit_rate || 320,
    contentType: mimeMap[suffix] || 'audio/mpeg',
    suffix,
    path: fp || `${s.artist || 'Unknown'}/${s.title || 'Unknown'}.${suffix}`,
    isDir: 'false',
    isVideo: 'false',
    coverArt: String(s.id),
    type: 'music',
    created: s.added_at || s.updated_at || '',
  }
}

// --- Route table ---

const routes: Record<string, Handler> = {
  '/rest/ping.view': handlePing,
  '/rest/ping': handlePing,
  '/rest/getLicense.view': handlePing,
  '/rest/getLicense': handlePing,
  '/rest/getUser.view': handleGetUser,
  '/rest/getUser': handleGetUser,
  '/rest/getMusicFolders.view': handleGetMusicFolders,
  '/rest/getMusicFolders': handleGetMusicFolders,
  '/rest/getArtists.view': handleGetArtists,
  '/rest/getArtists': handleGetArtists,
  '/rest/getArtist.view': handleGetArtist,
  '/rest/getArtist': handleGetArtist,
  '/rest/getAlbum.view': handleGetAlbum,
  '/rest/getAlbum': handleGetAlbum,
  '/rest/getAlbumList2.view': handleGetAlbumList2,
  '/rest/getAlbumList2': handleGetAlbumList2,
  '/rest/search3.view': handleSearch3,
  '/rest/search3': handleSearch3,
  '/rest/stream.view': handleStream,
  '/rest/stream': handleStream,
  '/rest/download.view': handleStream,
  '/rest/download': handleStream,
  '/rest/getCoverArt.view': handleGetCoverArt,
  '/rest/getCoverArt': handleGetCoverArt,
  '/rest/getLyrics.view': handleGetLyrics,
  '/rest/getLyrics': handleGetLyrics,
  '/rest/getPlaylists.view': handleGetPlaylists,
  '/rest/getPlaylists': handleGetPlaylists,
  '/rest/getPlaylist.view': handleGetPlaylist,
  '/rest/getPlaylist': handleGetPlaylist,
  '/rest/getRandomSongs.view': handleGetRandomSongs,
  '/rest/getRandomSongs': handleGetRandomSongs,
  '/rest/getGenres.view': handleGetGenres,
  '/rest/getGenres': handleGetGenres,
  '/rest/getSong.view': handleGetSong,
  '/rest/getSong': handleGetSong,
  '/rest/getStarred.view': handleGetStarred,
  '/rest/getStarred': handleGetStarred,
  '/rest/getStarred2.view': handleGetStarred2,
  '/rest/getStarred2': handleGetStarred2,
  '/rest/getIndexes.view': handleGetIndexes,
  '/rest/getIndexes': handleGetIndexes,
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
