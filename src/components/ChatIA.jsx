/**
 * @file ChatIA.jsx
 * @description Panneau de discussion avec le Conseiller IA (streaming SSE vers l'API IA).
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { C, S } from '../theme.js'

function ChatIA({ transactions, profile, journal, apiKey, onSetApiKey }) {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const endRef = useRef()

  const systemPrompt = useMemo(() => buildContext(transactions, profile, journal), [transactions, profile, journal])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    if (!text?.trim() || loading) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput(''); setLoading(true)
    try {
      await callClaudeStream(apiKey, systemPrompt, next, (chunk) => {
        setMessages(m => {
          const last = m[m.length - 1]
          // Guard : content peut être undefined si le message assistant vient d'être créé
          return [...m.slice(0, -1), { ...last, content: (last.content || '') + chunk }]
        })
      })
    } catch (e) {
      setMessages(m => {
        const last = m[m.length - 1]
        return [...m.slice(0, -1), { ...last, content: `❌ ${e.message}` }]
      })
    }
    setLoading(false)
  }

  const QUICK = ['Résume ma situation financière', 'Comment optimiser mes abonnements ?', 'Quel est mon plus grand poste de dépense ?']

  return (
    <div style={{ marginTop: 20 }}>
      {/* Barre de titre cliquable */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ ...S.card, padding: '0.85rem 1.1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: open ? 'rgba(201,169,110,0.4)' : C.border }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💬</span>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Approfondir avec l'IA</span>
          {apiKey && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, display: 'inline-block' }} />}
          {!apiKey && <span style={{ fontSize: 11, color: C.muted }}>· Optionnel · Clé API Anthropic requise</span>}
        </div>
        <span style={{ color: C.muted, fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ ...S.card, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '1.25rem' }}>
          {!apiKey ? (
            /* Saisie clé */
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
                Ta clé est stockée uniquement dans ton navigateur (localStorage). Elle n'est jamais transmise à nos serveurs.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)}
                  placeholder="sk-ant-api03-…" style={{ ...S.input, flex: 1, fontSize: 13, padding: '8px 12px' }}
                  onKeyDown={e => e.key === 'Enter' && keyInput.startsWith('sk-') && onSetApiKey(keyInput)}
                />
                <button
                  onClick={() => keyInput.startsWith('sk-') && onSetApiKey(keyInput)}
                  disabled={!keyInput.startsWith('sk-')}
                  style={{ ...S.btn, padding: '8px 16px', opacity: keyInput.startsWith('sk-') ? 1 : 0.4, fontSize: 13 }}
                >Connecter</button>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
                Obtenir une clé :&nbsp;
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>console.anthropic.com</a>
              </div>
            </div>
          ) : (
            /* Interface chat */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {messages.length === 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {QUICK.map(q => (
                      <button key={q} onClick={() => send(q)}
                        style={{ ...S.ghost, fontSize: 11, padding: '5px 10px', color: C.text }}>{q}</button>
                    ))}
                  </div>
                )}
                {messages.length > 0 && <div />}
                <button onClick={() => { setMessages([]); onSetApiKey(null) }}
                  style={{ ...S.ghost, fontSize: 11, padding: '4px 8px', color: C.danger, borderColor: 'rgba(224,85,85,0.3)', flexShrink: 0, marginLeft: 'auto' }}>
                  Déconnecter
                </button>
              </div>

              {/* Messages */}
              <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 10 }}>
                {messages.map((msg, i) => {
                  const isStreaming = loading && i === messages.length - 1 && msg.role === 'assistant'
                  return (
                    <div key={i} style={{ marginBottom: 8, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '85%', padding: '0.65rem 1rem', fontSize: 12, lineHeight: 1.65,
                        borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                        background: msg.role === 'user' ? C.gold : '#0a0a16',
                        color: msg.role === 'user' ? '#080814' : C.text,
                        border: msg.role === 'assistant' ? `1px solid ${C.border}` : 'none'
                      }}>
                        {msg.role === 'user'
                          ? msg.content
                          : msg.content
                            ? <><MdText text={msg.content} />{isStreaming && <span style={{ display: 'inline-block', width: 7, height: 12, background: C.gold, borderRadius: 1, marginLeft: 2, animation: 'none', opacity: 0.8 }}>▌</span>}</>
                            : <span style={{ color: C.muted }}>⏳</span>
                        }
                      </div>
                    </div>
                  )
                })}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                  placeholder="Pose ta question…" style={{ ...S.input, flex: 1, fontSize: 13, padding: '8px 12px' }}
                  disabled={loading} />
                <button onClick={() => send(input)} disabled={!input.trim() || loading}
                  style={{ ...S.btn, padding: '8px 14px', opacity: input.trim() && !loading ? 1 : 0.4, fontSize: 13 }}>→</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ANALYSE LOCALE ───────────────────────────────────────────────────────────

export default ChatIA
