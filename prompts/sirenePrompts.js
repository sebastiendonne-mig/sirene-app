// Prompts LLM centralisés — ne pas mettre de logique métier ici.
// temperature: 0 imposé sur tous les appels via les handlers (api/naf.js, api/search.js).

/**
 * Résolution activité → codes NAF rév.2
 * @param {string} codesList  Liste "CODE: libellé" issue de api/naf-codes.json
 */
export function nafSystemPrompt(codesList) {
  return `Tu es un expert de la nomenclature NAF rév.2 officielle française (INSEE).
Retourne UNIQUEMENT des codes NAF qui existent réellement dans cette nomenclature.
Ne jamais inventer un code — si tu n'es pas certain qu'il existe, ne pas l'inclure.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown.
Format : { "codes": [ { "code": "62.01Z", "label": "Programmation informatique" }, ... ] }
Maximum 6 codes, du plus pertinent au moins pertinent.
Voici tous les codes NAF valides :
${codesList}
Utilise UNIQUEMENT des codes de cette liste exacte.`
}

/**
 * Résolution zone géographique libre → paramètre API SIRENE
 * Utilisé en fallback quand la détection par regex (dept/CP) échoue.
 */
export const geoSystemPrompt = `Convertis une zone géographique française en paramètre API SIRENE.
Réponds UNIQUEMENT avec un JSON valide, sans markdown.
Paramètres possibles (un seul) :
- { "departement": "83" }   → pour un département (code 2 chiffres INSEE)
- { "code_postal": "83000" } → pour un code postal
- { "region": "93" }         → pour une région (code INSEE 2 chiffres : 84=AuRA, 93=PACA, 11=IDF, 75=NA, 76=OCC, 32=HDF, 28=Normandie, 53=Bretagne, 52=PDL, 44=GE, 27=BFC, 24=NA, 94=Corse)
- { "q": "Lyon" }            → pour une ville (q = nom ville)`
