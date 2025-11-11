# 🚨 GUIA DE DEPLOY URGENTE - MAMA CRAFT

## 🎯 PROBLEMA IDENTIFICADO

**O banco de dados está funcionando perfeitamente!**
- ✅ Todas as tabelas foram criadas (26 tabelas)
- ✅ Edge Function está deployada e funcionando
- ✅ Supabase está ativo

**MAS o frontend ainda está com código antigo!**
- ❌ Erro: "Cannot coerce the result to a single JSON object"
- ❌ Causa: Código usa `.single()` em vez de `.maybeSingle()`
- ❌ **O Lovable NÃO fez deploy automático do GitHub!**

---

## 📋 CORREÇÕES JÁ FEITAS (no GitHub)

1. ✅ Edge Function reescrita do zero
2. ✅ Frontend corrigido (`.single()` → `.maybeSingle()`)
3. ✅ Função `consolidateAllExtractions` corrigida
4. ✅ Migrações do banco aplicadas

**Commits:**
- `0321275` - 🔧 FIX: Corrigir erro 'Cannot coerce'
- `9c9bed3` - 🚀 REESCRITA COMPLETA: Nova Edge Function
- `5d8880a` - 🔥 FIX CRÍTICO: Corrigir consolidação

---

## 🚀 COMO FAZER DEPLOY NO LOVABLE (PASSO A PASSO)

### OPÇÃO 1: Via Chat do Lovable (MAIS RÁPIDO)

1. **Abra o projeto no Lovable:**
   - Acesse: https://lovable.dev/projects/ea498b43-1095-4a90-bed1-e7469cef2a5d

2. **No chat do Lovable, digite EXATAMENTE:**
   ```
   Pull the latest changes from GitHub and deploy them
   ```

3. **Aguarde 2-3 minutos** para o deploy completar

4. **Teste novamente:**
   - Acesse: https://preview--mama-craft.lovable.app/caso/336050b4-20bc-440b-806f-f454e7241e4c
   - Recarregue com **CTRL+F5** (limpar cache)
   - Clique em **"Reprocessar"**
   - **Os indicadores DEVEM ficar verdes agora!** ✅

---

### OPÇÃO 2: Via Interface do Lovable

1. **Abra o projeto:**
   - https://lovable.dev/projects/ea498b43-1095-4a90-bed1-e7469cef2a5d

2. **Procure por um botão/menu:**
   - "Sync from GitHub"
   - "Pull changes"
   - "Deploy"
   - Ou ícone de sincronização ⟳

3. **Clique e aguarde** o deploy completar

4. **Teste conforme Opção 1**

---

### OPÇÃO 3: Via GitHub Actions (se disponível)

1. **Acesse o repositório:**
   - https://github.com/belidokeyla123-code/mama-craft

2. **Vá em "Actions"** (aba no topo)

3. **Procure por workflow de deploy** e execute manualmente

4. **Teste conforme Opção 1**

---

## 🧪 COMO TESTAR SE FUNCIONOU

### Teste 1: Verificar se erro sumiu
1. Acesse: https://preview--mama-craft.lovable.app/caso/336050b4-20bc-440b-806f-f454e7241e4c
2. Recarregue com **CTRL+F5**
3. **NÃO DEVE** aparecer erro vermelho "Cannot coerce the result to a single JSON object"

### Teste 2: Reprocessar documentos
1. No mesmo caso, clique em **"Reprocessar"**
2. Aguarde 30-60 segundos
3. **Os indicadores DEVEM ficar VERDES:**
   - 👶 Criança: ✅
   - 👤 Mãe: ✅
   - 🪪 CPF: ✅

### Teste 3: Criar novo caso
1. Vá em: https://preview--mama-craft.lovable.app/dashboard
2. Clique em **"+ Criar Novo Caso"**
3. Faça upload de documentos
4. **Os indicadores DEVEM ficar verdes automaticamente!**

---

## ❓ SE AINDA NÃO FUNCIONAR

### Verificar versão do código no navegador

1. **Abra o Console do navegador:**
   - Pressione **F12**
   - Vá na aba **"Console"**

2. **Digite e execute:**
   ```javascript
   console.log(document.querySelector('script[src*="main"]')?.src)
   ```

3. **Veja se tem um hash/versão diferente** após fazer o deploy

### Limpar cache completamente

1. **Chrome/Edge:**
   - Pressione **CTRL+SHIFT+DELETE**
   - Selecione "Imagens e arquivos em cache"
   - Clique em "Limpar dados"

2. **Ou use modo anônimo:**
   - **CTRL+SHIFT+N** (Chrome/Edge)
   - Acesse o site no modo anônimo

### Verificar se Lovable está conectado ao GitHub

1. No Lovable, vá em **"Settings"** ou **"Project Settings"**
2. Procure por **"GitHub Integration"** ou **"Repository"**
3. Verifique se está conectado a: `belidokeyla123-code/mama-craft`
4. Se não estiver, reconecte!

---

## 📞 SE NADA DISSO FUNCIONAR

**Me chame novamente e vou:**

1. ✅ Criar um script de deploy automatizado
2. ✅ Fazer deploy via API do Lovable (se disponível)
3. ✅ Verificar logs do Lovable para ver por que não está sincronizando
4. ✅ Criar uma build local e fazer upload manual

---

## 📊 RESUMO DO QUE FOI FEITO

### Backend (Supabase) ✅
- ✅ Projeto reativado (estava pausado 89 dias)
- ✅ Edge Function reescrita do zero e deployada
- ✅ 77 migrações aplicadas no banco de dados
- ✅ 26 tabelas criadas com sucesso
- ✅ Dados existentes preservados (56 cases, 64 documents, 70 extractions)

### Código (GitHub) ✅
- ✅ Frontend corrigido (`.single()` → `.maybeSingle()`)
- ✅ Função `consolidateAllExtractions` corrigida
- ✅ Edge Function simplificada e funcional
- ✅ 4 commits realizados com sucesso

### Deploy (Lovable) ❌
- ❌ **PENDENTE:** Lovable não sincronizou automaticamente
- ❌ **AÇÃO NECESSÁRIA:** Deploy manual via chat ou interface

---

## 🎯 PRÓXIMO PASSO

**FAÇA O DEPLOY NO LOVABLE AGORA!**

Use a **OPÇÃO 1** (chat do Lovable) que é a mais rápida e confiável.

Depois me avise se funcionou! 🚀
