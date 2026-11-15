// 生成 DeepSeek 风格鲸鱼启动图标（参照复盘 make_icon.py 的做法，用 sharp 渲染 SVG）
// 运行：NODE_PATH="$(npm root -g)" node tools/make_icon.cjs
const path = require('node:path')
const fs = require('node:fs')
const sharp = require('sharp')

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const BRAND = '#4D6BFE'

// 简化鲸鱼：圆头朝左，背线隆起，尾部双鳍上扬，蓝色眼睛
const whale = (fill, eyeFill) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <path fill="${fill}" d="
    M 150 545
    C 160 400 300 305 470 315
    C 590 322 700 370 755 440
    C 800 380 880 310 935 315
    C 905 395 855 445 815 470
    C 865 505 925 585 930 645
    C 855 650 790 615 748 570
    C 690 655 540 715 400 700
    C 250 685 145 640 150 545 Z"/>
  <circle cx="312" cy="478" r="30" fill="${eyeFill}"/>
</svg>`

// 各密度目标（dp × 密度系数）
const launcherSizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 }
const fgSizes = { 'mipmap-mdpi': 108, 'mipmap-hdpi': 162, 'mipmap-xhdpi': 216, 'mipmap-xxhdpi': 324, 'mipmap-xxxhdpi': 432 }

const render = async (svg, size, out) => sharp(Buffer.from(svg), { density: 96 }).resize(size, size).png().toFile(out)

async function main() {
  // 自适应图标：背景纯品牌蓝，前景白鲸（透明底，居中安全区）
  fs.writeFileSync(
    path.join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`
  )
  for (const [dir, size] of Object.entries(fgSizes)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${whale('none', 'none')}</svg>`
    const scaled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
      <g transform="translate(512,512) scale(0.55) translate(-512,-512)">${whale('#FFFFFF', BRAND)}</g>
    </svg>`
    await render(scaled, size, path.join(RES, dir, 'ic_launcher_foreground.png'))
  }

  // 旧版启动器：蓝色圆角方 / 圆形底 + 白鲸
  for (const [dir, size] of Object.entries(launcherSizes)) {
    const inset = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <rect width="1024" height="1024" fill="${BRAND}"/>
        <g transform="translate(512,512) scale(0.72) translate(-512,-512)">${whale('#FFFFFF', BRAND)}</g>
      </svg>`
    const circle = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <circle cx="512" cy="512" r="512" fill="${BRAND}"/>
        <g transform="translate(512,512) scale(0.72) translate(-512,-512)">${whale('#FFFFFF', BRAND)}</g>
      </svg>`
    await render(inset, size, path.join(RES, dir, 'ic_launcher.png'))
    await render(circle, size, path.join(RES, dir, 'ic_launcher_round.png'))
  }

  // 预览图（供人工检查）
  const preview = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="${BRAND}"/>
      <g transform="translate(512,512) scale(0.72) translate(-512,-512)">${whale('#FFFFFF', BRAND)}</g>
    </svg>`
  await sharp(Buffer.from(preview)).resize(256, 256).png().toFile(path.join(__dirname, 'icon-preview.png'))
  console.log('icons written')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
