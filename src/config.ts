// global songloft

export type ConfigType = 'subsonic' | 'dav'

export interface SubsonicConfig {
  url: string
  username: string
  password?: string
  token?: string
  salt?: string
  name: string
  version?: string
  type: 'subsonic'
}

export interface DavConfig {
  url: string
  username?: string
  password?: string
  name: string
  type: 'dav'
}

export type UnifiedConfig = SubsonicConfig | DavConfig

const CONFIG_KEY = 'unified_music_configs'

export async function getConfigs(): Promise<UnifiedConfig[]> {
  try {
    const val = await songloft.storage.get(CONFIG_KEY)
    if (val) {
      const configs = JSON.parse(val) as UnifiedConfig[]
      return configs
    }
  } catch (err) {
    songloft.logger.error('Failed to get unified configs', String(err))
  }
  return []
}

export async function saveConfigs(configs: UnifiedConfig[]): Promise<void> {
  await songloft.storage.set(CONFIG_KEY, JSON.stringify(configs))
}

export async function getConfig(name: string): Promise<UnifiedConfig | undefined> {
  const configs = await getConfigs()
  return configs.find(c => c.name === name)
}

export function isSubsonicConfig(config: UnifiedConfig): config is SubsonicConfig {
  return config.type === 'subsonic'
}

export function isDavConfig(config: UnifiedConfig): config is DavConfig {
  return config.type === 'dav'
}
