import { BrowserWindow, shell, app, protocol, net, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'node:fs'
import { registerWindowIPC } from '@/lib/window/ipcEvents'
import appIcon from '@/resources/build/icon.png?asset'
import { pathToFileURL } from 'url'
import { Sidecar } from './sidecar'

let core: Sidecar | null = null
let ipcRegistered = false
let protocolRegistered = false

export function createAppWindow(): void {
  // Register custom protocol for resources only once
  if (!protocolRegistered) {
    registerResourcesProtocol()
    protocolRegistered = true
  }

  // Initialize Rust sidecar
  if (!core) {
    core = new Sidecar()
  }

  // Create the main window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    backgroundColor: '#0a0a0a',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'CapSlap',
    maximizable: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Register IPC events only once
  if (!ipcRegistered) {
    registerWindowIPC(mainWindow)
    registerRustIPC(mainWindow)
    ipcRegistered = true
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol for assets
function registerResourcesProtocol() {
  if (!protocol.isProtocolHandled('res')) {
    protocol.handle('res', async (request) => {
      try {
        const url = new URL(request.url)
        const relativePath = url.href.replace('res://', '')

        let filePath: string | null = null

        if (relativePath.startsWith('local/')) {
          // Handle absolute path
          filePath = relativePath.replace('local', '')
          // Decode generic URL encoding if needed (spaces etc)
          filePath = decodeURIComponent(filePath)
          console.log('Loading local file:', filePath)
        } else {
          const possiblePaths = [
            join(__dirname, '../../resources', relativePath),
            join(__dirname, '../../../resources', relativePath),
            join(process.resourcesPath, relativePath),
            join(process.resourcesPath, 'app.asar.unpacked', 'resources', relativePath),
          ]

          for (const path of possiblePaths) {
            if (fs.existsSync(path)) {
              filePath = path
              break
            }
          }
        }

        if (!filePath || !fs.existsSync(filePath)) {
          console.error('File not found:', filePath)
          return new Response('Resource not found', { status: 404 })
        }

        const response = await net.fetch(pathToFileURL(filePath).toString())

        // Check for video extensions to serve with correct content type
        const ext = relativePath.split('.').pop()?.toLowerCase()
        const videoExtensions = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'mpeg', 'mpg', 'm4v', '3gp', 'ts']

        if (ext && videoExtensions.includes(ext)) {
          const buffer = await response.arrayBuffer()

          let contentType = 'video/mp4' // Default fallback
          switch (ext) {
            case 'mov': contentType = 'video/quicktime'; break;
            case 'webm': contentType = 'video/webm'; break;
            case 'avi': contentType = 'video/x-msvideo'; break;
            case 'wmv': contentType = 'video/x-ms-wmv'; break;
            case 'flv': contentType = 'video/x-flv'; break;
            case 'mpeg':
            case 'mpg': contentType = 'video/mpeg'; break;
            case '3gp': contentType = 'video/3gpp'; break;
            case 'ts': contentType = 'video/mp2t'; break;
            // mp4, m4v stay as video/mp4
          }

          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': buffer.byteLength.toString(),
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          })
        }

        return response
      } catch (error) {
        console.error('Protocol error:', error)
        return new Response('Resource not found', { status: 404 })
      }
    })
  }
}

function registerRustIPC(mainWindow: BrowserWindow) {
  ipcMain.handle('dialog:openFiles', async (_evt, payload) => {
    console.log('[MAIN] File dialog requested:', payload)
    const props: any[] = ['openFile', 'multiSelections']
    const filters = payload?.filters ?? undefined
    const res = await dialog.showOpenDialog(mainWindow, { properties: props, filters })
    if (res.canceled || res.filePaths.length === 0) {
      console.log('[MAIN] File dialog cancelled')
      return null
    }
    console.log('[MAIN] File selected:', res.filePaths)
    return res.filePaths
  })

  ipcMain.handle('core:call', async (_evt, payload) => {
    console.log('[MAIN] Core call:', payload.method, payload.params, payload.requestId)
    if (!core) {
      console.error('[MAIN] Core sidecar not initialized')
      throw new Error('Core sidecar not initialized')
    }
    // Pass requestId if present
    return core.call(
      payload.method,
      payload.params,
      (p) => {
        console.log('[MAIN] Core progress:', p)
        mainWindow.webContents.send('core:progress', p)
      },
      payload.requestId
    )
  })
}
