import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ENV_PATH = path.resolve(__dirname, '../../.env');

let customTestProvider = null;

function resolveGeminiConfig() {
  let apiKey = (process.env.GEMINI_API_KEY || env.geminiApiKey || '').trim();
  let model = (process.env.GEMINI_MODEL || env.geminiModel || 'gemini-2.0-flash').trim();

  // Hot-reload server/.env if key was updated after server start
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    dotenv.config({ path: SERVER_ENV_PATH, override: true });
    apiKey = (process.env.GEMINI_API_KEY || '').trim();
    model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  }

  return { apiKey, model };
}

/**
 * Allows automated tests to inject a deterministic AI provider (e.g., to simulate
 * network latency while testing concurrent human edits during AI execution).
 * Never used in production runtime.
 */
export function setAIProviderForTesting(providerFn) {
  customTestProvider = providerFn;
}

function buildPrompt({ actionType, instruction, documentTitle, sectionLabel, originalContent, surroundingContext }) {
  const actionGuidance = {
    rewrite: 'Rewrite the target text according to the user instruction while preserving factual accuracy and intended meaning.',
    summarize: 'Produce a concise, clear summary of the target text.',
    improve: 'Improve clarity, flow, conciseness, and writing quality of the target text.',
    grammar: 'Fix grammar, spelling, punctuation, and awkward phrasing with minimal unnecessary changes.',
    expand: 'Expand the target text with concrete details and illustrative examples.',
    tone: 'Adjust the tone of the target text to match the instruction while keeping core information intact.',
    headings: 'Suggest improved, well-structured heading and body phrasing for the target text.',
    custom: 'Follow the user instruction precisely on the target text.',
  };

  return `You are Writing Assistant, a collaborative AI editor inside SyncSpace AI.
Your job is to perform a TARGETED edit on ONLY the provided target text—do not regenerate unrelated sections of the document.

Document Title: ${documentTitle || 'Untitled Document'}
Target Region: ${sectionLabel || 'Target Section'}
Action Type: ${actionType}
Guidance: ${actionGuidance[actionType] || actionGuidance.custom}
User Instruction: ${instruction}
${surroundingContext ? `\nBrief Surrounding Context (DO NOT include this in proposedContent, context only):\n${surroundingContext}\n` : ''}
Target Text to Edit:
"""
${originalContent}
"""

Respond with ONLY valid JSON matching this exact schema (no markdown code fences):
{
  "proposedContent": "The revised target text only (plain text, paragraphs separated by double newlines if multiple paragraphs).",
  "explanation": "One concise sentence explaining what was improved."
}`;
}

function parseStructuredAIResponse(rawText) {
  const trimmed = (rawText || '').trim();
  // Strip optional markdown code fences if the model wrapped JSON
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.proposedContent === 'string' && parsed.proposedContent.trim().length > 0) {
      return {
        proposedContent: parsed.proposedContent.trim(),
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : 'Targeted AI revision generated.',
      };
    }
  } catch {
    // Fallback if model returned plain text instead of JSON
  }

  return {
    proposedContent: cleaned,
    explanation: 'Targeted AI revision generated.',
  };
}

export async function generateTargetedEdit(params) {
  if (typeof customTestProvider === 'function') {
    return customTestProvider(params);
  }

  const { apiKey, model: configuredModel } = resolveGeminiConfig();

  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    const err = new Error(
      'GEMINI_API_KEY is not configured on the server. Add a valid Google Gemini API key to server/.env to run AI edits.'
    );
    err.statusCode = 503;
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(params);

  const modelsToTry = [
    configuredModel,
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return parseStructuredAIResponse(text);
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      // Retry next fallback model on 404 (retired/unavailable), 503 (high demand), or 429 (quota/rate)
      const isRetryable =
        msg.includes('404') ||
        msg.includes('not found') ||
        msg.includes('not supported') ||
        msg.includes('503') ||
        msg.includes('Service Unavailable') ||
        msg.includes('high demand') ||
        msg.includes('429');
      if (!isRetryable) {
        break;
      }
    }
  }

  const error = new Error(
    `Gemini API request failed: ${lastError?.message || 'Unknown AI provider error'}`
  );
  error.statusCode = 502;
  error.code = 'GEMINI_API_ERROR';
  throw error;
}
