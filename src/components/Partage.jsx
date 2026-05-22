/**
 * @file Partage.jsx
 * @description Mode "couple" : gestion des dépenses partagées et des remboursements.
 *
 * Fonctionnalités :
 *  - Ajout de membres du foyer
 *  - Saisie de dépenses partagées avec répartition personnalisée
 *  - Calcul automatique des settlements (qui doit quoi à qui)
 *  - Historique des remboursements
 */

import { useState, useMemo } from 'react'
import { computeStats } from '../utils/parser.js'
import { C, S, fmt, fmtD, fmtMonth } from '../theme.js'

function Partage({ partage, onSavePartage, showToast }) {
  const membres     = partage.membres   || []
  const depenses    = partage.depenses  || []
  const settlements = partage.settlements || []

  const [subTab, setSubTab]   = useState('solde')
  const [showForm, setShowForm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // { id, type: 'depense'|'membre' }

  // Formulaire nouvelle dépense
  const [form, setForm] = useState({ label: '', montant: '', date: new Date().toISOString().slice(0, 10), payeurId: '', parts: {} })

  // Formulaire nouveau membre
  const [newMembre, setNewMembre]   = useState('')
  const COLORS = ['#f0a030', '#8577e8', '#28b888', '#e06030', '#2878d4']

  const fmt  = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
  const fmtD = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('fr-FR') : '—'

  // Calcul des soldes : pour chaque paire (A, B), combien A doit à B
  const soldes = useMemo(() => {
    // balance[membreId] = ce que ce membre a payé - sa part consommée
    const balance = {}
    membres.forEach(m => { balance[m.id] = 0 })

    depenses.forEach(dep => {
      const total = parseFloat(dep.montant) || 0
      // Payeur a avancé "total"
      if (balance[dep.payeurId] !== undefined) balance[dep.payeurId] += total
      // Chaque membre consomme sa part
      Object.entries(dep.parts || {}).forEach(([id, pct]) => {
        if (balance[id] !== undefined) balance[id] -= total * pct / 100
      })
    })

    // Settlements déjà réalisés
    settlements.forEach(s => {
      if (balance[s.deId] !== undefined) balance[s.deId]  += parseFloat(s.montant) || 0
      if (balance[s.aId]  !== undefined) balance[s.aId]   -= parseFloat(s.montant) || 0
    })

    return balance
  }, [membres, depenses, settlements])

  // Dettes simplifiées : qui doit quoi à qui
  const dettes = useMemo(() => {
    const pos = membres.filter(m => soldes[m.id] > 0.01).sort((a, b) => soldes[b.id] - soldes[a.id])
    const neg = membres.filter(m => soldes[m.id] < -0.01).sort((a, b) => soldes[a.id] - soldes[b.id])
    const result = []
    const balCopy = { ...soldes }

    // Algorithme glouton de simplification des dettes
    let i = 0, j = 0
    while (i < pos.length && j < neg.length) {
      const creditor = pos[i], debtor = neg[j]
      const amount   = Math.min(balCopy[creditor.id], -balCopy[debtor.id])
      if (amount > 0.01) result.push({ from: debtor, to: creditor, amount: Math.round(amount * 100) / 100 })
      balCopy[creditor.id] -= amount
      balCopy[debtor.id]   += amount
      if (Math.abs(balCopy[creditor.id]) < 0.01) i++
      if (Math.abs(balCopy[debtor.id])   < 0.01) j++
    }
    return result
  }, [membres, soldes])

  // Initialiser les parts égales quand le payeur change ou membres change
  const initParts = (payeurId) => {
    if (!membres.length) return {}
    const pct = Math.round(100 / membres.length)
    const parts = {}
    membres.forEach((m, i) => { parts[m.id] = i < membres.length - 1 ? pct : 100 - pct * (membres.length - 1) })
    return parts
  }

  const addMembre = () => {
    const nom = newMembre.trim()
    if (!nom) return
    const m = { id: Date.now().toString(), nom, color: COLORS[membres.length % COLORS.length] }
    const newPartage = { ...partage, membres: [...membres, m] }
    onSavePartage(newPartage)
    setNewMembre('')
  }

  const addDepense = () => {
    const montant = parseFloat(form.montant.replace(',', '.'))
    if (!form.label.trim() || !montant || !form.payeurId) return
    const sumParts = Object.values(form.parts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    if (Math.abs(sumParts - 100) > 0.5) { showToast?.('La somme des parts doit être égale à 100%', 'warn'); return }

    const dep = { id: Date.now().toString(), label: form.label.trim(), montant, date: form.date, payeurId: form.payeurId, parts: form.parts }
    onSavePartage({ ...partage, depenses: [dep, ...depenses] })
    setForm({ label: '', montant: '', date: new Date().toISOString().slice(0, 10), payeurId: form.payeurId, parts: initParts(form.payeurId) })
    setShowForm(false)
  }

  const addSettlement = (from, to, amount) => {
    const s = { id: Date.now().toString(), date: new Date().toISOString().slice(0, 10), deId: from.id, aId: to.id, montant: amount }
    onSavePartage({ ...partage, settlements: [...settlements, s] })
  }

  const deleteDepense = (id) => {
    onSavePartage({ ...partage, depenses: depenses.filter(d => d.id !== id) })
  }

  const SUB = [
    { id: 'solde',    label: 'Solde' },
    { id: 'depenses', label: 'Dépenses' },
    { id: 'membres',  label: 'Membres' }
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>🤝 Dépenses partagées</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{membres.length} membre{membres.length !== 1 ? 's' : ''} · {depenses.length} dépense{depenses.length !== 1 ? 's' : ''}</div>
        </div>
        {subTab === 'depenses' && membres.length >= 2 && (
          <button onClick={() => { setShowForm(true); setForm(f => ({ ...f, payeurId: membres[0]?.id || '', parts: initParts(membres[0]?.id) })) }} style={S.btn}>+ Dépense</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
        {SUB.map(s => (
          <button key={s.id} onClick={() => setSubTab(s.id)} style={{
            background: 'none', border: 'none', padding: '10px 20px', cursor: 'pointer',
            color: subTab === s.id ? C.text : C.muted, fontFamily: 'inherit', fontSize: 13,
            fontWeight: subTab === s.id ? 500 : 400,
            borderBottom: `2px solid ${subTab === s.id ? C.gold : 'transparent'}`,
            marginBottom: -1, transition: 'all 0.15s'
          }}>{s.label}</button>
        ))}
      </div>

      {membres.length === 0 && subTab !== 'membres' && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 6 }}>Commence par ajouter des membres</div>
          <div style={{ fontSize: 13 }}>Va dans l'onglet Membres pour configurer ton groupe</div>
          <button onClick={() => setSubTab('membres')} style={{ ...S.btn, marginTop: 16 }}>Gérer les membres</button>
        </div>
      )}

      {/* ── Solde ─────────────────────────────────────────────────────── */}
      {subTab === 'solde' && membres.length > 0 && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Balances individuelles */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(membres.length, 3)}, 1fr)`, gap: 12 }}>
            {membres.map(m => {
              const bal = soldes[m.id] || 0
              return (
                <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>{m.nom[0]}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.nom}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: bal > 0.01 ? C.green : bal < -0.01 ? C.danger : C.muted }}>
                    {bal > 0.01 ? '+' : ''}{fmt(bal)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {bal > 0.01 ? 'doit recevoir' : bal < -0.01 ? 'doit payer' : 'soldé ✓'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dettes simplifiées */}
          {dettes.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 16 }}>À régler</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {dettes.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: '#0a0a14', borderRadius: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: d.from.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{d.from.nom[0]}</div>
                    <div style={{ flex: 1, fontSize: 13, color: C.text }}>
                      <span style={{ fontWeight: 500 }}>{d.from.nom}</span> doit <span style={{ fontWeight: 500 }}>{fmt(d.amount)}</span> à <span style={{ fontWeight: 500 }}>{d.to.nom}</span>
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: d.to.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{d.to.nom[0]}</div>
                    <button onClick={() => addSettlement(d.from, d.to, d.amount)} style={{ ...S.ghost, fontSize: 11, padding: '5px 10px', color: C.green, borderColor: C.green }}>✓ Réglé</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dettes.length === 0 && depenses.length > 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.green, fontSize: 15 }}>✓ Tout est soldé — personne ne doit rien à personne !</div>
          )}
        </div>
      )}

      {/* ── Dépenses ──────────────────────────────────────────────────── */}
      {subTab === 'depenses' && membres.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Formulaire ajout */}
          {showForm && (
            <div style={{ background: C.card, border: `1px solid ${C.gold}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 16 }}>Nouvelle dépense</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Libellé</div>
                  <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Ex : Courses Leclerc" style={{ width: '100%', background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Montant (€)</div>
                  <input value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))}
                    placeholder="0,00" style={{ width: '100%', background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Date</div>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Payé par</div>
                  <select value={form.payeurId} onChange={e => setForm(f => ({ ...f, payeurId: e.target.value, parts: initParts(e.target.value) }))}
                    style={{ width: '100%', background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }}>
                    <option value="">— Sélectionner —</option>
                    {membres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                </div>
              </div>
              {/* Parts */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Répartition (%)</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(membres.length, 4)}, 1fr)`, gap: 8 }}>
                  {membres.map(m => (
                    <div key={m.id} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{m.nom}</div>
                      <input type="number" min="0" max="100" value={form.parts[m.id] ?? ''} onChange={e => setForm(f => ({ ...f, parts: { ...f.parts, [m.id]: parseFloat(e.target.value) || 0 } }))}
                        style={{ width: '100%', background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', color: C.text, fontFamily: 'inherit', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Total : <span style={{ color: Math.abs(Object.values(form.parts).reduce((s, v) => s + (parseFloat(v) || 0), 0) - 100) < 0.5 ? C.green : C.danger }}>
                    {Object.values(form.parts).reduce((s, v) => s + (parseFloat(v) || 0), 0)}%
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addDepense} style={S.btn}>Ajouter</button>
                <button onClick={() => setShowForm(false)} style={S.ghost}>Annuler</button>
              </div>
            </div>
          )}

          {depenses.length === 0 && !showForm && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 13 }}>Aucune dépense enregistrée. Clique sur "+ Dépense" pour commencer.</div>
            </div>
          )}

          {depenses.map(dep => {
            const payeur = membres.find(m => m.id === dep.payeurId)
            return (
              <div key={dep.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: payeur?.color || C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {payeur?.nom?.[0] || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{dep.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fmtD(dep.date)} · Payé par {payeur?.nom || '?'} · {Object.entries(dep.parts || {}).map(([id, pct]) => {
                      const m = membres.find(x => x.id === id)
                      return m ? `${m.nom} ${pct}%` : null
                    }).filter(Boolean).join(' / ')}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.gold }}>{fmt(parseFloat(dep.montant) || 0)}</div>
                {pendingDelete?.id === dep.id ? (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { deleteDepense(dep.id); setPendingDelete(null) }} style={{ ...S.ghost, fontSize: 11, color: C.danger, borderColor: C.danger, padding: '2px 6px' }}>Oui</button>
                    <button onClick={() => setPendingDelete(null)} style={{ ...S.ghost, fontSize: 11, padding: '2px 6px' }}>Non</button>
                  </span>
                ) : (
                  <button onClick={() => setPendingDelete({ id: dep.id, type: 'depense' })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: '4px 6px' }}>✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Membres ───────────────────────────────────────────────────── */}
      {subTab === 'membres' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 16 }}>Ajouter un membre</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newMembre} onChange={e => setNewMembre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMembre()}
                placeholder="Prénom ou pseudo" style={{ flex: 1, background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontFamily: 'inherit', fontSize: 13 }} />
              <button onClick={addMembre} style={S.btn}>Ajouter</button>
            </div>
          </div>

          {membres.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucun membre. Ajoute-toi ainsi que les personnes avec qui tu partages des dépenses.</div>
          )}

          {membres.map((m, idx) => (
            <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff' }}>{m.nom[0]}</div>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: C.text }}>{m.nom}</div>
              {pendingDelete?.id === m.id ? (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.warn }}>Supprimer {m.nom} ?</span>
                  <button onClick={() => { onSavePartage({ ...partage, membres: membres.filter(x => x.id !== m.id) }); setPendingDelete(null) }} style={{ ...S.ghost, fontSize: 11, color: C.danger, borderColor: C.danger, padding: '2px 6px' }}>Oui</button>
                  <button onClick={() => setPendingDelete(null)} style={{ ...S.ghost, fontSize: 11, padding: '2px 6px' }}>Non</button>
                </span>
              ) : (
                <button onClick={() => setPendingDelete({ id: m.id, type: 'membre' })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: '4px 8px' }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Partage
