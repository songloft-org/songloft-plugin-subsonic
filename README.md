# Songloft Subsonic 插件

本插件为 Songloft 提供了 Subsonic 协议的支持，允许将支持 Subsonic API 的外部音乐服务器（如 Navidrome、Airsonic 等）无缝接入到 Songloft 播放器中。

## ✨ 核心特性

- **多节点管理**：支持同时配置和管理多个 Subsonic 服务器源。
- **全站搜索集成**：完全集成了 Songloft 的全局搜索功能，搜索关键词会自动在所有的 Subsonic 节点中并发查找（依赖于 Subsonic 的 `search3` 接口）。
- **音频流解析**：实现直连解析配置，音乐点播直接缓冲流媒体，不占用过多服务器资源。

## 📦 开发与构建

基于 `songloft-plugin-sdk` 和 TypeScript 构建，运行在 QuickJS 沙盒中。

```bash
# 安装依赖
pnpm install

# 本地调试与开发
pnpm run dev

# 构建生产环境插件包 (产物位于 dist/subsonic.jsplugin.zip)
pnpm run build
```

## 📄 License

MIT
