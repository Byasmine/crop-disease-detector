/**
 * OpenAI-compatible client config.
 * Supports OpenAI and Groq (keys starting with gsk_).
 */
export function getLlmConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const isGroq = Boolean(apiKey?.startsWith('gsk_'))
  const baseUrl = (
    process.env.OPENAI_BASE_URL?.trim() ||
    (isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1')
  ).replace(/\/$/, '')

  return {
    apiKey,
    baseUrl,
    provider: isGroq || baseUrl.includes('groq.com') ? 'groq' : 'openai',
    chatModel: process.env.OPENAI_MODEL?.trim() || (isGroq ? 'llama-3.1-8b-instant' : 'gpt-4o-mini'),
    transcribeModel:
      process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || (isGroq ? 'whisper-large-v3' : 'whisper-1'),
  }
}
