// 生成一个符合 DeepSeek 导出格式 v3 的最小 ZIP，用于端到端导入验证
// node tools/make-test-export.cjs <输出路径>
const { zipSync, strToU8 } = require('D:/code/dsweb/chat-demo/node_modules/fflate')
const fs = require('node:fs')

const OUT = process.argv[2] || 'D:/tmp/test-export.zip'
const T = '2026-11-15T12:00:00.000Z'

const session = {
  id: 'testsession001',
  title: '导入链路验证',
  pinned: false,
  current_message_id: 2,
  inserted_at: T,
  updated_at: T,
  messages: [
    {
      id: 1,
      parent_id: null,
      role: 'USER',
      status: 'FINISHED',
      thinking_enabled: false,
      search_enabled: false,
      accumulated_token_usage: 0,
      inserted_at: T,
      fragments: [{ type: 'REQUEST', content: '这是一条导入链路验证消息' }],
    },
    {
      id: 2,
      parent_id: 1,
      role: 'ASSISTANT',
      status: 'FINISHED',
      thinking_enabled: false,
      search_enabled: false,
      accumulated_token_usage: 42,
      inserted_at: T,
      fragments: [{ type: 'RESPONSE', content: '导入成功！这条回答来自生成的测试 ZIP。' }],
    },
  ],
}

const zipData = zipSync({
  'manifest.json': strToU8(JSON.stringify({ export_format_version: 3 })),
  'chat_sessions/testsession001.json': strToU8(JSON.stringify(session)),
  'chat_session_index.json': strToU8(
    JSON.stringify([
      {
        id: 'testsession001',
        title: '导入链路验证',
        pinned: false,
        message_count: 2,
        inserted_at: T,
        updated_at: T,
      },
    ])
  ),
})

fs.writeFileSync(OUT, zipData)
console.log('written', OUT, zipData.length, 'bytes')
