import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'TabGo',
    description: 'Automatically group tabs and manage a whitelist',
    permissions: ['tabs', 'storage', 'tabGroups', 'contextMenus', 'management'],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    action: {
      default_title: 'TabGo',
    },
    commands: {
      'quick-group': {
        description: '立即分组当前窗口',
      },
      'tab-search': {
        description: '在当前页面打开标签搜索',
      },
      'open-dashboard': {
        description: '打开 TabGo 控制台',
      },
    },
  },
});
