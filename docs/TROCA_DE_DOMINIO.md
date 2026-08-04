# Troca de domínio da PH10

Domínio principal planejado: `https://ph10.com.br`

O projeto não possui o endereço `*.vercel.app` gravado no código. As rotas
internas, APIs, cookies de autenticação, links do WhatsApp e validações de origem
usam caminhos relativos ou o domínio da própria requisição.

## 1. Antes de apontar o domínio

### Google Auth Platform

No cliente OAuth usado pelo Google Agenda, adicionar em **URIs de
redirecionamento autorizados**:

```text
https://ph10.com.br/api/google-calendar/callback
```

Manter o callback antigo da Vercel durante a transição. O Google exige
correspondência exata de protocolo, domínio, caminho e barra final.

### Supabase Auth

Em **Authentication > URL Configuration**:

- Site URL: `https://ph10.com.br`
- Redirect URL de produção: `https://ph10.com.br/**`
- Manter `http://localhost:3000/**` para desenvolvimento.
- Manter temporariamente o endereço antigo da Vercel, caso ele ainda seja usado.

O login atual usa e-mail e senha diretamente e não depende de redirect, mas essa
configuração deixa confirmação de e-mail e futura recuperação de senha prontas
para o domínio correto.

## 2. Configurar na Vercel

Em **Project > Settings > Domains**:

1. Adicionar `ph10.com.br`.
2. Adicionar `www.ph10.com.br`.
3. Configurar `ph10.com.br` como principal e redirecionar `www` para ele.
4. Aplicar no provedor do domínio os registros DNS exibidos pela Vercel.
5. Aguardar os dois domínios aparecerem como válidos e com HTTPS ativo.

As variáveis existentes do Supabase e do Google não mudam. Vincular um domínio
à Vercel aplica-o ao deployment de produção atual.

## 3. Testes no novo domínio

Executar nesta ordem:

1. Abrir `https://ph10.com.br/b/ph10` em aba anônima.
2. Confirmar foto, serviços, combos, dias e horários.
3. Fazer uma reserva de teste e confirmar que aparece na Agenda.
4. Confirmar que o evento aparece no Google Agenda.
5. Remarcar e verificar a atualização do evento.
6. Cancelar e verificar a remoção do evento.
7. Testar os links de WhatsApp.
8. Entrar em `https://ph10.com.br/login` com uma conta autorizada.
9. Conferir Agenda, Histórico, Clientes, Serviços, Perfil e Integrações.
10. Testar logout e novo login.

É esperado que o proprietário precise entrar novamente no domínio novo. Cookies
e sessões do endereço antigo não são compartilhados com outro domínio.

## 4. Depois da validação

- Divulgar somente `https://ph10.com.br/b/ph10` aos clientes.
- Manter o domínio antigo funcionando por alguns dias.
- Depois, redirecionar o endereço antigo para o domínio principal, se desejado.
- Manter o callback antigo do Google enquanto o endereço antigo aceitar acessos.
- Remover configurações antigas somente após confirmar que não há mais uso.

## Itens que não dependem do domínio

- Banco e Storage continuam no mesmo projeto Supabase.
- Dados existentes não são migrados nem apagados.
- Chaves da Vercel continuam iguais.
- Links `wa.me` continuam iguais.
- Sincronizações já conectadas ao Google continuam válidas.
- CSP e verificações de origem aceitam automaticamente o domínio da requisição.
- O projeto ainda não possui PWA/manifesto nem Cloudflare Turnstile, portanto não
  há hostname desses recursos para atualizar nesta troca.
