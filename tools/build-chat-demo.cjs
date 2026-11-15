// 构建 chat-demo 静态产物（跨平台：替代 rm -rf / NODE_ENV= 组合的 npm script 写法）
// node tools/build-chat-demo.cjs [--install]
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const APP_DIR = path.join(__dirname, '..', 'chat-demo')
const DIST = path.join(APP_DIR, 'dist')

const run = (cmd, args, cwd, env) => {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (res.status !== 0) {
    process.exit(res.status ?? 1)
  }
}

function main() {
  if (process.argv.includes('--install')) {
    const lockfile = path.join(APP_DIR, 'pnpm-lock.yaml')
    if (fs.existsSync(lockfile)) {
      run('pnpm', ['install'], APP_DIR)
    } else {
      run('npm', ['install'], APP_DIR)
    }
  }
  fs.rmSync(DIST, { recursive: true, force: true })
  run(
    path.join(APP_DIR, 'node_modules', '.bin', 'rspack' + (process.platform === 'win32' ? '.cmd' : '')),
    ['build', '-c', 'rspack.config.ts'],
    APP_DIR,
    { NODE_ENV: 'production' }
  )
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('build failed: dist/index.html missing')
    process.exit(1)
  }
  console.log('chat-demo dist ready:', DIST)
}

main()
