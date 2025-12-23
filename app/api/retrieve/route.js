import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export const runtime = "nodejs"

async function fetchScrapeData(game, baseUrl) {

	const url = `${baseUrl}/api/scrape?game=${game}`
	console.log(`[RETRIEVE] Llamando a scrape para ${game}:`, url)

	try {
		const response = await fetch(url, {
			method: "GET",
			cache: "no-store"
		})
		if (!response.ok) { throw new Error(`Scrape failed for ${game}: ${response.statusText}`) }
		const data = await response.json()
		if (!data.ok) { throw new Error(`Scrape error for ${game}: ${data.error}`) }
		return data.results || []
	} catch (error) { console.error(`[RETRIEVE] Error fetching ${game}:`, error); throw error }
}

async function storeResults(results) {

	if (!results || results.length === 0) { return { stored: 0, skipped: 0 } }

	let stored = 0
	let skipped = 0

	for (const result of results) {

		try {

			// Verificar si ya existe (usando type, draw_date, draw_time como clave única)
			const { data: existing } = await supabase
				.from("games")
				.select("id")
				.eq("type", result.game)
				.eq("draw_date", result.date)
				.eq("draw_time", result.drawTime)
				.single()

			if (existing) {
				console.log(`[RETRIEVE] Ya existe: ${result.game} ${result.drawTime} ${result.date}`)
				skipped++
				continue
			}

			// Insertar nuevo resultado
			const { error } = await supabase
				.from("games")
				.insert({
					type: result.game,
					draw_date: result.date,
					draw_time: result.drawTime,
					result: result.numbers,
					fireball: result.fireball || null,
				})

			if (error) {
				// Si es error de duplicado, ignorar
				if (error.code === "23505") { console.log(`[RETRIEVE] Duplicado (constraint): ${result.game} ${result.drawTime} ${result.date}`); skipped++ }
				else { console.error(`[RETRIEVE] Error insertando ${result.game} ${result.drawTime} ${result.date}:`, error); throw error }
			} else { console.log(`[RETRIEVE] Almacenado: ${result.game} ${result.drawTime} ${result.date}`); stored++ }

		} catch (error) {

			// Si el error es que no existe (no es duplicado), intentar insertar
			if (error.code === "PGRST116") {
				// No existe, intentar insertar
				try {
					const { error: insertError } = await supabase
						.from("games")
						.insert({
							type: result.game,
							draw_date: result.date,
							draw_time: result.drawTime,
							result: result.numbers,
							fireball: result.fireball || null,
						})

					if (insertError && insertError.code !== "23505") {
						console.error(`[RETRIEVE] Error insertando:`, insertError)
					} else if (!insertError) {
						stored++
					} else {
						skipped++
					}

				} catch (e) { console.error(`[RETRIEVE] Error en inserción:`, e) }
			} else { console.error(`[RETRIEVE] Error procesando resultado:`, error) }
		}
	}

	return { stored, skipped }
}

export async function POST(req) {

	console.log("[RETRIEVE] Iniciando recuperación de datos...")

	try {
		// Determinar la URL base desde la request
		const url = new URL(req.url)
		const baseUrl = `${url.protocol}//${url.host}`

		// Obtener datos de PICK3 y PICK4
		const [pick3Results, pick4Results] = await Promise.all([
			fetchScrapeData("PICK3", baseUrl),
			fetchScrapeData("PICK4", baseUrl),
		])

		console.log(`[RETRIEVE] PICK3: ${pick3Results.length} resultados`)
		console.log(`[RETRIEVE] PICK4: ${pick4Results.length} resultados`)

		// Combinar todos los resultados
		const allResults = [...pick3Results, ...pick4Results]

		// Almacenar en base de datos
		const { stored, skipped } = await storeResults(allResults)

		console.log(`[RETRIEVE] Almacenados: ${stored}, Omitidos: ${skipped}`)

		// const webhookUrl = `https://n8n.qvapay.com/webhook-test/68cc4765-98c1-4c5c-a533-289424ab1763`
		const webhookUrl = `https://n8n.qvapay.com/webhook/68cc4765-98c1-4c5c-a533-289424ab1763`

		console.log("[RETRIEVE] Enviando webhook a:", webhookUrl)

		const webhookBody = {
			ok: true,
			summary: {
				pick3: pick3Results.length,
				pick4: pick4Results.length,
				total: allResults.length,
				stored,
				skipped,
			},
			results: allResults
		}
		const webhookResponse = await fetch(webhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(webhookBody)
		})
		if (!webhookResponse.ok) { console.error("[RETRIEVE] Error al enviar webhook:", webhookResponse.statusText) }

		return NextResponse.json({ webhookBody })

	} catch (error) { console.error("[RETRIEVE] Error:", error); return NextResponse.json({ ok: false, error: error.message || "Unknown error" }, { status: 500 }) }
}
