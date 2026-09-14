import { z } from 'zod'

// Codes NAF avec point (ex : "43.22A") — format exigé par l'API SIRENE
const nafCodePattern = /^\d{2}\.\d{2}[A-Z]$/

// Le prompt retourne { codes: [{ code, label }, ...] }
export const nafLlmResponseSchema = z.object({
  codes: z.array(z.object({
    code: z.string().regex(nafCodePattern),
    label: z.string(),
  })).min(1).max(6),
})

// Réponse géo : exactement un des champs attendus par l'API SIRENE
export const geoLlmResponseSchema = z.union([
  z.object({ departement: z.string().regex(/^\d{2,3}$/) }),
  z.object({ code_postal: z.string().regex(/^\d{5}(,\d{5})*$/) }),
  z.object({ region: z.string().regex(/^\d{2}$/) }),
  z.object({ commune: z.string() }),
  z.object({ q: z.string() }),
])
