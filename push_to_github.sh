#!/bin/bash

# Script para fazer push das correções para o GitHub
# Execute este script para enviar as mudanças

echo "🚀 Fazendo push das correções para o GitHub..."
echo ""

# Verificar se há mudanças para fazer push
if git diff-index --quiet HEAD --; then
    echo "✅ Não há mudanças locais para fazer push"
    echo "📊 Verificando se há commits para enviar..."
fi

# Fazer push
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Push realizado com sucesso!"
    echo "🎉 As correções foram enviadas para o GitHub!"
    echo ""
    echo "Próximos passos:"
    echo "1. Acesse o Lovable"
    echo "2. Sincronize com o GitHub (botão 'Sync from GitHub')"
    echo "3. Aguarde o deploy completar"
    echo "4. Teste o app!"
else
    echo ""
    echo "❌ Erro ao fazer push"
    echo "Você precisa autenticar com o GitHub primeiro"
    echo ""
    echo "Opções:"
    echo "1. Use um token de acesso pessoal"
    echo "2. Configure SSH keys"
    echo "3. Ou faça o push manualmente pelo GitHub Desktop"
fi
