import '@testing-library/jest-dom'

// Mock crypto for test environment
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
      return arr
    },
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
  },
})

// Mock import.meta.env for tests
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_DEMO_MODE: 'true',
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    PROD: false,
    DEV: true,
    MODE: 'test',
  },
  writable: true,
})
