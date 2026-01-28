import '@testing-library/jest-dom'

// Mock Electron IPC for tests
Object.defineProperty(window, 'electron', {
    value: {
        ipcRenderer: {
            invoke: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn(),
        },
    },
    writable: true,
})

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}))

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
})

// Mock scrollTo
Element.prototype.scrollTo = vi.fn()
window.scrollTo = vi.fn()
