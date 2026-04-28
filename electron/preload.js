import { contextBridge, ipcRenderer } from 'electron';

// 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 这里可以添加需要在渲染进程中使用的 Electron API
  // 例如：打开文件夹、保存文件等
});
