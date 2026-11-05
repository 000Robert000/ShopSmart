import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function parseBudget(question) {
  if (!question || typeof question !== "string") return null;
  const match = question.match(/(?:below|under|less than|max|up to)\s*(?:₱|p)?\s*(\d+(?:,\d+)?)/i);
  return match ? parseFloat(match[1].replace(',', '')) : null;
}

export function rankProducts(products, question) {
  if (!Array.isArray(products)) return [];
  const q = (question || "").toLowerCase();
  const maxPrice = parseBudget(q);
  const stopWords = new Set(["is", "there", "a", "an", "the", "do", "you", "have", "show", "me", "any", "which", "are", "below", "under"]);
  const queryWords = q.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));

  return products.filter((p) => {
    // Exclude out of stock items
    const stockCount = p.stock ?? p.inStock ?? 1;
    if (stockCount <= 0) return false;

    const pName = (p.name || "").toLowerCase();
    const pCat = (p.category || "").toLowerCase();
    const pDesc = (p.description || "").toLowerCase();
    const pPrice = Number(p.price || 0);

    if (maxPrice && pPrice > maxPrice) return false;

    return (
      q.includes(pName) ||
      queryWords.some(w => pName.includes(w) || pCat.includes(w) || pDesc.includes(w))
    );
  });
}

export function buildAssistantResponse(matchedProducts) {
  if (!Array.isArray(matchedProducts) || matchedProducts.length === 0) {
    return {
      answer: "No matching products were found in the active store catalog.",
      products: [],
      recommendedProducts: [],
      sources: []
    };
  }

  const itemNames = matchedProducts.map((m) => m.name).join(", ");
  return {
    answer: `Based on our current catalog, consider: ${itemNames}.`,
    products: matchedProducts,
    recommendedProducts: matchedProducts,
    sources: matchedProducts
  };
}

export async function getAssistantAnswer(question) {
  if (!question || typeof question !== 'string') {
    return buildAssistantResponse([]);
  }

  let products = [];
  try {
    products = await prisma.product.findMany();
  } catch (err) {
    console.error("Database query failed:", err.message);
  }

  const localSearch = () => {
    const matched = rankProducts(products, question);
    return buildAssistantResponse(matched);
  };

  if (!process.env.GEMINI_API_KEY) {
    return localSearch();
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Filter available stock before sending to Gemini prompt
    const availableProducts = products.filter(p => (p.stock ?? p.inStock ?? 1) > 0);

    const prompt = `
You are the ShopSmart product assistant. Answer the user's question using ONLY the active product catalog below.
If matching items exist, recommend them clearly. If none match, state that the store does not have them.

Catalog:
${JSON.stringify(availableProducts, null, 2)}

User Question: "${question}"
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const matchedProducts = availableProducts.filter((p) =>
      responseText.toLowerCase().includes(p.name.toLowerCase()) ||
      question.toLowerCase().includes(p.name.toLowerCase())
    );

    return {
      answer: responseText,
      products: matchedProducts,
      recommendedProducts: matchedProducts,
      sources: matchedProducts
    };
  } catch (err) {
    console.warn("Gemini API error, falling back to local search:", err.message);
    return localSearch();
  }
}

export default {
  buildAssistantResponse,
  getAssistantAnswer,
  parseBudget,
  rankProducts
};