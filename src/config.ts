// global songloft

export interface SubsonicConfig {
  url: string
  username: string
  password?: string
  token?: string
  salt?: string
  name: string
  version?: string // e.g. 1.16.1
  pathPrefix?: string // API 路径前缀，默认 "/rest"，部分服务器（如 LX Music Sync Server）需设为空
}

const CONFIG_KEY = 'subsonic_configs'

export async function getConfigs(): Promise<SubsonicConfig[]> {
  try {
    const val = await songloft.storage.get(CONFIG_KEY)
    if (val) {
      return JSON.parse(val) as SubsonicConfig[]
    }
  } catch (err) {
    songloft.logger.error('Failed to get subsonic configs', String(err))
  }
  return []
}

export async function saveConfigs(configs: SubsonicConfig[]): Promise<void> {
  await songloft.storage.set(CONFIG_KEY, JSON.stringify(configs))
}

export async function getConfig(name: string): Promise<SubsonicConfig | undefined> {
  const configs = await getConfigs()
  return configs.find(c => c.name === name)
}
