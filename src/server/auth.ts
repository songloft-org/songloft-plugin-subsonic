const SERVER_CONFIG_KEY = 'subsonic_server_config'

export interface ServerConfig {
  enabled: boolean
  username: string
  password: string
}

export async function getServerConfig(): Promise<ServerConfig> {
  try {
    const val = await songloft.storage.get(SERVER_CONFIG_KEY)
    if (val) return JSON.parse(val as string) as ServerConfig
  } catch {}
  return { enabled: false, username: 'admin', password: '' }
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
  await songloft.storage.set(SERVER_CONFIG_KEY, JSON.stringify(config))
}

export async function validateAuth(query: URLSearchParams): Promise<boolean> {
  const config = await getServerConfig()
  if (!config.enabled || !config.password) return false

  const u = query.get('u')
  if (u !== config.username) return false

  const t = query.get('t')
  const s = query.get('s')
  const p = query.get('p')

  if (t && s) {
    const expected = __go_crypto_md5(config.password + s)
    return expected === t
  }

  if (p) {
    const plain = p.startsWith('enc:') ? hexToString(p.slice(4)) : p
    return plain === config.password
  }

  return false
}

function hexToString(hex: string): string {
  let str = ''
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16))
  }
  return str
}
