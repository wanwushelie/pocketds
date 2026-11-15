# PocketDS — DeepSeek 官网聊天 Demo 的本地全端版

基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT，React 18 + rspack）的
**Capacitor 原生壳工程**：网页成品零重写，套原生容器出移动端安装包。

| 目标端 | 状态 | 产物 |
|---|---|---|
| Android APK | ✅ 已验证（真机 + 模拟器） | `android/app/build/outputs/apk/release/app-release.apk` |
| iOS IPA | 规划中（Capacitor 官方支持，走云构建免 Mac） | — |
| 鸿蒙 HAP | 规划中（ArkWeb 壳加载同一份 dist） | — |
| Web/H5 | 上游原生支持 | `chat-demo/dist/` |

## 架构

```
chat-demo/ (React SPA，静态站)          ← 上游源码 + 本仓库补丁（见 docs/patches/）
    │  rspack build
    ▼
chat-demo/dist/  ── webDir ──▶  Capacitor 8
                                    │  cap sync android
                                    ▼
                                android/  (WebView 原生壳)
                                    │  gradlew assembleRelease
                                    ▼
                                app-release.apk
```

- **网络层零改动**：App 直连 `api.deepseek.com`（CORS 全开放），无代理、无 CapacitorHttp
  （后者会缓冲响应、破坏 SSE 流式）。
- **本地存储零改动**：IndexedDB 存会话与图片原件，WebView 内持久化。

## 目录结构

```
├── chat-demo/            # 上游源码 + 补丁（见 docs/patches/）
├── android/              # Capacitor 生成的原生壳工程（含自研插件）
│   └── app/src/main/java/com/chatdemo/webui/
│       ├── MainActivity.java
│       └── ImportFileCachePlugin.java   # 大文件导入的原生通道（见下文）
├── tools/                # 构建/诊断脚本
│   ├── build-chat-demo.cjs   # 跨平台构建 dist
│   ├── make_icon.cjs         # 生成启动图标（sharp 渲染 SVG）
│   ├── make-test-export.cjs  # 生成符合导出格式 v3 的测试 ZIP
│   └── cdp-eval.cjs          # WebView CDP 调试（debug 包 + adb forward）
├── docs/patches/         # 相对上游的完整 diff（供上游升级时 rebase）
├── capacitor.config.json # appId: com.dsweb.chat, webDir: chat-demo/dist
└── 安装包/               # 出包归档（gitignored，含 keystore 与口令）
```

## 环境要求

- Node 22+、pnpm（chat-demo 侧）
- JDK 21（`android/gradle.properties` 的 `org.gradle.java.home` 指向本机 JDK 21，按需改路径）
- Android SDK（compileSdk 36 / build-tools 36.x），`ANDROID_HOME` 已配置

## 构建

```sh
npm install                 # 壳工程依赖
npm run build:web:install   # 首次：装 chat-demo 依赖并构建 dist
npm run sync                # dist → android 工程
npm run apk                 # 出签名 release 包（需先配置签名，见下）
npm run apk:debug           # 出 debug 包（WebView 可 chrome://inspect 调试）
```

## 签名（不入库）

`android/key.properties` + `android/app/release.keystore` 被 .gitignore 排除，
release 构建需要自备：

```sh
keytool -genkeypair -v -keystore android/app/release.keystore -alias chatdemo \
  -keyalg RSA -keysize 2048 -validity 10000
# android/key.properties:
# storeFile=release.keystore
# storePassword=...
# keyAlias=chatdemo
# keyPassword=...
```

## 相对上游的改造（docs/patches/chat-demo-upstream-changes.patch）

1. **content:// 管道修复**：APK 内系统文件选择器交给网页的是 content:// 管道文件，
   `File.slice()` 随机访问退化为 O(n²) 重读；≤400MB 整读进内存做零拷贝切片。
2. **原生导入通道**（自研插件 `ImportFileCache`）：大 ZIP 由原生层拷进沙箱成真实文件，
   zipReader 经 `readRange` 桥随机读取；网页端自动回退 `<input type="file">`。
3. **导入进度条**：按归档字节偏移上报百分比（300ms 节流）。
4. **性能四件套**：DecompressionStream 原生解压（fflate 兜底）、图片批量入库、
   会话 JSON gzip 存储（读写双格式兼容，免迁移事务）。
5. **IndexedDB 事务纪律**：流式解压/编码全部移出事务，事务内只做同步请求
   （await 非 IDB 操作会让事务提前提交）。

## 验证清单

- [ ] 填 API Key → 发消息 → 流式回答正常
- [ ] 设置 → 导入历史对话 → 小 ZIP 秒级完成，显示"已导入 N 个对话"
- [ ] 导入大 ZIP（百 MB 级）→ 进度条持续走动，无 O(n²) 卡顿
- [ ] 图片消息显示原件；语音输入可用（Manifest 已声明 RECORD_AUDIO）
- [ ] 导出 ZIP → 卸载重装 → 再导入可恢复
- [ ] `apksigner verify --print-certs` 签名有效

## License

chat-demo 上游为 MIT；本仓库补丁部分同随 MIT。
