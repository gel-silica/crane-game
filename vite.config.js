import { defineConfig } from 'vite'

// リポジトリ名を指定します。例: /crane-game/
// 自分のGitHubリポジトリ名に合わせて変更してください
const repoName = '/crane-game/'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? repoName : '/',
  build: {
    outDir: 'dist'
  }
})