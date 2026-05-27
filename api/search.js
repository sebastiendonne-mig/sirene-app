const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function withTimeout(promise, ms, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return promise(controller.signal).finally(() => clearTimeout(timer)).catch(err => {
    if (err.name === 'AbortError') throw Object.assign(new Error(`Timeout ${label} (${ms}ms)`), { isTimeout: true, label })
    throw err
  })
}

async function fetchSirene(qs, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await withTimeout(
      (signal) => fetch(`https://recherche-entreprises.api.gouv.fr/search?${qs}`, { signal }),
      4000,
      'SIRENE'
    )
    if (res.status === 429 && attempt < retries) {
      await sleep(1000)
      continue
    }
    return res
  }
}

async function callSirene(params, res) {
  const qs = new URLSearchParams(
    Object.entries({ ...params, minimal: 'true', include: 'dirigeants,finances,siege' })
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  console.log('[search] Params SIRENE:', JSON.stringify(params))
  const sireneRes = await fetchSirene(qs)
  if (!sireneRes.ok) {
    const errBody = await sireneRes.json().catch(() => ({}))
    console.error('[search] Erreur SIRENE', sireneRes.status, JSON.stringify(errBody), 'params:', JSON.stringify(params))
    if (sireneRes.status === 429) return res.status(429).json({ error: 'rate_limit' })
    if (sireneRes.status === 400) return res.status(400).json({ error: 'Paramètres de recherche invalides', detail: errBody, params })
    return res.status(502).json({ error: 'Erreur API SIRENE', status: sireneRes.status })
  }
  const data = await sireneRes.json()
  return res.json({
    params,
    results: data.results ?? [],
    total: data.total_results ?? 0,
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const t0 = Date.now()

  try {
    const { query, params: providedParams } = req.body ?? {}

    // "Voir plus" : params déjà résolus, on saute Claude
    if (providedParams && typeof providedParams === 'object') {
      return await callSirene(providedParams, res)
    }

    if (!query?.trim()) return res.status(400).json({ error: 'Paramètre query manquant' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY absente des variables d\'environnement' })
    }

    const claudeRes = await withTimeout(
      (signal) => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: `Tu es un expert de l'API SIRENE française. Ton rôle est de traduire une requête utilisateur en paramètres JSON pour l'API recherche-entreprises.api.gouv.fr.

Paramètres disponibles :
- q : mots-clés libres ou SIREN/SIRET
- departement : code département 2 chiffres (ex: "83", "75")
- region : code région INSEE 2 chiffres (ex: "93" pour PACA)
- code_postal : code postal 5 chiffres
- activite_principale : code NAF (ex: "62.01Z") — multivaleur possible séparé par virgule
- section_activite_principale : lettre de section NAF (A à U)
- nature_juridique : code juridique INSEE 4 chiffres (ex: "9210" association, "5522" SAS, "5410" SARL, "8210" mutuelle)
- categorie_entreprise : "PME", "ETI" ou "GE"
- tranche_effectif_salarie : code individuel UNIQUEMENT — valeurs : NN, 00, 01, 02, 03, 11, 12, 21, 22, 31, 32, 41, 42, 51, 52
- etat_administratif : "A" (actif) ou "C" (cessé), défaut "A"
- ca_min / ca_max : chiffre d'affaires min/max en euros
- est_ess, est_association, est_organisme_formation, est_qualiopi, est_rge, est_entrepreneur_individuel, est_siae, est_service_public : true/false
- sort_by_size : true/false
- per_page : max 10, défaut 10 — page : défaut 1

EXTRACTION NAF DEPUIS UNE PRÉCISION : si la requête contient "— précision :" suivi d'un libellé avec un code NAF entre parenthèses (ex: "— précision : Plomberie (43.22A)"), extraire ce code et utiliser activite_principale avec ce code. NE PAS mettre le terme métier original dans q. Si la précision est "Toutes les activités" ou "Toutes ces activités" ou commence par "Tous", utiliser q avec le terme original sans filtrer par activite_principale.

RÈGLES DE CLARIFICATION — retourne { "needs_clarification": true, "question": "...", "options": [...] } (tableau de 2-4 chaînes courtes) si l'une de ces conditions est vraie :

1. MOT AMBIGU MÉTIER/NOM DE FAMILLE : si la requête (sans précision) contient un mot pouvant être à la fois un secteur ET un nom de famille courant (charpentier, boucher, boulanger, menuisier, forgeron, berger, dubois, martin, bernard, thomas, petit, robert, richard, durand, leroy, moreau, simon, michel, lefebvre, boyer, perrin, morin, rousseau, blanc, faure, girard, bonnet, mercier, dupont, lambert, masson, garnier, chevalier, renard, meunier, barbier, dufour, morel, moulin, marchand, aubert, clement, dumas, pelletier, caron, picard, roger, vidal, lucas, guillot, roux, noel, hubert, allard), demande : "Cherchez-vous des entreprises du secteur '[métier]' ou une entreprise portant le nom '[Nom]' ?" avec options : ["Secteur [métier]", "Entreprise nommée [Nom]"]

2. SECTEUR AVEC PLUSIEURS NAF POSSIBLES : si la requête contient un terme de métier/secteur qui correspond à plusieurs codes NAF distincts ET qu'une localisation est fournie (ou que le terme est clairement professionnel sans ambiguïté de nom de famille), demander quel type d'activité précisément. Proposer 3-4 options avec les codes NAF entre parenthèses + une option "Toutes ces activités". Correspondances à connaître :
- charpentier/charpente → ["Charpente bois (43.91A)", "Menuiserie (43.32A)", "Construction bois (41.20A)", "Toutes ces activités"]
- boulanger/boulangerie → ["Boulangerie-pâtisserie (10.71A)", "Commerce boulangerie (47.24Z)", "Toutes ces activités"]
- boucher/boucherie → ["Boucherie-charcuterie (10.11Z)", "Commerce de viandes (47.22Z)", "Toutes ces activités"]
- plombier/plomberie → ["Plomberie (43.22A)", "Chauffage-climatisation (43.22B)", "Toutes ces activités"]
- électricien/électricité → ["Travaux électriques (43.21A)", "Commerce matériel électrique (46.69A)", "Toutes ces activités"]
- menuisier/menuiserie → ["Menuiserie bois et PVC (43.32A)", "Menuiserie métallique (43.32B)", "Fabrication menuiserie (16.23Z)", "Toutes ces activités"]
- peintre/peinture → ["Peinture et vitrerie (43.34Z)", "Fabrication peintures (20.30Z)", "Toutes ces activités"]
- maçon/maçonnerie → ["Maçonnerie et gros œuvre (43.99C)", "Construction bâtiments (41.20B)", "Toutes ces activités"]
- couvreur/couverture → ["Couverture (43.91B)", "Charpente (43.91A)", "Toutes ces activités"]
- carreleur/carrelage → ["Revêtements sols et murs (43.33Z)", "Toutes ces activités"]
- mutuelle → ["Assurance mutuelle (65.12Z)", "Prévoyance-réassurance (65.20Z)", "Toutes les mutuelles"]
- formation → ["Formation continue adultes (85.59A)", "Autres enseignements (85.59B)", "Enseignement professionnel (85.32Z)", "Tous les organismes de formation"]
- informatique → ["Développement logiciel (62.01Z)", "Conseil informatique (62.02A)", "Infogérance (62.03Z)", "Tous secteurs informatique"]
- conseil → ["Conseil en gestion (70.22Z)", "Conseil en communication (73.11Z)", "Ingénierie-études techniques (71.12B)", "Tous cabinets de conseil"]
- transport → ["Transport routier fret (49.41A)", "Transport voyageurs (49.39A)", "Déménagement (49.42Z)", "Tous les transporteurs"]
- restaurant/restauration → ["Restauration traditionnelle (56.10A)", "Restauration rapide (56.10C)", "Traiteur (56.21Z)", "Tous les restaurants"]
- médecin/médical → ["Médecine générale (86.21Z)", "Médecine spécialisée (86.22C)", "Santé (section Q)"]
- avocat/juridique → ["Activités juridiques (69.10Z)", "Toutes ces activités"]
- comptable/comptabilité → ["Activités comptables (69.20Z)", "Toutes ces activités"]
- immobilier/agence immobilière → ["Agences immobilières (68.31Z)", "Gestion immobilière (68.32A)", "Promotion immobilière (41.10A)", "Toutes ces activités"]
- architecte/architecture → ["Architecture (71.11Z)", "Ingénierie (71.12B)", "Toutes ces activités"]
- sécurité → ["Sécurité privée (80.10Z)", "Sécurité incendie (80.20Z)", "Toutes ces activités"]
- nettoyage/propreté → ["Nettoyage courant bâtiments (81.21Z)", "Autres nettoyages (81.22Z)", "Toutes ces activités"]
- jardinier/jardinage/paysagiste → ["Services d'aménagement paysager (81.30Z)", "Toutes ces activités"]
- coiffeur/coiffure → ["Coiffure (96.02A)", "Soins de beauté (96.02B)", "Toutes ces activités"]
- photographe/photographie → ["Activités photographiques (74.20Z)", "Toutes ces activités"]
- assurance/assureur → ["Assurance vie (65.11Z)", "Autres assurances (65.12Z)", "Courtage d'assurances (66.22Z)", "Toutes les assurances"]
- banque/bancaire → ["Banque et intermédiation (64.19Z)", "Caisse d'Épargne (64.11Z)", "Crédit-bail (64.91Z)", "Toutes les banques"]
- agriculture/agricole → ["Culture céréales (01.11Z)", "Maraîchage (01.13Z)", "Viticulture (01.21Z)", "Tous secteurs agricoles"]
- logistics/logistique → ["Entreposage (52.10B)", "Transport fret (49.41A)", "Toutes ces activités"]

3. ABSENCE DE LOCALISATION : demande la zone UNIQUEMENT si la requête ne contient AUCUNE indication géographique (région, département, numéro, ville, code postal). Proposer 3-4 régions pertinentes comme options.

4. SECTEUR TROP VAGUE : si la requête mentionne un secteur très générique seul (ex: "entreprises", "sociétés", "PME"), demande une précision avec des options contextuelles.

Si la requête est claire et contient suffisamment d'informations, retourne directement les paramètres JSON sans passer par needs_clarification.

Réponds UNIQUEMENT avec un JSON valide, rien d'autre.`,
          messages: [{ role: 'user', content: query }],
        }),
      }),
      5000,
      'Claude'
    )

    if (!claudeRes.ok) {
      const detail = await claudeRes.text()
      console.error('[search] Erreur Claude', claudeRes.status, detail)
      return res.status(502).json({ error: 'Erreur Claude API', status: claudeRes.status, detail })
    }

    const claudeData = await claudeRes.json()
    let params
    try {
      const raw = claudeData.content[0].text.trim()
      const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      params = JSON.parse(jsonText)
    } catch {
      return res.status(502).json({ error: 'Réponse Claude non parseable', raw: claudeData.content[0].text })
    }

    // Claude peut retourner directement needs_clarification
    if (params.needs_clarification) {
      return res.json({
        needs_clarification: true,
        question: params.question,
        options: Array.isArray(params.options) ? params.options : undefined,
      })
    }

    // Filet de sécurité : pas de localisation dans les params
    if (!params.departement && !params.code_postal && !params.region) {
      return res.json({
        needs_clarification: true,
        question: 'Dans quelle zone géographique souhaitez-vous effectuer cette recherche ? (département, région ou ville)',
      })
    }

    const result = await callSirene(params, res)
    console.log(`[search] OK en ${Date.now() - t0}ms`)
    return result
  } catch (err) {
    const elapsed = Date.now() - t0
    if (err.isTimeout) {
      console.error(`[search] Timeout ${err.label} après ${elapsed}ms`)
      return res.status(504).json({ error: 'timeout', service: err.label })
    }
    console.error('[search] Exception non catchée', err)
    return res.status(500).json({ error: 'Erreur interne', message: err.message })
  }
}
