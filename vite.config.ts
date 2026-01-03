import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 這裡的名稱必須與您的 GitHub 儲存庫名稱完全一致
  base: mode === 'production' ? '/smart-clinic-dashboard/' : '/',
}))