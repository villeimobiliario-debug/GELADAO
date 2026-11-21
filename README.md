# GELADÃO · Sistema PDV

Sistema web para **uma única distribuidora de bebidas**. React + TypeScript + Supabase + Cloudflare Workers.

## Módulos
- Dashboard: vendas, lucro bruto dos produtos, canais, pedidos, tíquete médio e evolução mensal
- PDV Balcão: venda rápida com itens e meios de pagamento
- PDV Delivery: criação ágil, clientes/endereço opcionais e quadro Kanban de pedidos
- Produtos/categorias: preço de compra, venda e estoque opcional
- Clientes: busca, cadastro rápido e histórico de pedidos
- Relatórios: vendas, edição, cancelamento controlado, exportação CSV
- Configurações: estabelecimento, cupom e gerenciamento de usuários
- Impressão: cupom não fiscal em layout de 80 mm com impressão pelo navegador

## Arquitetura e publicação
- Repositório: https://github.com/villeimobiliario-debug/GELADAO
- Cloudflare Worker: https://geladao.villeimobiliario.workers.dev
- Banco exclusivo do GELADÃO: Supabase ugtypmwxptmlqabgugxv
- Build: npm run build
- Deploy: npx wrangler deploy
- Configuração Worker: wrangler.jsonc, assets.directory=./dist
- CI: .github/workflows/ci.yml
- Banco versionado: supabase/schema.sql

## Segurança
- Login necessário, solicitação de acesso sem autorização automática
- Administrador autoriza operadores pela tela Configurações; primeiro administrador precisa ser habilitado pelo proprietário no Supabase
- RLS em todas as tabelas públicas; acesso público sem permissão para consultar dados
- Venda e ajuste de produtos feitos em transações no banco, com auditoria
- Controle de versão evita sobrescrita de pedidos modificados por outro operador
- Chave publicável do Supabase no frontend; NUNCA enviar credenciais privadas ao GitHub

## Estado de implantação
A aplicação está implementada e com validação de build automatizada, mas requer ativação do primeiro usuário e testes funcionais autenticados antes de uso comercial. A emissão fiscal e a impressão térmica silenciosa não fazem parte desta versão.

Leia docs/OPERACAO.md para instruções detalhadas e limitações.
