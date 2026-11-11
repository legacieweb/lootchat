/**
 * Typed boundary for the platform API. Provider credentials belong on the server;
 * the browser only talks to our own /api routes.
 */
export type Tier = 'basic' | 'premium' | 'gold'
export type AccountKind = 'learner' | 'local'

export type Subscription = {
  tier: Tier
  accountKind: AccountKind
  callCredits: number
  renewsAt: string | null
}

export type ConversationMessage = {
  id: string
  conversationId: string
  senderId: string
  body: string
  sentAt: string
  mediaUrl?: string
}

export type CallSession = {
  id: string
  kind: 'audio' | 'video'
  participantId: string
  creditsPerMinute: number
}

export type CheckoutSession = {
  checkoutUrl: string
  subscriptionId: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const platform = {
  auth: {
    signIn: (email: string, password: string) => request<{ userId: string }>('/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) }),
    signUp: (input: { email: string; password: string; accountKind: AccountKind }) => request<{ userId: string }>('/auth/sign-up', { method: 'POST', body: JSON.stringify(input) }),
    signOut: () => request<{ ok: true }>('/auth/sign-out', { method: 'POST' }),
  },
  messages: {
    list: (conversationId: string) => request<ConversationMessage[]>(`/conversations/${encodeURIComponent(conversationId)}/messages`),
    send: (conversationId: string, body: string) => request<ConversationMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  },
  billing: {
    subscription: () => request<Subscription>('/billing/subscription'),
    checkout: (tier: Tier, accountKind: AccountKind) => request<CheckoutSession>('/billing/checkout', { method: 'POST', body: JSON.stringify({ tier, accountKind }) }),
  },
  calls: {
    start: (participantId: string, kind: CallSession['kind']) => request<CallSession>('/calls', { method: 'POST', body: JSON.stringify({ participantId, kind }) }),
    end: (sessionId: string) => request<{ creditsCharged: number; remainingCredits: number }>(`/calls/${encodeURIComponent(sessionId)}/end`, { method: 'POST' }),
  },
} as const
