import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const COOKIE_NAME = 'lootchat_admin_session'
const SESSION_SECONDS = 60 * 60 * 12
const MAX_BODY_BYTES = 4096
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 15 * 60 * 1000
const attempts = new Map()

function readEnvFile() {
  const values = {}
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match || match[2].startsWith('#')) continue
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch { /* Environment variables may be injected by the host. */ }
  return values
}

function config() {
  const file = readEnvFile()
  const value = key => process.env[key] || file[key] || ''
  return { email: value('ADMIN_EMAIL').trim().toLowerCase(), passwordHash: value('ADMIN_PASSWORD_HASH'), sessionSecret: value('ADMIN_SESSION_SECRET') }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      body += chunk
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) reject(new Error('Request is too large.'))
    })
    req.on('end', () => {
      try { resolveBody(JSON.parse(body || '{}')) } catch { reject(new Error('Invalid request.')) }
    })
    req.on('error', reject)
  })
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try { return new URL(origin).host === req.headers.host } catch { return false }
}

function cookieValue(req, name) {
  const cookieHeader = req.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return ''
}

function issueToken(email, secret) {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', email, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(token, secret) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  let actual
  try { actual = Buffer.from(signature, 'base64url') } catch { return null }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return session.sub === 'admin' && session.exp > Math.floor(Date.now() / 1000) ? session : null
  } catch { return null }
}

function secureCookie(req) {
  return Boolean(req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https')
}

function sessionCookie(req, token, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secureCookie(req) ? '; Secure' : ''}`
}

function rateLimit(ip) {
  const now = Date.now()
  const record = attempts.get(ip)
  if (!record || now >= record.resetAt) {
    attempts.set(ip, { count: 0, resetAt: now + RATE_WINDOW_MS })
    return { limited: false, retrySeconds: 0 }
  }
  return { limited: record.count >= RATE_LIMIT, retrySeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) }
}

function recordFailure(ip) {
  const now = Date.now()
  const record = attempts.get(ip)
  if (!record || now >= record.resetAt) attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
  else record.count += 1
}

function passwordMatches(password, encodedHash) {
  const [algorithm, saltHex, hashHex] = encodedHash.split(':')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex || !/^[a-f0-9]+$/i.test(saltHex) || !/^[a-f0-9]+$/i.test(hashHex)) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function handleAdminAuth(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname
  const method = req.method || 'GET'
  const routes = ['/api/auth/admin/sign-in', '/api/auth/admin/session', '/api/auth/sign-out']
  if (!routes.includes(path)) return false

  if (path === '/api/auth/admin/session' && method === 'GET') {
    const { sessionSecret } = config()
    if (!sessionSecret) return json(res, 200, { authenticated: false }) || true
    const session = verifyToken(cookieValue(req, COOKIE_NAME), sessionSecret)
    json(res, 200, session ? { authenticated: true, user: { email: session.email, role: 'Admin' } } : { authenticated: false })
    return true
  }

  if (method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' }, { Allow: path.endsWith('/session') ? 'GET' : 'POST' })
    return true
  }
  if (!sameOrigin(req)) {
    json(res, 403, { error: 'Request origin could not be verified.' })
    return true
  }
  if (path === '/api/auth/sign-out') {
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) })
    return true
  }

  const ip = req.socket?.remoteAddress || 'unknown'
  const limit = rateLimit(ip)
  if (limit.limited) {
    json(res, 429, { error: 'Too many sign-in attempts. Try again in a few minutes.' }, { 'Retry-After': String(limit.retrySeconds) })
    return true
  }

  const settings = config()
  if (!settings.email || !settings.passwordHash || settings.sessionSecret.length < 32) {
    json(res, 503, { error: 'Admin sign in is not configured on this server.' })
    return true
  }

  let credentials
  try { credentials = await readBody(req) } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : 'Invalid request.' })
    return true
  }
  const email = typeof credentials.email === 'string' ? credentials.email.trim().toLowerCase() : ''
  const password = typeof credentials.password === 'string' ? credentials.password : ''
  let passwordOk = false
  try { passwordOk = passwordMatches(password, settings.passwordHash) } catch { /* Keep invalid secrets indistinguishable to clients. */ }
  const emailOk = email === settings.email
  if (!emailOk || !passwordOk) {
    recordFailure(ip)
    json(res, 401, { error: 'Email or password is incorrect.' })
    return true
  }

  attempts.delete(ip)
  json(res, 200, { authenticated: true, user: { email: settings.email, role: 'Admin' } }, { 'Set-Cookie': sessionCookie(req, issueToken(settings.email, settings.sessionSecret)) })
  return true
}

export function adminAuthMiddleware() {
  return (req, res, next) => {
    handleAdminAuth(req, res).then(handled => { if (!handled) next() }).catch(() => json(res, 500, { error: 'Unable to complete the admin request.' }))
  }
}
