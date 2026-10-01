import { useState } from 'react'
import type { GreenApi } from './lib/green-api'
import type { InstanceSettings } from './types'
import Login from './components/Login'
import ChatWorkspace from './components/ChatWorkspace'
import Help from './components/Help'

interface Session { api: GreenApi | null; settings: InstanceSettings | null }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [help, setHelp] = useState(false)
  return <>
    {session ? <ChatWorkspace api={session.api} settings={session.settings} onLogout={() => setSession(null)} onHelp={() => setHelp(true)} />
      : <Login onConnect={(api, settings) => setSession({ api, settings })} onDemo={() => setSession({ api: null, settings: null })} onHelp={() => setHelp(true)} />}
    {help && <Help onClose={() => setHelp(false)} />}
  </>
}
