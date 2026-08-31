interface ElectronAPI {
  isDesktop: boolean
  getVersion: () => Promise<string>
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

interface Window {
  electronAPI?: ElectronAPI
}
