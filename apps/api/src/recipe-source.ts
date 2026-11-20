/**
 * Fetches a recipe page and returns its schema.org Recipe data (JSON-LD), which most recipe sites embed.
 * Saves agents from parsing whole HTML pages. Falls back to the page's plain text when there is none.
 */

export interface RecipeSource {
  url: string;
  found: boolean;
  name?: string;
  description?: string;
  yield?: string;
  prep_time?: string;
  cook_time?: string;
  total_time?: string;
  image?: string;
  ingredients?: string[];
  steps?: { section?: string; text: string }[];
  nutrition?: Record<string, string>;
  /** Plain page text, only when no Recipe data was found. */
  text?: string;
}

// JSON-LD is untyped; every read below checks the shape it needs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export async function fetchRecipeSource(url: string): Promise<RecipeSource> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (feedr recipe import)', Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Fetching ${url} failed: HTTP ${res.status}`);
  return parseRecipeSource(res.url || url, await res.text());
}

export function parseRecipeSource(url: string, html: string): RecipeSource {
  const recipe = findRecipe(jsonLdBlocks(html));
  if (!recipe) return { url, found: false, name: pageTitle(html), text: plainText(html).slice(0, 15_000) };
  return {
    url,
    found: true,
    name: str(recipe.name),
    description: str(recipe.description),
    yield:
      [recipe.recipeYield]
        .flat()
        .filter((y: Json) => y != null && y !== '')
        .map(String)
        .join(' / ') || undefined,
    prep_time: str(recipe.prepTime),
    cook_time: str(recipe.cookTime),
    total_time: str(recipe.totalTime),
    image: imageUrl(recipe.image),
    ingredients: (recipe.recipeIngredient ?? recipe.ingredients ?? []).map((i: Json) => decode(String(i))),
    steps: steps(recipe.recipeInstructions),
    nutrition: recipe.nutrition
      ? Object.fromEntries(
          Object.entries(recipe.nutrition)
            .filter(([k, v]) => !k.startsWith('@') && v != null)
            .map(([k, v]) => [k, String(v)]),
        )
      : undefined,
  };
}

function jsonLdBlocks(html: string): Json[] {
  const blocks: Json[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push(JSON.parse(m[1]!.trim()));
    } catch {
      // Ignore malformed blocks; sites often include several.
    }
  }
  return blocks;
}

function findRecipe(node: Json): Json | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return undefined;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  return findRecipe(node['@graph']) ?? findRecipe(node.mainEntity);
}

function steps(instructions: Json, section?: string): { section?: string; text: string }[] {
  if (!instructions) return [];
  if (typeof instructions === 'string') {
    return plainText(instructions)
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ section, text }));
  }
  if (Array.isArray(instructions)) return instructions.flatMap((i) => steps(i, section));
  if (instructions['@type'] === 'HowToSection') return steps(instructions.itemListElement, str(instructions.name));
  const text = str(instructions.text) ?? str(instructions.name);
  return text ? [{ section, text: plainText(text) }] : [];
}

function imageUrl(image: Json): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return imageUrl(image[0]);
  return str(image.url);
}

function str(v: Json): string | undefined {
  return typeof v === 'string' && v.trim() ? decode(v.trim()) : undefined;
}

function pageTitle(html: string): string | undefined {
  return str(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function plainText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
