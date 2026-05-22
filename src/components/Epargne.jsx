/**
 * @file Epargne.jsx
 * @description Suivi des comptes épargne et d'investissement (PEA, Livret A, AV…).
 *
 * Fonctionnalités :
 *  - Import de relevés PEA Crédit Agricole (format PDF Compart Docponent)
 *  - Saisie manuelle de tout type de compte épargne
 *  - KPIs : patrimoine total, plus-value latente, performance PEA
 *  - Graphe d'évolution du patrimoine dans le temps
 *  - Détail par compte : titres en portefeuille, historique des relevés
 */

import { useState, useRef, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { extractPeaText, parsePEA } from '../utils/parsers/index.js'
import { C, S, fmt } from '../theme.js'

// ─── Composant Épargne ────────────────────────────────────────────────────────

// Types de comptes épargne disponibles pour la saisie manuelle
const COMPTE_TYPES = [
  { id: 'Livret A',          icon: '💰', label: 'Livret A' },
  { id: 'LEP',               icon: '💰', label: 'LEP' },
  { id: 'LDDS',              icon: '💰', label: 'LDDS' },
  { id: 'PEA',               icon: '📈', label: 'PEA' },
  { id: 'Épargne salariale', icon: '👔', label: 'Épargne salariale' },
  { id: 'Assurance vie',     icon: '🛡️', label: 'Assurance vie' },
  { id: 'Compte courant',    icon: '🏦', label: 'Compte courant' },
  { id: 'Autre',             icon: '📦', label: 'Autre' },
]
const compteIcon = (type) => COMPTE_TYPES.find(t => t.id === type)?.icon || '🏦'

function Epargne({ comptes, transactions, onSaveComptes }) {
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState(null)
  const [selCompte, setSelCompte] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // { compteId, type: 'releve'|'compte' }

  // Formulaire saisie manuelle (nouveau compte ou mise à jour de solde)
  const FORM_EMPTY = { type: 'Livret A', nom: '', solde: '', date: new Date().toISOString().slice(0, 10), compteId: null }
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualForm, setManualForm]         = useState(FORM_EMPTY)
  const setMF = (k, v) => setManualForm(f => ({ ...f, [k]: v }))

  // Ouvre le formulaire pour mettre à jour le solde d'un compte existant
  const openUpdateForm = (e, compte) => {
    e.stopPropagation()
    setManualForm({ type: compte.type, nom: compte.nom, solde: '', date: new Date().toISOString().slice(0, 10), compteId: compte.id })
    setShowManualForm(true)
  }

  // Sauvegarde : nouveau compte OU nouveau snapshot sur compte existant
  const saveManual = () => {
    const solde = parseFloat(String(manualForm.solde).replace(',', '.'))
    // Nom requis uniquement pour un nouveau compte (pas lors d'une mise à jour de solde)
    if (!manualForm.compteId && !manualForm.nom.trim()) return
    if (isNaN(solde) || solde < 0 || !manualForm.date) return

    const snapshot = {
      dateReleve:         manualForm.date,
      valorisationTotale: solde,
      valorisationTitres: solde,
      soldeEspeces:       0,
      versements:         0,
      retraits:           0,
      titres:             [],
      source:             'manuel'
    }

    let newComptes
    if (manualForm.compteId) {
      // Mise à jour d'un compte existant : on remplace le snapshot si même date, sinon on ajoute
      newComptes = comptes.map(c => {
        if (c.id !== manualForm.compteId) return c
        const histo = c.historique.filter(h => h.dateReleve !== snapshot.dateReleve)
        return { ...c, historique: [...histo, snapshot].sort((a, b) => a.dateReleve.localeCompare(b.dateReleve)) }
      })
    } else {
      // Nouveau compte
      const compteId = `manual_${manualForm.type.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
      newComptes = [...comptes, {
        id:         compteId,
        type:       manualForm.type,
        nom:        manualForm.nom.trim(),
        compte:     '',
        manuel:     true,
        historique: [snapshot]
      }]
    }
    onSaveComptes(newComptes)
    setManualForm(FORM_EMPTY)
    setShowManualForm(false)
  }

  // Import PDF PEA
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportErr(null)
    try {
      const text   = await extractPeaText(file)
      const parsed = parsePEA(text)
      if (!parsed) { setImportErr("Format non reconnu. Seuls les relevés PEA Crédit Agricole sont supportés pour l'instant."); return }

      const compteId = `${parsed.type.toLowerCase()}_${parsed.compte || Date.now()}`
      const snapshot = {
        dateReleve:         parsed.dateReleve,
        versements:         parsed.versements,
        retraits:           parsed.retraits,
        titres:             parsed.titres,
        valorisationTitres: parsed.valorisationTitres,
        soldeEspeces:       parsed.soldeEspeces,
        valorisationTotale: parsed.valorisationTotale,
        source:             file.name
      }
      const existing = comptes.find(c => c.id === compteId)
      let newComptes
      if (existing) {
        const histo = existing.historique.filter(h => h.dateReleve !== snapshot.dateReleve)
        newComptes = comptes.map(c => c.id === compteId
          ? { ...c, historique: [...histo, snapshot].sort((a, b) => a.dateReleve.localeCompare(b.dateReleve)) }
          : c)
      } else {
        newComptes = [...comptes, {
          id: compteId, type: parsed.type,
          nom: parsed.type + (parsed.compte ? ` ···${parsed.compte.slice(-4)}` : ''),
          compte: parsed.compte, manuel: false, historique: [snapshot]
        }]
      }
      onSaveComptes(newComptes)
    } catch (err) {
      setImportErr(`Erreur : ${err.message}`)
    } finally {
      setImporting(false); e.target.value = ''
    }
  }

  const patrimoineTotal = comptes.reduce((s, c) => s + (c.historique.at(-1)?.valorisationTotale || 0), 0)

  const evolutionData = useMemo(() => {
    const byDate = {}
    comptes.forEach(c => c.historique.forEach(h => {
      byDate[h.dateReleve] = (byDate[h.dateReleve] || 0) + h.valorisationTotale
    }))
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({
        name: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        val:  Math.round(val * 100) / 100
      }))
  }, [comptes])

  const fmt  = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const fmtD = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('fr-FR') : '—'

  // Plus-value uniquement pour les comptes avec données versements (imports PDF)
  const versementsTotaux = comptes.reduce((s, c) => s + (c.historique.at(-1)?.versements || 0) - (c.historique.at(-1)?.retraits || 0), 0)
  const plusValue  = versementsTotaux > 0 ? patrimoineTotal - versementsTotaux : null
  const perfPct    = plusValue !== null && versementsTotaux > 0 ? (plusValue / versementsTotaux * 100).toFixed(1) : null

  // Validation formulaire manuel — centralisée pour disabled ET saveManual
  const manualSoldeNum  = parseFloat(String(manualForm.solde).replace(',', '.'))
  const manualSoldeOk   = !isNaN(manualSoldeNum) && manualSoldeNum >= 0 && manualForm.solde !== ''
  const manualNomOk     = !!manualForm.compteId || manualForm.nom.trim().length > 0
  const manualFormValid = manualNomOk && manualSoldeOk && !!manualForm.date

  const INPUT = { background: '#0a0a14', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 2.5rem' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>🏦 Épargne & Investissement</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Suivi de tes comptes épargne et portefeuilles titres</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setManualForm(FORM_EMPTY); setShowManualForm(true) }} style={S.ghost}>
            + Saisie manuelle
          </button>
          <label style={{ ...S.btn, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {importing ? '⏳ Import…' : '📄 Importer relevé PEA'}
            <input type="file" accept=".pdf" onChange={handleFile} style={{ display: 'none' }} disabled={importing} />
          </label>
        </div>
      </div>

      {/* Formulaire saisie manuelle */}
      {showManualForm && (
        <div style={{ background: C.card, border: `1px solid ${C.gold}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 16 }}>
            {manualForm.compteId ? 'Mettre à jour le solde' : 'Ajouter un compte'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {!manualForm.compteId && (
              <>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Type de compte</div>
                  <select value={manualForm.type}
                    onChange={e => setMF('type', e.target.value)}
                    style={{ ...INPUT }}>
                    {COMPTE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Nom du compte</div>
                  <input value={manualForm.nom} onChange={e => setMF('nom', e.target.value)}
                    placeholder={`Ex : Mon ${manualForm.type}`}
                    style={{ ...INPUT }} />
                </div>
              </>
            )}
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Solde (€)</div>
              <input value={manualForm.solde} onChange={e => setMF('solde', e.target.value)}
                placeholder="Ex : 10000" inputMode="decimal"
                style={{ ...INPUT, borderColor: manualForm.solde && !manualSoldeOk ? C.danger : C.border }} />
              {manualForm.solde && !manualSoldeOk && (
                <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>Montant invalide (ex : 10000 ou 10000,50)</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Date du relevé</div>
              <input type="date" value={manualForm.date} onChange={e => setMF('date', e.target.value)}
                style={{ ...INPUT }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveManual}
              disabled={!manualFormValid}
              style={{ ...S.btn, opacity: manualFormValid ? 1 : 0.4 }}>
              {manualForm.compteId ? 'Enregistrer le solde' : 'Ajouter le compte'}
            </button>
            <button onClick={() => { setShowManualForm(false); setManualForm(FORM_EMPTY) }} style={S.ghost}>Annuler</button>
          </div>
        </div>
      )}

      {importErr && (
        <div style={{ background: '#2a0808', border: `1px solid ${C.danger}`, borderRadius: 10, padding: '12px 16px', color: C.danger, marginBottom: 20, fontSize: 13 }}>
          {importErr}
        </div>
      )}

      {comptes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          <div style={{ fontSize: 16, marginBottom: 8, color: C.text }}>Aucun compte épargne</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Saisis manuellement tes comptes (LEP, Livret A, épargne salariale…) ou importe un relevé PEA PDF</div>
          <button onClick={() => { setManualForm(FORM_EMPTY); setShowManualForm(true) }} style={S.btn}>+ Ajouter un compte</button>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plusValue !== null ? 3 : 2}, 1fr)`, gap: 16, marginBottom: 28 }}>
            {[
              { label: 'Patrimoine total', value: fmt(patrimoineTotal), color: C.gold },
              ...(plusValue !== null ? [
                { label: 'Plus-value latente', value: plusValue >= 0 ? `+${fmt(plusValue)}` : fmt(plusValue), color: plusValue >= 0 ? C.green : C.danger },
                { label: 'Performance PEA', value: perfPct !== null ? `${plusValue >= 0 ? '+' : ''}${perfPct}%` : '—', color: plusValue >= 0 ? C.green : C.danger }
              ] : [
                { label: 'Comptes', value: `${comptes.length}`, color: C.muted }
              ])
            ].map(k => (
              <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 600, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Évolution */}
          {evolutionData.length >= 2 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 16 }}>Évolution du patrimoine</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k€`} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                  <Line type="monotone" dataKey="val" stroke={C.gold} strokeWidth={2} dot={{ fill: C.gold, r: 4 }} name="Patrimoine" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Comptes */}
          <div style={{ display: 'grid', gap: 16 }}>
            {comptes.map(compte => {
              const last = compte.historique.at(-1)
              if (!last) return null
              const pvCpte   = last.valorisationTotale - (last.versements - last.retraits)
              const perfCpte = (last.versements - last.retraits) > 0 ? (pvCpte / (last.versements - last.retraits) * 100).toFixed(1) : null
              const isOpen   = selCompte === compte.id

              return (
                <div key={compte.id} style={{ background: C.card, border: `1px solid ${isOpen ? C.gold : C.border}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setSelCompte(isOpen ? null : compte.id)}>
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a1a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                      {compteIcon(compte.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{compte.nom}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>Relevé au {fmtD(last.dateReleve)} · {compte.historique.length} relevé{compte.historique.length > 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: C.gold }}>{fmt(last.valorisationTotale)}</div>
                      {perfCpte !== null && (
                        <div style={{ fontSize: 12, color: pvCpte >= 0 ? C.green : C.danger }}>{pvCpte >= 0 ? '+' : ''}{fmt(pvCpte)} ({pvCpte >= 0 ? '+' : ''}{perfCpte}%)</div>
                      )}
                    </div>
                    <div style={{ color: C.muted, fontSize: 18, marginLeft: 8 }}>{isOpen ? '▲' : '▼'}</div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 20px' }}>
                      {/* Métriques */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                        {[
                          { l: 'Versements', v: fmt(last.versements) },
                          { l: 'Retraits', v: fmt(last.retraits) },
                          { l: 'Valorisation titres', v: fmt(last.valorisationTitres) },
                          { l: 'Espèces PEA', v: fmt(last.soldeEspeces) }
                        ].map(m => (
                          <div key={m.l} style={{ background: '#0a0a14', borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 11, color: C.muted }}>{m.l}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 2 }}>{m.v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Titres en portefeuille */}
                      {last.titres.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Titres en portefeuille</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {last.titres.map((t, i) => {
                              const pvTitre = t.valorisation - t.prixRevient
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#0a0a14', borderRadius: 10, padding: '12px 16px' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{t.designation}</div>
                                    <div style={{ fontSize: 11, color: C.muted }}>{t.isin} · {t.quantite.toLocaleString('fr-FR')} parts · cours {t.cours.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{fmt(t.valorisation)}</div>
                                    <div style={{ fontSize: 11, color: pvTitre >= 0 ? C.green : C.danger }}>{pvTitre >= 0 ? '+' : ''}{fmt(pvTitre)}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Historique des relevés */}
                      {compte.historique.length > 1 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Historique</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[...compte.historique].reverse().map((h, i) => (
                              <div key={i} style={{ background: '#0a0a14', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                                <div style={{ color: C.muted }}>{fmtD(h.dateReleve)}</div>
                                <div style={{ color: C.text, fontWeight: 500 }}>{fmt(h.valorisationTotale)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        {/* Mettre à jour le solde (tous types de comptes) */}
                        <button onClick={e => openUpdateForm(e, compte)}
                          style={{ ...S.ghost, fontSize: 12 }}>
                          ↻ Nouveau solde
                        </button>
                        {/* Supprimer le dernier relevé */}
                        {pendingDelete?.compteId === compte.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: C.warn }}>Confirmer ?</span>
                            <button onClick={(e) => {
                              e.stopPropagation()
                              const newHisto = compte.historique.slice(0, -1)
                              if (!newHisto.length) { onSaveComptes(comptes.filter(c => c.id !== compte.id)); setSelCompte(null) }
                              else { onSaveComptes(comptes.map(c => c.id === compte.id ? { ...c, historique: newHisto } : c)) }
                              setPendingDelete(null)
                            }} style={{ ...S.ghost, fontSize: 11, color: C.danger, borderColor: C.danger, padding: '3px 8px' }}>Oui</button>
                            <button onClick={(e) => { e.stopPropagation(); setPendingDelete(null) }} style={{ ...S.ghost, fontSize: 11, padding: '3px 8px' }}>Non</button>
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setPendingDelete({ compteId: compte.id }) }}
                            style={{ ...S.ghost, fontSize: 12, color: C.danger, borderColor: C.danger }}>
                            🗑 Dernier relevé
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Composant Partage ────────────────────────────────────────────────────────

export default Epargne
