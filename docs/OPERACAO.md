# GELADÃO · Implantação e operação

## Infraestrutura independente
- GitHub: villeimobiliario-debug/GELADAO
- Cloudflare Worker: geladao
- Supabase: projeto ugtypmwxptmlqabgugxv, separado do VILLE Imobiliário
- React + TypeScript + Vite; PostgreSQL com RLS em nove tabelas
- Pedidos e estoque registrados por funções transacionais: save_order, advance_delivery, cancel_order

## Como ativar o primeiro administrador
1. Acesse o site do GELADÃO no Cloudflare.
2. Na tela de login, use **Solicitar acesso** com e-mail válido e senha forte. Não envie senhas no chat.
3. Confirme o e-mail, se o Supabase solicitar.
4. O proprietário aprova o usuário, após conferir o e-mail no painel Authentication > Users. SQL:

~~~sql
insert into public.staff_profiles(user_id,display_name,role,active)
select id,split_part(email,'@',1),'admin',true
from auth.users
where email='SUBSTITUA_PELO_EMAIL_DO_ADMIN'
on conflict(user_id) do update set role='admin',active=true;
~~~

Para operadores: role='operador'. Somente pessoas verificadas e autorizadas devem receber perfil ativo.

## Funcionalidades integradas
- Login, permissões e cadastro de perfis
- Dashboard: vendas, lucro bruto dos produtos, ticket, pedidos, canais e filtros por período
- Produtos, categorias, preços de custo/venda e estoque opcional
- Clientes com endereços inteiramente opcionais
- Vendas Balcão/Delivery com desconto, pagamento e edição posterior
- Delivery Kanban: Pedidos, Entregues e Aguardando pagamento
- Histórico, exportação CSV, cancelamento (admin), impressão de cupom não fiscal 80 mm
- Atalhos de teclado, Enter e busca de cliente dentro da venda

## Cuidados de operação
- O primeiro usuário precisa ser criado e autorizado antes dos testes com vendas reais.
- O cupom impresso **não substitui** documento fiscal legalmente exigido.
- Impressão usa o diálogo do navegador; modo silencioso depende do modelo e de uma ponte local.
- Relatórios atualmente consultam até 5.000 pedidos recentes; para volumes maiores, implantar paginação/agregação SQL.
- Não foi implementada abertura/fechamento de caixa, por decisão da distribuidora.
- O lucro exibido calcula venda de itens menos custo de mercadorias e descontos; não é lucro líquido empresarial.
- Pagamento recebido é confirmado manualmente, sem conciliação bancária.
- Exige testes de ponta a ponta autenticados antes de produção, incluindo edição, estoques concorrentes e impressora.

## Proteções
- Nunca salvar senhas nem chaves secretas/service_role no repositório.
- O frontend usa apenas chave publicável; dados protegidos por RLS e regras do banco.
- Pedidos/estoque são alterados por funções transacionais e verificações de perfil.
- Atualizações usam controle de versão para impedir sobrescrita simultânea.
- Usuarios sem perfil ativo não têm autorização para consultar dados.
- Arquivo supabase/schema.sql é snapshot para um Supabase novo; não reaplicar no banco atual.
