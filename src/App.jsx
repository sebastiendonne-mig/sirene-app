import { useState, useRef, useEffect } from 'react'
import './App.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

const TRANCHES = {
  '00': '0 salarié',
  '01': '1 à 2', '02': '3 à 5', '03': '6 à 9',
  '11': '10 à 19', '12': '20 à 49', '21': '50 à 99',
  '22': '100 à 199', '31': '200 à 249', '32': '250 à 499',
  '41': '500 à 999', '42': '1 000 à 1 999',
  '51': '2 000 à 4 999', '52': '5 000 et plus',
}

const NAF_LABELS = {
  '01.11Z': 'Culture de céréales', '01.13Z': 'Culture de légumes', '01.21Z': 'Viticulture',
  '01.41Z': 'Élevage laitier', '01.47Z': 'Élevage de volailles',
  '41.10A': 'Promotion immobilière de logements', '41.10B': "Promotion immobilière d'autres bâtiments",
  '41.20A': 'Construction de maisons individuelles', '41.20B': 'Construction de bâtiments',
  '43.21A': 'Travaux électriques', '43.22A': 'Plomberie et gaz',
  '43.22B': 'Chauffage et climatisation', '43.31Z': 'Plâtrerie',
  '43.32A': 'Menuiserie bois et PVC', '43.32B': 'Menuiserie métallique et serrurerie',
  '43.34Z': 'Peinture et vitrerie', '43.39Z': 'Travaux de finition',
  '43.91A': 'Charpente bois', '43.91B': 'Couverture', '43.99C': 'Maçonnerie et gros œuvre',
  '45.11Z': 'Commerce de véhicules automobiles', '45.20A': 'Entretien et réparation auto',
  '45.32Z': "Commerce d'équipements automobiles",
  '46.73A': 'Commerce de gros de matériaux de construction', '46.74A': 'Commerce de gros de quincaillerie',
  '46.75Z': 'Commerce de gros de produits chimiques',
  '47.11B': 'Supermarchés', '47.11C': 'Hypermarchés',
  '47.22Z': 'Commerce de détail de viandes', '47.24Z': 'Commerce boulangerie-pâtisserie',
  '47.25Z': 'Commerce de boissons',
  '47.71Z': "Commerce d'habillement", '47.72A': 'Commerce de chaussures',
  '47.75Z': 'Parfumerie et produits de beauté', '47.91A': 'Vente à distance',
  '49.31Z': 'Transports urbains et suburbains', '49.32Z': 'Taxis',
  '49.39A': 'Transports routiers réguliers', '49.41A': 'Transport routier de fret',
  '49.41B': 'Transport routier de fret de proximité', '49.42Z': 'Déménagement',
  '52.10B': 'Entreposage et stockage',
  '55.10Z': 'Hôtels', '55.20Z': 'Hébergement touristique',
  '56.10A': 'Restauration traditionnelle', '56.10C': 'Restauration rapide',
  '56.21Z': 'Traiteur', '56.30Z': 'Débits de boissons',
  '62.01Z': 'Programmation informatique', '62.02A': 'Conseil en systèmes informatiques',
  '62.02B': 'Tierce maintenance de systèmes',
  '62.03Z': "Gestion d'installations informatiques", '62.09Z': 'Activités informatiques',
  '63.11Z': 'Hébergement et traitement de données', '63.12Z': 'Portails Internet',
  '64.19Z': 'Banque et intermédiation monétaire', '64.20Z': 'Activités des holdings',
  '64.91Z': 'Crédit-bail', '64.99Z': 'Activités financières',
  '65.11Z': 'Assurance vie', '65.12Z': 'Autres assurances', '65.20Z': 'Réassurance',
  '66.19A': 'Gestion de fonds', '66.22Z': "Courtage d'assurances",
  '68.10Z': 'Marchands de biens immobiliers', '68.20A': 'Location de logements',
  '68.20B': 'Location de biens immobiliers', '68.31Z': 'Agences immobilières',
  '68.32A': 'Gestion de copropriétés',
  '69.10Z': 'Activités juridiques', '69.20Z': 'Activités comptables',
  '70.10Z': 'Sièges sociaux', '70.22Z': 'Conseil en gestion',
  '71.11Z': 'Architecture', '71.12B': 'Ingénierie et études techniques',
  '73.11Z': 'Agences de publicité', '73.20Z': 'Études de marché',
  '74.10Z': 'Design', '74.20Z': 'Activités photographiques', '74.90B': 'Activités spécialisées diverses',
  '78.10Z': 'Agences de placement', '78.20Z': 'Travail temporaire',
  '78.30Z': 'Mise à disposition de ressources humaines',
  '80.10Z': 'Sécurité privée', '81.21Z': 'Nettoyage courant de bâtiments',
  '81.22Z': 'Autres nettoyages', '81.30Z': 'Services paysagers',
  '82.11Z': 'Services administratifs', '82.30Z': "Organisation d'événements",
  '85.10Z': 'Enseignement pré-primaire', '85.20Z': 'Enseignement primaire',
  '85.31Z': 'Enseignement secondaire général', '85.32Z': 'Enseignement secondaire professionnel',
  '85.41Z': 'Enseignement post-secondaire', '85.42Z': 'Enseignement supérieur',
  '85.51Z': 'Enseignement sportif et de loisirs', '85.52Z': 'Enseignement culturel',
  '85.59A': 'Formation continue', '85.59B': 'Autres enseignements', '85.60Z': "Soutien à l'enseignement",
  '86.10Z': 'Hôpital', '86.21Z': 'Médecine générale', '86.22A': 'Radiodiagnostic et radiothérapie',
  '86.22B': 'Chirurgie', '86.22C': 'Médecine spécialisée', '86.23Z': 'Dentisterie',
  '86.90A': 'Ambulances', '86.90B': 'Laboratoires médicaux',
  '86.90D': 'Soins infirmiers', '86.90E': 'Rééducation', '86.90F': 'Autres soins de santé',
  '87.10A': 'EHPAD', '87.10B': 'Hébergement pour enfants handicapés',
  '87.10C': 'Hébergement pour adultes handicapés',
  '87.20A': 'Hébergement pour handicapés mentaux', '87.30A': 'Hébergement pour personnes âgées',
  '87.30B': 'Hébergement pour handicapés physiques',
  '88.10A': 'Aide à domicile', '88.10B': "Accompagnement d'adultes handicapés",
  '88.10C': 'Aide par le travail', '88.91A': 'Accueil de jeunes enfants',
  '88.91B': "Accompagnement d'enfants handicapés",
  '88.99A': "Accompagnement d'enfants et adolescents", '88.99B': 'Action sociale sans hébergement',
  '90.01Z': 'Spectacle vivant', '90.02Z': 'Soutien au spectacle vivant',
  '90.03A': 'Arts plastiques', '90.03B': 'Autre création artistique',
  '93.11Z': "Gestion d'installations sportives", '93.12Z': 'Clubs de sports',
  '93.13Z': 'Centres de culture physique', '93.19Z': 'Autres activités sportives',
  '93.21Z': "Parcs d'attractions", '93.29Z': 'Activités récréatives et de loisirs',
  '96.02A': 'Coiffure', '96.02B': 'Soins de beauté',
  '96.03Z': 'Services funéraires', '96.04Z': 'Entretien corporel',
  '10.11Z': 'Boucherie-charcuterie', '10.71A': 'Boulangerie-pâtisserie', '16.23Z': 'Fabrication menuiserie',
  '20.30Z': 'Fabrication peintures', '43.33Z': 'Revêtements sols et murs',
}

const NJ_LABELS = {
  '1000': 'Entrepreneur individuel', '2110': 'Indivision', '5202': 'SNC', '5306': 'SCS', '5308': 'SCA',
  '5410': 'SARL', '5415': 'EURL', '5422': 'SARL', '5499': 'SARL',
  '5505': 'SA', '5510': 'SA', '5516': 'SA', '5599': 'SA',
  '5522': 'SAS', '5523': 'SASU', '5542': 'SAS', '5530': 'Société européenne (SE)',
  '5543': 'SCOP', '5546': 'SCIC', '5547': 'SAS coopérative',
  '5551': 'Société coopérative', '5552': 'Coopérative agricole',
  '5553': 'Société coopérative', '5554': 'Coopérative artisanale', '5555': 'SCIC',
  '5560': 'Coopérative agricole', '5575': 'SCOP', '5576': 'Caisse de crédit mutuel',
  '5577': 'Caisse de crédit agricole', '5585': 'SELARL', '5586': 'SELAS', '5587': 'SELAFA',
  '6100': "Caisse d'Épargne",
  '7310': 'Commune', '7320': 'Département', '7330': 'Région',
  '7371': 'Communauté de communes', '7372': "Communauté d'agglomération", '7373': 'Métropole',
  '8110': 'Mutuelle', '8120': 'Union de mutuelles', '8130': 'Fédération de mutuelles',
  '8190': 'Organisme mutualiste', '8210': 'Mutuelle', '8250': 'Mutuelle substituée', '8290': 'Organisme mutualiste',
  '9110': 'Syndicat de salariés', '9120': 'Syndicat patronal', '9150': 'Ordre professionnel',
  '9210': 'Association loi 1901', '9220': 'Association syndicale',
  '9230': 'Association de copropriétaires', '9240': 'GIE',
  '9260': 'Association de droit local', '9300': 'Fondation', '9900': 'Autre personne morale',
}

function formatMontant(valeur) {
  if (valeur == null) return null
  const abs = Math.abs(valeur)
  if (abs >= 1_000_000) return (valeur / 1_000_000).toFixed(1).replace('.', ',') + ' M€'
  if (abs >= 1_000) return Math.round(valeur / 1_000) + ' K€'
  return valeur + ' €'
}

function latestFinances(finances) {
  if (!finances || typeof finances !== 'object') return null
  const annees = Object.keys(finances).sort().reverse()
  return annees.length ? finances[annees[0]] : null
}

async function apiFetch(body) {
  const res = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 })
  if (res.status === 400) throw Object.assign(new Error('bad_params'), { status: 400 })
  if (res.status === 504) throw Object.assign(new Error('timeout'), { status: 504 })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}

const ERROR_MESSAGES = {
  429: 'Trop de requêtes, réessayez dans quelques secondes.',
  400: "Requête non reconnue. Essayez de reformuler.",
  504: 'La recherche a pris trop de temps. Réessayez ou simplifiez votre requête.',
}

// ─── ÉTAPE 1 : Saisie activité ────────────────────────────────────────────────
function StepActivity({ onSubmit, loading }) {
  const [value, setValue] = useState('')
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-heading">
          <h1>Interrogez la base SIRENE.<br />Simplement.</h1>
        </div>
        <form className="search-bar" onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}>
          <input
            className="search-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Plombier, ESN, boulanger, notaire…"
            disabled={loading}
            autoFocus
          />
          <button className="search-btn" type="submit" disabled={loading || !value.trim()}>
            {loading ? 'Analyse…' : 'Rechercher'}
          </button>
        </form>
      </div>
    </section>
  )
}

// ─── ÉTAPE 2 : Sélection codes NAF ───────────────────────────────────────────
function StepNAF({ nafCodes, selected, onChange, onBack, onNext, activity }) {
  const toggleCode = (code) => {
    if (selected.includes(code)) {
      onChange(selected.filter(c => c !== code))
    } else {
      onChange([...selected, code])
    }
  }
  const allSelected = nafCodes.length > 0 && selected.length === nafCodes.length

  return (
    <div className="content">
      <div className="content-inner content-inner--narrow">
        <button className="btn-back" onClick={onBack}>← Modifier la recherche</button>
        <div className="clarification-box">
          <p className="clarification-label">Codes NAF associés à « {activity} »</p>
          <p className="clarification-question">Sélectionnez les activités qui vous intéressent :</p>
          <div className="naf-grid">
            {nafCodes.map(({ code, label }) => (
              <button
                key={code}
                className={`naf-item${selected.includes(code) ? ' naf-item--selected' : ''}`}
                onClick={() => toggleCode(code)}
                type="button"
              >
                <span className="naf-item-check">{selected.includes(code) ? '✓' : ''}</span>
                <span className="naf-item-body">
                  <span className="naf-item-code">{code}</span>
                  <span className="naf-item-label">{label}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="naf-actions">
            <button
              className="btn-select-all"
              type="button"
              onClick={() => onChange(allSelected ? [] : nafCodes.map(n => n.code))}
            >
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <button
              className="btn-confirm"
              onClick={onNext}
              disabled={selected.length === 0}
            >
              Continuer ({selected.length} sélectionné{selected.length > 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ÉTAPE 3 : Zone géographique avec autocomplete ───────────────────────────
function StepGeo({ onBack, onSubmit, loading }) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(e) {
    const q = e.target.value
    setValue(q)
    clearTimeout(debounceRef.current)
    if (q.length < 2) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 300)
  }

  async function fetchSuggestions(q) {
    const enc = encodeURIComponent(q)
    const [communes, depts, regions] = await Promise.allSettled([
      fetch(`https://geo.api.gouv.fr/communes?nom=${enc}&boost=population&limit=4&fields=nom,codesPostaux,codeDepartement`).then(r => r.json()),
      fetch(`https://geo.api.gouv.fr/departements?nom=${enc}&limit=3&fields=nom,code`).then(r => r.json()),
      fetch(`https://geo.api.gouv.fr/regions?nom=${enc}&limit=2&fields=nom,code`).then(r => r.json()),
    ])
    const results = []
    if (communes.status === 'fulfilled' && Array.isArray(communes.value)) {
      communes.value.forEach(c => {
        const cp = c.codesPostaux?.[0] ?? ''
        results.push({ label: cp ? `${c.nom} (${cp})` : c.nom, type: 'Commune', params: cp ? { code_postal: cp } : { q: c.nom } })
      })
    }
    if (depts.status === 'fulfilled' && Array.isArray(depts.value)) {
      depts.value.forEach(d => results.push({ label: `${d.nom} (${d.code})`, type: 'Département', params: { departement: d.code } }))
    }
    if (regions.status === 'fulfilled' && Array.isArray(regions.value)) {
      regions.value.forEach(r => results.push({ label: r.nom, type: 'Région', params: { region: r.code } }))
    }
    setSuggestions(results)
    setOpen(results.length > 0)
  }

  function handleSelect(s) {
    setValue(s.label)
    setOpen(false)
    onSubmit(s.params)
  }

  return (
    <div className="content">
      <div className="content-inner content-inner--narrow">
        <button className="btn-back" onClick={onBack}>← Modifier les codes NAF</button>
        <div className="clarification-box">
          <p className="clarification-label">Zone géographique</p>
          <p className="clarification-question">Dans quelle zone souhaitez-vous rechercher ?</p>
          <form className="clarification-form" onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}>
            <div className="geo-autocomplete" ref={wrapperRef}>
              <input
                className="clarification-input"
                value={value}
                onChange={handleChange}
                placeholder="Ville, département ou région…"
                autoFocus
                disabled={loading}
                autoComplete="off"
              />
              {open && (
                <ul className="geo-suggestions">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button type="button" className="geo-suggestion-item" onMouseDown={() => handleSelect(s)}>
                        <span className="geo-suggestion-label">{s.label}</span>
                        <span className="geo-suggestion-type">{s.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="btn-confirm" type="submit" disabled={!value.trim() || loading}>
              {loading ? 'Recherche…' : 'Lancer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  // step: 1=saisie | 2=naf | 3=geo | 4=résultats
  const [step, setStep] = useState(1)
  const [activity, setActivity] = useState('')
  const [nafCodes, setNafCodes] = useState([])
  const [selectedNaf, setSelectedNaf] = useState([])
  const [results, setResults] = useState(null)
  const [total, setTotal] = useState(0)
  const [searchParams, setSearchParams] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [geo, setGeo] = useState('')

  const hasMore = results !== null && results.length < total

  // Étape 1 → 2 : on appelle /api/naf pour obtenir les codes NAF
  async function handleActivitySubmit(value) {
    setActivity(value)
    setLoading(true)
    setError(null)
    try {
      const data = await fetch(`${API_BASE}/api/naf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity: value }),
      }).then(r => r.json())
      setNafCodes(data.codes ?? [])
      setSelectedNaf((data.codes ?? []).map(c => c.code))
      setStep(2)
    } catch {
      setError('Impossible de récupérer les codes NAF. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  // Étape 3 → 4 : on lance la recherche SIRENE avec les codes NAF + la zone
  async function handleGeoSubmit(zone) {
    const geoLabel = typeof zone === 'string' ? zone : Object.values(zone)[0]
    setGeo(geoLabel)
    setLoading(true)
    setError(null)
    setResults(null)
    setPage(1)
    try {
      const data = await apiFetch({
        naf_codes: selectedNaf,
        geo: zone,
      })
      setResults(data.results ?? [])
      setTotal(data.total ?? 0)
      setSearchParams(data.params)
      setStep(4)
      fetch(`${API_BASE}/api/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${activity} / ${geoLabel}`, params: data.params, results_count: data.results?.length ?? 0 }),
      }).catch(() => {})
    } catch (err) {
      setError(ERROR_MESSAGES[err.status] ?? 'Une erreur est survenue. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!searchParams || loadingMore) return
    setLoadingMore(true)
    setError(null)
    const nextPage = page + 1
    try {
      const data = await apiFetch({ params: { ...searchParams, page: nextPage } })
      setResults(prev => [...prev, ...(data.results ?? [])])
      setPage(nextPage)
    } catch (err) {
      setError(ERROR_MESSAGES[err.status] ?? 'Erreur lors du chargement de la page suivante.')
    } finally {
      setLoadingMore(false)
    }
  }

  function resetAll() {
    setStep(1)
    setActivity('')
    setNafCodes([])
    setSelectedNaf([])
    setResults(null)
    setTotal(0)
    setSearchParams(null)
    setPage(1)
    setError(null)
    setGeo('')
  }

  return (
    <div className="app">
      {/* Étape 1 — toujours affichée dans le hero, même en step 2/3/4 sous forme compacte */}
      {step === 1 && (
        <StepActivity onSubmit={handleActivitySubmit} loading={loading} />
      )}

      {step > 1 && (
        <section className="hero hero--compact">
          <div className="hero-inner">
            <form className="search-bar" onSubmit={e => { e.preventDefault(); resetAll() }}>
              <input
                className="search-input"
                defaultValue={activity}
                disabled
              />
              <button className="search-btn" type="submit">Nouvelle recherche</button>
            </form>
          </div>
        </section>
      )}

      {step === 2 && (
        <StepNAF
          nafCodes={nafCodes}
          selected={selectedNaf}
          onChange={setSelectedNaf}
          onBack={resetAll}
          onNext={() => setStep(3)}
          activity={activity}
        />
      )}

      {step === 3 && (
        <StepGeo
          onBack={() => setStep(2)}
          onSubmit={handleGeoSubmit}
          loading={loading}
        />
      )}

      {step === 4 && (
        <main className="content">
          <div className="content-inner">
            <button className="btn-back" onClick={() => setStep(3)}>← Modifier la zone</button>

            {error && <div className="error-box">{error}</div>}

            {loading && (
              <div className="status-wrap">
                <span className="spinner" />
                <p className="status-msg">Recherche en cours…</p>
              </div>
            )}

            {results !== null && (
              <>
                <div className="results-header">
                  <span className="results-count">
                    {total.toLocaleString('fr-FR')} résultat{total > 1 ? 's' : ''}
                  </span>
                  <span className="results-shown">
                    {results.length} affiché{results.length > 1 ? 's' : ''}
                  </span>
                </div>

                {results.length === 0
                  ? <p className="status-msg">Aucun résultat pour cette recherche.</p>
                  : (
                    <>
                      <div className="cards">
                        {results.map(e => <Card key={e.siren} e={e} />)}
                      </div>
                      {hasMore && (
                        <div className="load-more-wrap">
                          <button className="btn-load-more" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore
                              ? <><span className="spinner spinner--sm" /> Chargement…</>
                              : `Voir plus (${total - results.length} restants)`}
                          </button>
                        </div>
                      )}
                    </>
                  )
                }
              </>
            )}
          </div>
        </main>
      )}
    </div>
  )
}

function Card({ e }) {
  const siege = e.siege ?? {}
  const nom = e.nom_complet ?? '—'
  const cp = siege.code_postal ?? ''
  const ville = siege.libelle_commune ?? ''
  const naf = e.activite_principale ?? ''
  const nafLabel = naf ? (NAF_LABELS[naf] ?? null) : null
  const njLabel = NJ_LABELS[e.nature_juridique] ?? null
  const tranche = TRANCHES[e.tranche_effectif_salarie] ?? null
  const annee = e.date_creation ? e.date_creation.slice(0, 4) : null
  const dirigeant = e.dirigeants?.[0] ?? null
  const fin = latestFinances(e.finances)
  const ca = fin?.ca != null ? formatMontant(fin.ca) : null
  const resultat = fin?.resultat_net != null ? formatMontant(fin.resultat_net) : null
  const nbOuverts = e.nombre_etablissements_ouverts ?? null

  return (
    <article className="card">
      <div className="card-body">
        <h3 className="card-name">{nom}</h3>
        {nafLabel && (
          <p className="card-sector">{nafLabel} <span className="card-naf-code">({naf})</span></p>
        )}
        {!nafLabel && naf && (
          <p className="card-sector card-sector--code">{naf}</p>
        )}
        {(ville || cp) && (
          <p className="card-location">{[ville, cp].filter(Boolean).join(' · ')}</p>
        )}
        <div className="card-meta">
          {njLabel && <span className="card-meta-item">{njLabel}</span>}
          {tranche && <span className="card-meta-item">{tranche} sal.</span>}
          {annee && <span className="card-meta-item">Créée en {annee}</span>}
          {nbOuverts != null && <span className="card-meta-item">{nbOuverts} étab. actif{nbOuverts > 1 ? 's' : ''}</span>}
        </div>
        {dirigeant && (
          <p className="card-dirigeant">
            {[dirigeant.prenoms, dirigeant.nom].filter(Boolean).join(' ')}
            {dirigeant.qualite && <span className="card-dirigeant-qualite"> · {dirigeant.qualite}</span>}
          </p>
        )}
        {(ca || resultat) && (
          <div className="card-finances">
            {ca && <span className="card-finance-item">CA {ca}</span>}
            {resultat && (
              <span className={`card-finance-item card-finance-item--resultat${fin.resultat_net < 0 ? ' card-finance-item--neg' : ''}`}>
                Résultat {resultat}
              </span>
            )}
          </div>
        )}
      </div>
      {e.siren && (
        <div className="card-footer">
          <span className="card-siren"><span className="card-siren-label">SIREN : </span>{e.siren}</span>
        </div>
      )}
    </article>
  )
}
