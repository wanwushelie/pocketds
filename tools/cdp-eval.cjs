// CDP 诊断脚本：node tools/cdp-eval.cjs "<js表达式>" [等待ms] [端口]
// 通过模拟器 webview 的 DevTools WebSocket 执行表达式，收集 console 输出
const http = require('node:http')
const WebSocket = require('ws')

const PORT = process.argv[4] ? Number(process.argv[4]) : 9223
const WAIT = process.argv[3] ? Number(process.argv[3]) : 2000
const EXPR = process.argv[2]

const getList = () =>
  new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve(JSON.parse(body)))
    }).on('error', reject)
  })

async function main() {
  if (!EXPR) {
    console.error('usage: node cdp-eval.cjs "<js>" [waitMs] [port]')
    process.exit(1)
  }
  const pages = await getList()
  const page = pages.find((p) => p.type === 'page')
  if (!page) {
    console.error('no page found')
    process.exit(1)
  }
  const wsUrl = page.webSocketDebuggerUrl.replace('localhost', '127.0.0.1')
  const consoleLogs = []
  let msgId = 0
  const pending = new Map()
  let resolveOpen
  const opened = new Promise((resolve) => (resolveOpen = resolve))

  const ws = new WebSocket(wsUrl)
  ws.on('open', resolveOpen)
  ws.on('error', (e) => consoleLogs.push(`[ws-error] ${e.code} ${e.message}`))
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id)
      pending.delete(msg.id)
      resolve(msg)
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const line = msg.params.args
        .map((a) => (a.value !== undefined ? JSON.stringify(a.value) : a.description || a.type))
        .join(' ')
      consoleLogs.push(`[${msg.params.type}] ${line}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleLogs.push(
        `[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`
      )
    }
  })

  await opened

  const call = (method, params) =>
    new Promise((resolve) => {
      const id = ++msgId
      pending.set(id, { resolve })
      ws.send(JSON.stringify({ id, method, params }))
    })

  await call('Runtime.enable', {})
  const result = await call('Runtime.evaluate', {
    expression: EXPR,
    awaitPromise: true,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, WAIT))

  if (result.result?.result?.value !== undefined) {
    console.log('RESULT:', JSON.stringify(result.result.result.value))
  }
  if (result.result?.result?.description) {
    console.log('DESC:', result.result.result.description)
  }
  if (result.error) {
    console.log('RPC-ERROR:', JSON.stringify(result.error))
  }
  for (const line of consoleLogs) {
    console.log('CONSOLE:', line)
  }
  ws.close()
  process.exit(0)
}

main().catch((error) => {
  console.error('FAILED:', error.stack || error.message || String(error))
  process.exit(1)
})
