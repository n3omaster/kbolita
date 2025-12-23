import * as cheerio from "cheerio"
import { NextResponse } from "next/server"
import puppeteer from "puppeteer"
import { execSync } from "child_process"
import { existsSync } from "fs"

export const runtime = "nodejs"

const URLS = {
	PICK3: "https://floridalottery.com/games/draw-games/pick-3",
	PICK4: "https://floridalottery.com/games/draw-games/pick-4",
}

// Función para encontrar el ejecutable de Chromium del sistema
function findChromiumExecutable() {
	const possiblePaths = [
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
	]

	// Primero verificar rutas comunes
	for (const path of possiblePaths) {
		if (existsSync(path)) {
			console.log(`[SCRAPE] Usando Chromium del sistema: ${path}`)
			return path
		}
	}

	// Intentar encontrar con which (uno por uno)
	const whichCommands = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]
	for (const cmd of whichCommands) {
		try {
			const chromiumPath = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf-8" }).trim()
			if (chromiumPath && existsSync(chromiumPath)) {
				console.log(`[SCRAPE] Usando Chromium encontrado con which: ${chromiumPath}`)
				return chromiumPath
			}
		} catch (e) {
			// Continuar con el siguiente comando
		}
	}

	console.log("[SCRAPE] No se encontró Chromium del sistema, usando el de Puppeteer")
	return null
}

function normalizeDate(raw) {
	// raw: "Fri, Dec 19, 2025" (puede venir duplicado)
	// Limpiar: remover duplicados y espacios extra
	const cleaned = raw
		.trim()
		.split(/\s+/)
		.join(" ")
		.replace(/(\w+, \w+ \d+, \d{4})\s+\1/, "$1") // Remover duplicados exactos

	console.log("[SCRAPE] normalizeDate - Input:", raw, "Cleaned:", cleaned)

	const d = new Date(cleaned)
	if (isNaN(d.getTime())) { throw new Error("Invalid date: " + cleaned) }
	return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export async function GET(req) {

	console.log("[SCRAPE] Iniciando scraping...")

	try {

		const { searchParams } = new URL(req.url)
		const game = (searchParams.get("game") || "PICK3").toUpperCase()
		if (!["PICK3", "PICK4"].includes(game)) { return NextResponse.json({ ok: false, error: "Invalid game (use PICK3 or PICK4)" }, { status: 400 }) }

		const url = URLS[game]
		console.log("[SCRAPE] Juego:", game, "URL:", url)

		// Usar Puppeteer para renderizar JavaScript
		console.log("[SCRAPE] Iniciando navegador...")

		// Intentar usar Chromium del sistema
		const chromiumPath = findChromiumExecutable()

		const launchOptions = {
			headless: true,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu',
				'--disable-software-rasterizer',
				'--disable-extensions',
				'--disable-background-networking',
				'--disable-background-timer-throttling',
				'--disable-renderer-backgrounding',
				'--disable-backgrounding-occluded-windows',
				'--disable-ipc-flooding-protection',
			],
		}

		// Si encontramos Chromium del sistema, usarlo
		if (chromiumPath) {
			launchOptions.executablePath = chromiumPath
		}

		const browser = await puppeteer.launch(launchOptions)

		try {

			const page = await browser.newPage()
			await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

			console.log("[SCRAPE] Navegando a:", url)
			await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 })

			// Esperar a que aparezca el card con los resultados
			console.log("[SCRAPE] Esperando contenido dinámico...")
			await page.waitForSelector("div.draw-game-header__card", { timeout: 15000 }).catch(() => { console.log("[SCRAPE] Selector no encontrado después de 15s, continuando...") })

			// Esperar un poco más para asegurar que Vue haya renderizado todo
			await new Promise(resolve => setTimeout(resolve, 2000))

			// Obtener el HTML renderizado
			const html = await page.content()
			console.log("[SCRAPE] HTML obtenido - Tamaño:", html.length, "caracteres")

			// Parsear con Cheerio
			const $ = cheerio.load(html)
			const results = []

			// Buscar el card principal
			const card = $("div.draw-game-header__card").first()
			console.log("[SCRAPE] Card encontrado:", card.length > 0)

			if (card.length === 0) {

				console.log("[SCRAPE] No se encontró el card, buscando en todo el HTML...")
				// Fallback: buscar directamente los bloques de fecha
				$("p.draw-date").each((_, dateEl) => {
					const $dateEl = $(dateEl)
					const block = $dateEl.closest("div")

					// Obtener drawTime del SVG title
					const title = block.find("svg title").first().text().trim().toUpperCase()
					const drawTime = title === "MIDDAY" ? "MIDDAY" : title === "EVENING" ? "EVENING" : null

					if (!drawTime) return

					// Extraer fecha
					const rawDate = $dateEl.clone().children().remove().end().text().trim()
					if (!rawDate) return

					const date = normalizeDate(rawDate)

					// Extraer números
					const numbers = block
						.find("li.game-numbers__number span")
						.map((_, el) => $(el).text().trim())
						.get()
						.join("")

					if (!numbers) return

					// Extraer fireball
					const fireball = block
						.find("li.game-numbers__bonus span.game-numbers__bonus-text")
						.text()
						.trim()

					results.push({
						game: game,
						drawTime,
						date,
						numbers,
						fireball: fireball || "",
					})
				})

			} else {

				// Buscar dentro del card los bloques de Midday y Evening
				// Cada bloque está en un div que contiene un p.draw-date y un ul.game-numbers
				card.find("p.draw-date").each((_, dateEl) => {

					const $dateEl = $(dateEl)

					// Encontrar el ul.game-numbers que está en el mismo bloque
					// Buscar el siguiente ul.game-numbers después de este p.draw-date en el mismo contenedor
					const $block = $dateEl.closest("div")
					const $numbersList = $block.find("ul.game-numbers").first()
					if ($numbersList.length === 0) { console.log("[SCRAPE] No se encontró ul.game-numbers en el bloque"); return }

					// Obtener drawTime del SVG title dentro del p.draw-date
					const title = $dateEl.find("svg title").first().text().trim().toUpperCase()
					const drawTime = title === "MIDDAY" ? "MIDDAY" : title === "EVENING" ? "EVENING" : null
					if (!drawTime) { console.log("[SCRAPE] Saltando bloque sin drawTime válido"); return }

					console.log(`[SCRAPE] Procesando bloque ${drawTime}...`)

					// Extraer fecha
					// Clonar, remover hijos (SVG), y obtener solo el texto
					const rawDate = $dateEl
						.clone()
						.children()
						.remove()
						.end()
						.text()
						.trim()
						.split(/\s+/)
						.join(" ") // Normalizar espacios múltiples
					if (!rawDate) { console.log(`[SCRAPE] ${drawTime} - Fecha vacía después de limpiar`); return }

					console.log(`[SCRAPE] ${drawTime} - rawDate:`, rawDate)
					const date = normalizeDate(rawDate)
					console.log(`[SCRAPE] ${drawTime} - Fecha:`, date)

					// Extraer números del ul.game-numbers que ya encontramos
					const numbers = $numbersList
						.find("li.game-numbers__number span")
						.map((_, el) => $(el).text().trim())
						.get()
						.join("")
					if (!numbers) { console.log(`[SCRAPE] ${drawTime} - No se encontraron números`); return }

					console.log(`[SCRAPE] ${drawTime} - Números:`, numbers)

					// Extraer fireball del mismo ul.game-numbers
					const fireball = $numbersList
						.find("li.game-numbers__bonus span.game-numbers__bonus-text")
						.text()
						.trim()

					console.log(`[SCRAPE] ${drawTime} - Fireball:`, fireball)

					results.push({ game: game, drawTime, date, numbers, fireball: fireball || "" })
				})
			}

			console.log("[SCRAPE] Total resultados encontrados:", results.length)
			console.log("[SCRAPE] Resultados:", JSON.stringify(results, null, 2))

			return NextResponse.json({ ok: true, game, count: results.length, results })

		} finally { await browser.close(); console.log("[SCRAPE] Navegador cerrado") }

	} catch (err) { console.error("[SCRAPE] Error:", err); return NextResponse.json({ ok: false, error: err.message || "Unknown error" }, { status: 500 }) }
}

