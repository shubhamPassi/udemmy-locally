const { app, BrowserWindow, dialog } = require('electron')
const { spawn, execFile } = require('child_process')
const path = require('path')

const DEFAULT_URL = 'http://127.0.0.1:9474'
const SERVER_READY_RE = /http:\/\/127\.0\.0\.1:(\d+)/

let mainWindow = null
let serverProcess = null
let serverUrl = DEFAULT_URL
let isQuitting = false

function createWindow() {
    const appRoot = app.getAppPath()
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.ico')
        : path.join(appRoot, 'public', 'tutin-icon.svg')

    mainWindow = new BrowserWindow({
        width: 1360,
        height: 860,
        minWidth: 1000,
        minHeight: 680,
        show: false,
        title: 'TutIn',
        icon: iconPath,
        backgroundColor: '#050505',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    })

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!doctype html>
        <html>
            <head>
                <title>TutIn</title>
                <style>
                    html, body {
                        margin: 0;
                        width: 100%;
                        height: 100%;
                        background: #050505;
                        color: #f5f5f5;
                        font-family: Segoe UI, system-ui, sans-serif;
                    }
                    main {
                        height: 100%;
                        display: grid;
                        place-items: center;
                    }
                    .loader {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 14px;
                    }
                    .mark {
                        width: 44px;
                        height: 44px;
                        border-radius: 12px;
                        display: grid;
                        place-items: center;
                        background: #ffffff14;
                        border: 1px solid #ffffff1f;
                        font-weight: 800;
                        font-size: 22px;
                    }
                    .spinner {
                        width: 22px;
                        height: 22px;
                        border-radius: 50%;
                        border: 2px solid #ffffff33;
                        border-top-color: #ffffff;
                        animation: spin .8s linear infinite;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <main>
                    <div class="loader">
                        <div class="mark">T</div>
                        <div>Starting TutIn...</div>
                        <div class="spinner"></div>
                    </div>
                </main>
            </body>
        </html>
    `)}`)
}

function startServer() {
    return new Promise((resolve, reject) => {
        const appRoot = app.getAppPath()
        const serverEntry = path.join(appRoot, 'server', 'index.js')
        const workingDir = app.isPackaged ? path.dirname(process.execPath) : appRoot
        const env = {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_ENV: 'production',
        }

        serverProcess = spawn(process.execPath, [serverEntry], {
            cwd: workingDir,
            env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        let settled = false
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true
                reject(new Error('TutIn server did not become ready in time.'))
            }
        }, 30000)

        const onData = (chunk) => {
            const text = chunk.toString()
            const match = text.match(SERVER_READY_RE)
            if (match) {
                serverUrl = `http://127.0.0.1:${match[1]}`
                if (!settled) {
                    settled = true
                    clearTimeout(timeout)
                    resolve(serverUrl)
                }
            }
        }

        serverProcess.stdout.on('data', onData)
        serverProcess.stderr.on('data', (chunk) => {
            const text = chunk.toString()
            console.error(text)
            onData(chunk)
        })

        serverProcess.on('exit', (code, signal) => {
            serverProcess = null
            if (!settled && !isQuitting) {
                settled = true
                clearTimeout(timeout)
                reject(new Error(`TutIn server exited before startup completed (${code ?? signal}).`))
            }
        })

        serverProcess.on('error', (err) => {
            if (!settled) {
                settled = true
                clearTimeout(timeout)
                reject(err)
            }
        })
    })
}

function stopServer() {
    if (!serverProcess) return Promise.resolve()

    const child = serverProcess
    serverProcess = null

    return new Promise((resolve) => {
        let done = false
        const finish = () => {
            if (!done) {
                done = true
                resolve()
            }
        }

        child.once('exit', finish)
        child.kill('SIGTERM')

        setTimeout(() => {
            if (done) return
            execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, finish)
        }, 2500)
    })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })

    app.whenReady().then(async () => {
        createWindow()

        try {
            const url = await startServer()
            if (mainWindow) {
                await mainWindow.loadURL(url)
            }
        } catch (err) {
            dialog.showErrorBox('TutIn failed to start', err.message)
            app.quit()
        }
    })

    app.on('before-quit', (event) => {
        if (isQuitting) return
        event.preventDefault()
        isQuitting = true
        stopServer().finally(() => app.quit())
    })

    app.on('window-all-closed', () => {
        app.quit()
    })
}
