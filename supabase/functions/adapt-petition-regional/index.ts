import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema for adapt-petition-regional
const adaptRegionalSchema = z.object({
  petition: z.string().min(100, 'Petição muito curta').max(500000, 'Petição muito longa'),
  estado: z.string().length(2, 'UF deve ter 2 caracteres').toUpperCase(),
  caseId: z.string().uuid().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validated = adaptRegionalSchema.parse(body);
    const { petition, estado } = validated;

    // Mapear estado para TRF
    const trfMap: Record<string, { trf: string, estados: string[] }> = {
      'TRF1': { trf: 'TRF1', estados: ['AC', 'AM', 'AP', 'BA', 'DF', 'GO', 'MA', 'MG', 'MT', 'PA', 'PI', 'RO', 'RR', 'TO'] },
      'TRF2': { trf: 'TRF2', estados: ['RJ', 'ES'] },
      'TRF3': { trf: 'TRF3', estados: ['SP', 'MS'] },
      'TRF4': { trf: 'TRF4', estados: ['RS', 'SC', 'PR'] },
      'TRF5': { trf: 'TRF5', estados: ['PE', 'AL', 'CE', 'PB', 'RN', 'SE'] },
      'TRF6': { trf: 'TRF6', estados: ['MG'] } // TRF6 foi criado recentemente
    };

    let trfIdentificado = 'TRF1'; // default
    for (const [trf, data] of Object.entries(trfMap)) {
      if (data.estados.includes(estado?.toUpperCase())) {
        trfIdentificado = trf;
        break;
      }
    }

    const prompt = `Você é um especialista em adaptação de petições para tribunais regionais.

**⚠️ REGRA CRÍTICA - NÃO VIOLE ISSO:**
O TRF COMPETENTE JÁ FOI IDENTIFICADO E VALIDADO COM BASE NO ESTADO.
- Estado: ${estado}
- TRF Competente: ${trfIdentificado}

**VOCÊ DEVE USAR OBRIGATORIAMENTE O "${trfIdentificado}" NO JSON DE RESPOSTA**
**NÃO MODIFIQUE O TRF! NÃO INVENTE OUTRO TRF! NÃO FAÇA SUPOSIÇÕES!**

**REGRAS IMUTÁVEIS:**
1. Rondônia (RO) → TRF1 (NUNCA TRF3)
2. Acre (AC) → TRF1
3. Amazonas (AM) → TRF1
4. Bahia (BA) → TRF1
5. Distrito Federal (DF) → TRF1
6. Goiás (GO) → TRF1
7. Maranhão (MA) → TRF1
8. Minas Gerais (MG) → TRF1
9. Mato Grosso (MT) → TRF1
10. Pará (PA) → TRF1
11. Piauí (PI) → TRF1
12. Roraima (RR) → TRF1
13. Tocantins (TO) → TRF1
14. Rio de Janeiro (RJ) → TRF2
15. Espírito Santo (ES) → TRF2
16. São Paulo (SP) → TRF3
17. Mato Grosso do Sul (MS) → TRF3
18. Rio Grande do Sul (RS) → TRF4
19. Santa Catarina (SC) → TRF4
20. Paraná (PR) → TRF4
21. Pernambuco (PE) → TRF5
22. Alagoas (AL) → TRF5
23. Ceará (CE) → TRF5
24. Paraíba (PB) → TRF5
25. Rio Grande do Norte (RN) → TRF5
26. Sergipe (SE) → TRF5

PETIÇÃO ATUAL:
${petition}

TAREFA: 
1. Identifique o estilo e preferências do ${trfIdentificado} (${estado}):
   - Como os juízes desta região pensam
   - Argumentos que mais funcionam no ${trfIdentificado}
   - Jurisprudências locais prioritárias do ${trfIdentificado}
   - Linguagem preferida pelos magistrados do ${trfIdentificado}

2. Retorne JSON com esta estrutura EXATA:
{
  "trf": "${trfIdentificado}",  // ⚠️ USE EXATAMENTE ESTE VALOR! NÃO MUDE!
  "tendencias": [
    "Tendência 1 do ${trfIdentificado} para ${estado}",
    "Tendência 2 do ${trfIdentificado} para ${estado}"
  ],
  "estilo_preferido": "Descrição do estilo argumentativo do ${trfIdentificado}",
  "jurisprudencias_locais_sugeridas": [
    {
      "numero": "Processo do ${trfIdentificado}",
      "tese": "Tese fixada",
      "motivo": "Por que é importante para ${estado}"
    }
  ],
  "adaptacoes_sugeridas": [
    {
      "secao": "Dos Fatos" | "Do Direito" | "Dos Pedidos",
      "adaptacao": "Como adaptar esta seção para o ${trfIdentificado} (${estado})",
      "justificativa": "Por que esta adaptação funciona melhor no ${trfIdentificado}"
    }
  ],
  "petition_adaptada": "Petição completa adaptada para o ${trfIdentificado}"
}

**LEMBRE-SE: O CAMPO "trf" DEVE SER EXATAMENTE "${trfIdentificado}"**
**SE VOCÊ RETORNAR OUTRO TRF, ESTARÁ CAUSANDO UM ERRO GRAVE QUE PODE PROTOCOLAR A PETIÇÃO NO TRIBUNAL ERRADO!**

IMPORTANTE: Mantenha a estrutura e argumentos principais, apenas adapte o estilo e priorize jurisprudências locais do ${trfIdentificado}.

⚠️⚠️⚠️ REGRAS CRÍTICAS DE CONDUTA ⚠️⚠️⚠️
1. **NÃO INVENTE INFORMAÇÕES:** Use APENAS os dados fornecidos acima
2. **SEJA EXTREMAMENTE CAUTELOSO:** Se não tiver certeza, indique "a verificar"
3. **NÃO FAÇA SUPOSIÇÕES:** Não presuma dados não fornecidos
4. **VALIDAÇÃO RIGOROSA:** TRF identificado deve ser mantido
5. **NÃO INVENTE JURISPRUDÊNCIAS:** Use apenas as que você conhece com certeza`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const adaptation = JSON.parse(aiData.choices[0].message.content);

    // 🆕 VALIDAÇÃO TRIPLA: Garantir que a IA não mudou o TRF
    if (adaptation.trf !== trfIdentificado) {
      console.error(`[ADAPT-REGIONAL] ❌ IA RETORNOU TRF INCORRETO!`, {
        esperado: trfIdentificado,
        recebido: adaptation.trf,
        estado
      });
      
      // FORÇAR TRF CORRETO (sobrescrever resposta da IA)
      adaptation.trf = trfIdentificado;
      console.log(`[ADAPT-REGIONAL] ✅ TRF corrigido para ${trfIdentificado}`);
    }

    console.log(`[ADAPT-REGIONAL] ✅ TRF validado: ${adaptation.trf} (Estado: ${estado})`);

    return new Response(JSON.stringify(adaptation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in adapt-petition-regional:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});