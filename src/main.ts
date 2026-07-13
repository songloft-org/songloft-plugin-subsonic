import type { HTTPRequest, HTTPResponse } from '@songloft/plugin-sdk'
import router from './router'
import { handleServerRoute } from './server/index'

// 向 miot 注册为「外部搜索源候选」（可选增强）。
// 延迟 + 重试调用，避免与 miot 同时启动时对方尚未就绪的竞态；
// miot 未安装 / host 不支持 comm 时静默跳过，绝不阻塞自身功能。
function registerSearchProviderToMiot(): void {
  let attempts = 0
  const tryRegister = async () => {
    attempts++
    try {
      if (!songloft.comm || typeof songloft.comm.call !== 'function') return // 旧 host 无 comm
      await songloft.comm.call('miot', 'register-search-provider', {
        name: 'Subsonic',
        searchPath: '/api/search/topone',
      })
      songloft.log.info('[search] 已向 miot 注册搜索源候选')
    } catch (e) {
      if (attempts < 5) {
        setTimeout(tryRegister, 3000)
      } else {
        songloft.log.info('[search] miot 未安装/未就绪，放弃注册: ' + String(e))
      }
    }
  }
  setTimeout(tryRegister, 2000)
}

async function onInit(): Promise<void> {
  console.log('[Subsonic Plugin] Mounted')
  registerSearchProviderToMiot()
}

async function onDeinit(): Promise<void> {
  console.log('[Subsonic Plugin] Unmounted')
}

async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  // 优先匹配 Subsonic 服务端路由（/rest/* 和 /server/config）
  const serverResp = await handleServerRoute(req)
  if (serverResp) return serverResp

  // 否则走现有客户端路由
  return await router.handle(req)
}

globalThis.onInit = onInit
globalThis.onDeinit = onDeinit
globalThis.onHTTPRequest = onHTTPRequest
