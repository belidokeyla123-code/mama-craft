/**
 * Shared AI helpers for Lovable AI Gateway
 */

export interface AICallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  responseFormat?: 'text' | 'json_object';
}

export interface AICallResult {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call Lovable AI Gateway with standardized error handling and logging
 */
export async function callLovableAI(
  prompt: string,
  options: AICallOptions = {}
): Promise<AICallResult> {
  const {
    model = 'google/gemini-2.5-flash',
    temperature,
    maxTokens,
    timeout = 30000,
    responseFormat = 'text'
  } = options;

  // ✅ Usar Lovable AI Gateway (suporta Gemini e OpenAI)
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  console.log(`[AI] Calling Lovable AI Gateway with model ${model}...`);
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestBody: any = {
      model: model,
      messages: [{ role: 'user', content: prompt }]
    };

    if (temperature !== undefined) requestBody.temperature = temperature;
    if (maxTokens) requestBody.max_tokens = maxTokens;
    if (responseFormat === 'json_object') {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle rate limits and payment issues
    if (response.status === 429) {
      throw new Error('RATE_LIMIT: Too many requests. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('NO_CREDITS: Add credits in Settings -> Workspace -> Usage.');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI] API error ${response.status}:`, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    console.log(`[AI] ✅ Response received in ${duration}ms`);
    console.log(`[AI] Tokens: ${data.usage?.total_tokens || 'N/A'}`);

    return {
      content,
      model,
      usage: data.usage
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`TIMEOUT: AI request exceeded ${timeout}ms`);
    }
    
    console.error('[AI] Error:', error);
    throw error;
  }
}

/**
 * Parse JSON response with error handling
 */
/**
 * Safely parse a JSON response from AI, with fallback
 * Handles markdown code blocks, Portuguese text prefixes, and malformed JSON
 */
export function parseJSONResponse<T>(content: string, fallback?: T): T {
  try {
    // 1. Remover markdown code blocks (```json ... ``` ou ``` ... ```)
    let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // 2. Remover texto em português comum antes do JSON
    cleaned = cleaned.replace(/^(Aqui está|Aqui estão|Segue|Conforme solicitado|Análise do documento)[^{]*/i, '');
    
    // 3. Tentar encontrar o primeiro { e o último }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    
    // 4. Tentar parsear
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[AI] JSON parse error:', error);
    console.error('[AI] Content (first 500 chars):', content.substring(0, 500));
    
    if (fallback !== undefined) {
      return fallback;
    }
    
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Standardized logging for AI operations
 */
export function logAIOperation(
  operation: string,
  data: Record<string, any>
) {
  console.log(`[AI-${operation.toUpperCase()}]`, JSON.stringify(data, null, 2));
}
