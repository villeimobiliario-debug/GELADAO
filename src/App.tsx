import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent as ReactKey,FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase as sb} from './supabase';

type Page='dashboard'|'balcao'|'delivery'|'fiados'|'produtos'|'clientes'|'relatorios'|'config';
type Staff={user_id:string;role:'admin'|'operador';active:boolean;display_name:string};
type Cat={id:number;name:string;active:boolean};
type Product={id:string;category_id:number|null;name:string;sku:string|null;barcode:string|null;unit:string;purchase_price:number;sale_price:number;track_stock:boolean;stock_qty:number;min_stock:number;active:boolean};
type Customer={id:string;name:string|null;phone:string|null;street:string|null;neighborhood:string|null;house_number:string|null;complement:string|null;active:boolean};
type Order={id:string;order_number:number;channel:'delivery'|'balcao';stage:'pedidos'|'entregues'|'aguardando_pagamento';status:string;version:number;customer_id:string|null;customer_name:string|null;customer_phone:string|null;street:string|null;neighborhood:string|null;house_number:string|null;complement:string|null;note:string|null;subtotal:number;delivery_fee:number;discount:number;total:number;cost_total:number;payment_method:string;payment_status:'paid'|'pending';collect_on_delivery:boolean;delivery_collection_amount:number|null;sold_at:string;created_at:string;delivered_at:string|null};
type CreditBalance={id:string;order_id:string;customer_id:string;credit_amount:number;paid_amount:number;balance:number;created_at:string;created_by:string;order_number:number;total:number;sold_at:string;order_note:string|null;order_status:string};
type CreditReceipt={id:string;customer_id:string;amount:number;method:'dinheiro'|'pix'|'cartao';note:string|null;request_id:string;received_at:string;created_by:string};
type CreditAllocation={receipt_id:string;credit_sale_id:string;amount:number};
type CreditOrderItem={id:string;product_name:string;quantity:number;unit_price:number;line_total:number};
type Line={product:Product;quantity:number;unit_price:number};
type Form={customer_id:string;customer_name:string;customer_phone:string;street:string;neighborhood:string;house_number:string;complement:string;note:string;delivery_fee:string;discount:string;payment_method:string;paid:boolean;collect_on_delivery:boolean;delivery_collection_amount:string};
type Settings={store_name:string;store_subtitle:string;store_phone:string|null;store_address:string|null;receipt_footer:string|null;auto_print:boolean};
const tabs:[Page,string,string][]=[['dashboard','Dashboard','▦'],['balcao','PDV Balcão','▤'],['delivery','PDV Delivery','▥'],['fiados','Fiados','▧'],['produtos','Produtos','◫'],['clientes','Clientes','♙'],['relatorios','Relatórios','▧'],['config','Configurações','⚙']];
const initialForm:Form={customer_id:'',customer_name:'',customer_phone:'',street:'',neighborhood:'',house_number:'',complement:'',note:'',delivery_fee:'0',discount:'0',payment_method:'nao_informado',paid:false,collect_on_delivery:false,delivery_collection_amount:''};
const paymentLabels:{[key:string]:string}={nao_informado:'Não informado',dinheiro:'Dinheiro',pix:'Pix',cartao:'Cartão',misto:'Misto',conta:'Conta / Fiado'};
const cash=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'});
const day=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const shortDay=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const number=(s:string)=>Number(String(s||0).trim().replace(',','.'));
const escapeHtml=(x:unknown)=>String(x??'').replace(/[&<>"']/g,a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]||a));
function newForm(c?:Customer):Form{return {...initialForm,customer_id:c?.id||'',customer_name:c?.name||'',customer_phone:c?.phone||'',street:c?.street||'',neighborhood:c?.neighborhood||'',house_number:c?.house_number||'',complement:c?.complement||''}}

type CounterMethod='dinheiro'|'pix'|'cartao'|'conta';
type CounterPayment={method:CounterMethod;amount:number;tendered_amount:number|null};
type CounterPayStage='choose'|'cash'|'confirm'|'split'|'account';
function paymentCents(input:string):number|null{
 const v=input.trim().replace(',','.');
 if(!/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(v))return null;
 const result=Math.round(Number(v)*100);
 return Number.isSafeInteger(result)&&result>=0&&result<=99999999?result:null;
}

function CreditCustomerPicker({customers,selectedId,onSelect,balances}:{
 customers:Customer[];selectedId:string|null;onSelect:(id:string|null)=>void;balances:Record<string,number>
}){
 const [search,setSearch]=useState('');
 const [highlight,setHighlight]=useState(0);
 const ref=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!selectedId)ref.current?.focus()},[selectedId]);
 const selected=customers.find(c=>c.id===selectedId);
 const term=search.trim().toLocaleLowerCase('pt-BR');
 const digits=search.replace(/\D/g,'');
 const matches=term?customers.filter(c=>c.active&&(
  (c.name||'').toLocaleLowerCase('pt-BR').includes(term)||
  String(c.phone||'').replace(/\D/g,'').includes(digits.length>=2?digits:'__not_found__')
 )).slice(0,8):[];
 const choose=(c:Customer)=>{onSelect(c.id);setSearch('');setHighlight(0)};
 return <div className="counter-credit-picker">
  {selected?<div className="counter-credit-selected">
   <div><small>CLIENTE CADASTRADO</small><strong>{selected.name||'Sem nome'} · {selected.phone||'Sem telefone'}</strong>
    <span>Saldo anterior: {cash(balances[selected.id]||0)}</span></div>
   <button type="button" onClick={()=>onSelect(null)}>Trocar cliente</button>
  </div>:<>
   <label htmlFor="counter-credit-search">Buscar cliente cadastrado · nome ou telefone</label>
   <input ref={ref} id="counter-credit-search" type="search" autoComplete="off"
    placeholder="Digite nome ou telefone, setas e Enter"
    value={search} onChange={e=>{setSearch(e.target.value);setHighlight(0)}}
    onKeyDown={e=>{
     if(e.key==='ArrowDown'&&matches.length){e.preventDefault();e.stopPropagation();setHighlight(i=>Math.min(i+1,matches.length-1));return}
     if(e.key==='ArrowUp'&&matches.length){e.preventDefault();e.stopPropagation();setHighlight(i=>Math.max(i-1,0));return}
     if(e.key==='Enter'){
      e.preventDefault();e.stopPropagation();
      if(matches[highlight])choose(matches[highlight]);
     }
    }}/>
   {term&&<div className="counter-credit-matches" role="listbox" aria-label="Clientes cadastrados">
    {matches.map((c,i)=><button key={c.id} type="button" role="option"
     aria-selected={i===highlight} className={i===highlight?'selected':''}
     onClick={()=>choose(c)}>
     <span><strong>{c.name||'Sem nome'}</strong><small>{c.phone||'Sem telefone'}</small></span>
     <span>{cash(balances[c.id]||0)} em aberto</span>
    </button>)}
    {!matches.length&&<p>Nenhum cliente encontrado. Cadastre-o primeiro na aba Clientes.</p>}
   </div>}
  </>}
 </div>;
}

function CounterCheckoutDialog({total,discount,onDiscountChange,onClose,onConfirm,busy,externalError,customers,balances,defaultCustomerId}:{
 total:number;discount:string;onDiscountChange:(value:string)=>void;onClose:()=>void;
 onConfirm:(lines:CounterPayment[],customerId?:string)=>void;busy:boolean;externalError:string;
 customers:Customer[];balances:Record<string,number>;defaultCustomerId:string;
}){
 const [stage,setStage]=useState<CounterPayStage>('choose');
 const [selected,setSelected]=useState<CounterMethod|null>(null);
 const [cashReceived,setCashReceived]=useState('');
 const [creditCustomerId,setCreditCustomerId]=useState<string|null>(defaultCustomerId&&customers.some(c=>c.id===defaultCustomerId&&c.active)?defaultCustomerId:null);
 const [splitLines,setSplitLines]=useState<CounterPayment[]>([]);
 const [splitMethod,setSplitMethod]=useState<CounterMethod|null>(null);
 const [splitAmount,setSplitAmount]=useState('');
 const [splitTendered,setSplitTendered]=useState('');
 const [error,setError]=useState('');
 const dialogRef=useRef<HTMLDivElement>(null),cashRef=useRef<HTMLInputElement>(null),splitRef=useRef<HTMLInputElement>(null);
 const totalCents=Math.round(total*100);
 const remaining=totalCents-splitLines.reduce((sum,p)=>sum+Math.round(p.amount*100),0);
 const cashCents=cashReceived.trim()?paymentCents(cashReceived):totalCents;
 const cashChange=cashCents===null?null:cashCents-totalCents;
 const payNames:Record<CounterMethod,string>={dinheiro:'Dinheiro',pix:'Pix',cartao:'Cartão',conta:'Conta / Fiado'};
 useEffect(()=>{setStage('choose');setSelected(null);setSplitLines([]);setSplitMethod(null);setSplitAmount('');setError('')},[total]);
 useEffect(()=>{
  if(stage==='cash')cashRef.current?.focus();
  else if(stage==='split'&&splitMethod==='conta'&&!creditCustomerId)dialogRef.current?.focus();
  else if(stage==='split'&&splitMethod)splitRef.current?.focus();
  else dialogRef.current?.focus();
 },[stage,splitMethod]);
 useEffect(()=>{
  if(!creditCustomerId)return;
  if(stage==='account')dialogRef.current?.focus();
  if(stage==='split'&&splitMethod==='conta')splitRef.current?.focus();
 },[creditCustomerId,stage,splitMethod]);
 const chooseMethod=(method:CounterMethod)=>{
  if(busy)return;
  setSelected(method);setError('');
  if(method==='dinheiro'){setCashReceived('');setStage('cash')}
  else if(method==='conta')setStage('account');
  else setStage('confirm');
 };
 const startSplit=()=>{
  if(busy)return;
  setSelected(null);setSplitLines([]);setSplitMethod(null);setSplitAmount('');setSplitTendered('');setError('');setStage('split');
 };
 const addSplit=()=>{
  if(busy||!splitMethod)return;
  if(splitMethod==='conta'&&!creditCustomerId){setError('Selecione um cliente cadastrado para a parcela fiada.');return}
  if(splitLines.length>=8){setError('Limite de oito parcelas por venda.');return}
  const amount=splitAmount.trim()?paymentCents(splitAmount):remaining;
  if(amount===null||amount<=0||amount>remaining){setError('Valor inválido: informe até o restante da venda.');return}
  let tendered:number|null=null;
  if(splitMethod==='dinheiro'&&splitTendered.trim()){
   tendered=paymentCents(splitTendered);
   if(tendered===null||tendered<amount){setError('O dinheiro entregue deve cobrir a parcela.');return}
  }
  setSplitLines(prev=>[...prev,{method:splitMethod,amount:amount/100,tendered_amount:tendered===null?null:tendered/100}]);
  setSplitMethod(null);setSplitAmount('');setSplitTendered('');setError('');
 };
 const confirm=()=>{
  if(busy)return;
  if(!Number.isFinite(total)||totalCents<=0||totalCents>99999999){setError('O total precisa ser maior que zero e inferior a R$ 1 milhão.');return}
  if(stage==='confirm'&&selected){onConfirm([{method:selected,amount:totalCents/100,tendered_amount:null}]);return}
  if(stage==='account'){
   if(!creditCustomerId){setError('Selecione um cliente cadastrado para anotar na Conta.');return}
   onConfirm([{method:'conta',amount:totalCents/100,tendered_amount:null}],creditCustomerId);return;
  }
  if(stage==='cash'){
   if(cashCents===null||cashCents<totalCents){setError('Informe um valor recebido suficiente.');return}
   onConfirm([{method:'dinheiro',amount:totalCents/100,tendered_amount:cashReceived.trim()?cashCents/100:null}]);return;
  }
  if(stage==='split'){
   if(splitMethod){addSplit();return}
   if(remaining!==0||splitLines.length<2||new Set(splitLines.map(p=>p.method)).size<2){
    setError('Distribua todo o total entre pelo menos duas formas diferentes.');return;
   }
   if(splitLines.some(p=>p.method==='conta')&&!creditCustomerId){setError('Selecione o cliente da Conta.');return}
   onConfirm(splitLines,creditCustomerId||undefined);
  }
 };
 const keys=(e:ReactKey<HTMLDivElement>)=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose();return}
  if(e.key==='Tab'){
   const focusable=[...dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]];
   if(focusable.length){
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){e.preventDefault();last.focus();return}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();return}
   }
  }
  if(busy)return;
  if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();e.stopPropagation();confirm();return}
  const input=(e.target as HTMLElement).tagName==='INPUT';
  if(stage==='choose'&&!input&&['1','2','3','4','5'].includes(e.key)){
   e.preventDefault();e.stopPropagation();
   if(e.key==='4')startSplit();
   else chooseMethod(({1:'dinheiro',2:'pix',3:'cartao',5:'conta'} as Record<string,CounterMethod>)[e.key]);
   return;
  }
  if(stage==='split'&&!splitMethod&&!input&&['1','2','3','4'].includes(e.key)){
   e.preventDefault();e.stopPropagation();
   setSplitMethod(({1:'dinheiro',2:'pix',3:'cartao',4:'conta'} as Record<string,CounterMethod>)[e.key]);setError('');
   return;
  }
  if(stage==='split'&&!splitMethod&&!input&&e.key==='Backspace'&&splitLines.length){
   e.preventDefault();e.stopPropagation();setSplitLines(prev=>prev.slice(0,-1));setError('');return;
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.stopPropagation();confirm()}
 };
 return <div className="counter-pay-overlay">
  <div className="counter-pay-dialog" role="dialog" aria-modal="true" aria-label="Finalizar venda"
   tabIndex={-1} ref={dialogRef} onKeyDown={keys}>
   <header className="counter-pay-header"><div><small>GELADÃO · FRENTE DE CAIXA</small><h2>Finalizar venda</h2></div>
    <button type="button" aria-label="Voltar à venda" onClick={onClose} disabled={busy}>×</button></header>
   <div className="counter-pay-total"><span>TOTAL A PAGAR</span><strong>{cash(total)}</strong></div>
   <div className="counter-pay-discount"><label htmlFor="counter-discount">Desconto (R$)</label>
    <input id="counter-discount" type="number" min="0" step=".01" disabled={busy} value={discount}
     onChange={e=>onDiscountChange(e.target.value)}/></div>
   {stage==='choose'&&<section className="counter-pay-body"><h3>Forma de pagamento</h3>
    <div className="counter-pay-options">
     <button type="button" onClick={()=>chooseMethod('dinheiro')}><kbd>1</kbd><span>▤</span><strong>Dinheiro</strong></button>
     <button type="button" onClick={()=>chooseMethod('pix')}><kbd>2</kbd><span>▦</span><strong>Pix</strong></button>
     <button type="button" onClick={()=>chooseMethod('cartao')}><kbd>3</kbd><span>▣</span><strong>Cartão</strong></button>
     <button type="button" onClick={startSplit}><kbd>4</kbd><span>⇄</span><strong>Dividir pagamento</strong></button>
     <button type="button" onClick={()=>chooseMethod('conta')} className="counter-pay-account-option"><kbd>5</kbd><span>▧</span><strong>Conta — Fiado</strong><small>Anotar na conta de cliente cadastrado</small></button>
    </div>
    <p className="counter-pay-hint">Digite 1, 2, 3, 4 ou 5. Fiados exigem cliente cadastrado e não entram como recebidos.</p>
   </section>}
   {stage==='confirm'&&<section className="counter-pay-body counter-pay-ready">
    <h3>{selected?payNames[selected]:''}</h3><p>Pagamento integral de <strong>{cash(total)}</strong></p>
    <p className="counter-pay-hint">Confirme o recebimento antes de registrar a venda.</p>
    <button type="button" className="counter-pay-finish" onClick={confirm} disabled={busy}>{busy?'Salvando...':'Confirmar pagamento · Enter'}</button>
    <button type="button" className="counter-pay-back" onClick={()=>setStage('choose')} disabled={busy}>Alterar forma</button>
   </section>}
   {stage==='account'&&<section className="counter-pay-body counter-pay-account">
    <h3>Conta · Anotar fiado</h3>
    <p className="counter-pay-hint">Escolha o cliente cadastrado para lançar a compra na conta. Este valor ficará a receber.</p>
    <CreditCustomerPicker customers={customers} selectedId={creditCustomerId} onSelect={setCreditCustomerId} balances={balances}/>
    {creditCustomerId&&<div className="counter-credit-preview"><span>Novo saldo devedor</span>
      <strong>{cash((balances[creditCustomerId]||0)+total)}</strong>
      <small>Compra atual: {cash(total)} · não recebida</small></div>}
    <button type="button" className="counter-pay-finish" onClick={confirm} disabled={busy||!creditCustomerId}>{busy?'Salvando...':'Anotar na Conta · Enter'}</button>
    <button type="button" className="counter-pay-back" onClick={()=>setStage('choose')} disabled={busy}>Alterar forma de pagamento</button>
   </section>}
   {stage==='cash'&&<section className="counter-pay-body counter-pay-cash"><h3>Pagamento em dinheiro</h3>
    <label htmlFor="counter-cash-received">Valor entregue pelo cliente (R$)</label>
    <input id="counter-cash-received" ref={cashRef} autoComplete="off" inputMode="decimal" disabled={busy}
     placeholder={cash(total)} value={cashReceived} onChange={e=>{setCashReceived(e.target.value);setError('')}}/>
    <div className="counter-pay-change"><span>Troco</span><strong>{cash(cashChange===null||cashChange<0?0:cashChange/100)}</strong></div>
    <p className="counter-pay-hint">Valor vazio = pagamento exato. Digite o recebido e pressione Enter.</p>
    <button type="button" className="counter-pay-finish" onClick={confirm} disabled={busy}>{busy?'Salvando...':'Confirmar dinheiro · Enter'}</button>
    <button type="button" className="counter-pay-back" onClick={()=>setStage('choose')} disabled={busy}>Alterar forma</button>
   </section>}
   {stage==='split'&&<section className="counter-pay-body counter-pay-split"><h3>Dividir pagamento</h3>
    <div className="counter-pay-remaining"><span>Restante a pagar</span><strong>{cash(Math.max(0,remaining)/100)}</strong></div>
    {splitLines.length>0&&<div className="counter-pay-lines">{splitLines.map((line,i)=><div key={i}>
     <span>{i+1}. {payNames[line.method]}</span><strong>{cash(line.amount)}</strong>
     <button type="button" aria-label={'Remover parcela '+(i+1)}
      onClick={()=>{setSplitLines(v=>v.filter((_,j)=>j!==i));setError('')}}>×</button>
    </div>)}</div>}
    {remaining>0&&<div className="counter-pay-pick"><p>Próxima forma · teclas 1, 2, 3 ou 4 (Conta)</p>
     <div>{(['dinheiro','pix','cartao','conta'] as CounterMethod[]).map((v,i)=><button key={v} type="button"
       className={v===splitMethod?'selected':''} onClick={()=>{setSplitMethod(v);setError('')}}><kbd>{i+1}</kbd> {payNames[v]}</button>)}</div>
    </div>}
    {splitMethod&&remaining>0&&<div className="counter-pay-entry">
      <label htmlFor="counter-split-amount">Valor em {payNames[splitMethod]} (R$)</label>
      <input id="counter-split-amount" ref={splitRef} inputMode="decimal" autoComplete="off" disabled={busy}
       placeholder={cash(remaining/100)} value={splitAmount} onChange={e=>{setSplitAmount(e.target.value);setError('')}}/>
      {splitMethod==='dinheiro'&&<><label htmlFor="counter-split-received">Dinheiro entregue (opcional)</label>
       <input id="counter-split-received" inputMode="decimal" autoComplete="off" disabled={busy}
        placeholder="Em branco = valor exato" value={splitTendered} onChange={e=>setSplitTendered(e.target.value)}/></>}
      {splitMethod==='conta'&&<CreditCustomerPicker customers={customers} selectedId={creditCustomerId} onSelect={setCreditCustomerId} balances={balances}/>}
      <button type="button" className="counter-pay-add" onClick={addSplit} disabled={busy}>Adicionar parcela · Enter</button>
    </div>}
    {remaining===0&&<div className="counter-pay-complete"><strong>Pagamento completo!</strong><p>Enter confirma a venda.</p></div>}
    <div className="counter-pay-split-actions"><button type="button" className="counter-pay-back" disabled={busy} onClick={()=>setStage('choose')}>Voltar</button>
     {remaining===0&&<button type="button" className="counter-pay-finish" onClick={confirm} disabled={busy}>{busy?'Salvando...':'Finalizar · Enter'}</button>}</div>
    <p className="counter-pay-hint">Digite a forma, o valor e Enter. Valor vazio usa o saldo restante. Backspace desfaz a última parcela.</p>
   </section>}
   {(error||externalError)&&<p className="counter-pay-error" role="alert">{error||externalError}</p>}
   <footer className="counter-pay-footer"><span>Esc · Voltar</span><span>Enter · Avançar / Confirmar</span></footer>
  </div>
 </div>;
}

function App(){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false);
 const [staff,setStaff]=useState<Staff|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 const [authMode,setAuthMode]=useState<'login'|'forgot'|'recovery'>(new URLSearchParams(window.location.search).get('recover')==='1'?'recovery':'login');
 const [newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
 const [page,setPage]=useState<Page>('dashboard'),[menu,setMenu]=useState(false),[mobile,setMobile]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
 const [staffMembers,setStaffMembers]=useState<Staff[]>([]),[memberEmail,setMemberEmail]=useState(''),[memberRole,setMemberRole]=useState('operador'),[memberActive,setMemberActive]=useState(true);
 const [cats,setCats]=useState<Cat[]>([]),[products,setProducts]=useState<Product[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[orders,setOrders]=useState<Order[]>([]);
 const [creditBalances,setCreditBalances]=useState<CreditBalance[]>([]),[creditReceipts,setCreditReceipts]=useState<CreditReceipt[]>([]),[creditAllocations,setCreditAllocations]=useState<CreditAllocation[]>([]);
 const [creditSearch,setCreditSearch]=useState(''),[creditSelectedCustomer,setCreditSelectedCustomer]=useState<string|null>(null);
 const [creditPaymentAmount,setCreditPaymentAmount]=useState(''),[creditPaymentMethod,setCreditPaymentMethod]=useState<'dinheiro'|'pix'|'cartao'>('pix'),[creditPaymentNote,setCreditPaymentNote]=useState(''),[creditPaymentBusy,setCreditPaymentBusy]=useState(false),[creditPaymentError,setCreditPaymentError]=useState('');
 const [creditOrderItems,setCreditOrderItems]=useState<CreditOrderItem[]>([]),[creditOrderId,setCreditOrderId]=useState<string|null>(null),[creditItemsLoading,setCreditItemsLoading]=useState(false);
 const creditPaymentRequestId=useRef(crypto.randomUUID());
 const [settings,setSettings]=useState<Settings>({store_name:'GELADÃO',store_subtitle:'Distribuidora de Bebidas',store_phone:'',store_address:'',receipt_footer:'Obrigado pela preferência!',auto_print:false});
 const [period,setPeriod]=useState('hoje'),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const [query,setQuery]=useState(''),[customerQuery,setCustomerQuery]=useState(''),[orderQuery,setOrderQuery]=useState('');
 const [saleOpen,setSaleOpen]=useState(false),[saleChannel,setSaleChannel]=useState<'balcao'|'delivery'>('delivery'),[editing,setEditing]=useState<Order|null>(null);
 const [counterQty,setCounterQty]=useState('1'),[counterPaymentError,setCounterPaymentError]=useState(''),[counterError,setCounterError]=useState(''),[counterChoiceIndex,setCounterChoiceIndex]=useState(-1),[counterLastProductId,setCounterLastProductId]=useState<string|null>(null),[counterPendingProductId,setCounterPendingProductId]=useState<string|null>(null),[counterPaymentOpen,setCounterPaymentOpen]=useState(false),[counterClock,setCounterClock]=useState(()=>new Date());
 const [form,setForm]=useState<Form>(initialForm),[cart,setCart]=useState<Line[]>([]),[productSearch,setProductSearch]=useState(''),[customerSearch,setCustomerSearch]=useState(''),[customerChoiceIndex,setCustomerChoiceIndex]=useState(-1);
 const [newProduct,setNewProduct]=useState(false),[editProduct,setEditProduct]=useState<Product|null>(null);
 const [productForm,setProductForm]=useState({name:'',category_id:'',barcode:'',sku:'',unit:'UN',purchase_price:'0',sale_price:'0',track_stock:false,stock_qty:'0',min_stock:'0',active:true});
 const [newCustomer,setNewCustomer]=useState(false),[editCustomer,setEditCustomer]=useState<Customer|null>(null);
 const [custForm,setCustForm]=useState({name:'',phone:'',street:'',neighborhood:'',house_number:'',complement:''});
 const [catName,setCatName]=useState('');
 const searchRef=useRef<HTMLInputElement>(null);
 const counterSearchRef=useRef<HTMLInputElement>(null),counterQtyRef=useRef<HTMLInputElement>(null),counterCustomerRef=useRef<HTMLInputElement>(null),counterCustomerDetailsRef=useRef<HTMLDetailsElement>(null);
 const admin=staff?.role==='admin';
 const showError=(error:unknown)=>setNotice(error instanceof Error?error.message:String(error));
 const updateForm=(key:keyof Form,value:string|boolean)=>setForm(f=>({...f,[key]:value}));
 const loadStaff=useCallback(async(id:string)=>{const{data,error}=await sb.from('staff_profiles').select('user_id,role,active,display_name').eq('user_id',id).maybeSingle();if(error)showError(error.message);setStaff((data||null) as Staff|null)},[]);
 const refresh=useCallback(async()=>{setLoading(true);try{
  const [a,b,c,d,e,f,g,h,i]=await Promise.all([
    sb.from('categories').select('*').order('name'),
    sb.from('products').select('*').order('name'),
    sb.from('customers').select('*').order('name'),
    sb.from('orders').select('*').order('sold_at',{ascending:false}).limit(5000),
    sb.from('app_settings').select('*').eq('id',1).single(),
    sb.from('staff_profiles').select('*').order('created_at'),
    sb.from('credit_sale_balances').select('*').order('sold_at',{ascending:false}).limit(5000),
    sb.from('credit_receipts').select('*').order('received_at',{ascending:false}).limit(5000),
    sb.from('credit_receipt_allocations').select('*').limit(5000)
  ]);
  const err=a.error||b.error||c.error||d.error||e.error||f.error||g.error||h.error||i.error;if(err)throw err;
  setCats((a.data||[]) as Cat[]);setProducts((b.data||[]) as Product[]);setCustomers((c.data||[]) as Customer[]);setOrders((d.data||[]) as Order[]);setStaffMembers((f.data||[]) as Staff[]);
  setCreditBalances((g.data||[]) as CreditBalance[]);setCreditReceipts((h.data||[]) as CreditReceipt[]);setCreditAllocations((i.data||[]) as CreditAllocation[]);
  if(e.data)setSettings(e.data as Settings);
  if((d.data||[]).length>=5000)setNotice('Relatórios limitados aos últimos 5.000 pedidos. Consulte um administrador para exportação completa.');
 }catch(err){showError(err)}finally{setLoading(false)}},[]);
 useEffect(()=>{void sb.auth.getUser().then(({data})=>{setUser(data.user);setAuthReady(true)}).catch(err=>{showError(err);setAuthReady(true)});
 const {data:{subscription}}=sb.auth.onAuthStateChange((event,session)=>{
  setUser(session?.user||null);
  if(event==='PASSWORD_RECOVERY'){setAuthMode('recovery');setNotice('Defina uma nova senha para continuar.')}
 });return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(user){void loadStaff(user.id)}else setStaff(null)},[user?.id,loadStaff]);
 useEffect(()=>{if(staff?.active)void refresh()},[staff?.active,refresh]);
 useEffect(()=>{if(!staff?.active)return;
 const key=(e:KeyboardEvent)=>{
  if(e.key==='F1'&&!newProduct&&!newCustomer){
   e.preventDefault();
   if(busy)return;
   if(saleOpen&&saleChannel==='balcao'){
    setCounterPaymentOpen(false);
    counterSearchRef.current?.focus();
    return;
   }
   if(saleOpen){
    const hasUnsavedChanges=Boolean(editing||cart.length||Object.keys(initialForm).some(key=>form[key as keyof Form]!==initialForm[key as keyof Form]));
    if(hasUnsavedChanges&&!window.confirm('Descartar alterações desta venda e abrir o PDV Balcão?'))return;
   }
   setPage('balcao');
   openSale('balcao');
   window.requestAnimationFrame(()=>counterSearchRef.current?.focus());
   return;
  }
  if(e.key==='F2'&&!newProduct&&!newCustomer&&!counterPaymentOpen){
   e.preventDefault();
   if(saleOpen&&saleChannel==='balcao')startFreshCounter();
   else if(!saleOpen)openSale(page==='balcao'?'balcao':'delivery');
   return;
  }
  if(!saleOpen)return;
  if(e.key==='Escape'){e.preventDefault();if(saleChannel==='balcao'&&counterPaymentOpen){setCounterPaymentOpen(false);counterSearchRef.current?.focus()}else closeSale();return}
  if(saleChannel==='balcao'&&counterPaymentOpen)return;
  if(saleChannel==='balcao'){
   if(e.key==='F3'||e.key==='F4'){e.preventDefault();counterSearchRef.current?.focus();return}
   if(e.key==='F5'){e.preventDefault();const last=cart[cart.length-1];if(last&&window.confirm('Remover '+last.product.name+' da venda?'))changeQty(last.product.id,0);return}
   if(e.key==='F6'){e.preventDefault();if(!cart.length){setNotice('Adicione um produto antes de informar o pagamento.');return}setCounterPaymentError('');setCounterPaymentOpen(true);window.requestAnimationFrame(()=>document.getElementById('counter-discount')?.focus());return}
   if(e.key==='F7'){e.preventDefault();const last=orders.find(o=>o.channel==='balcao'&&o.status==='active');if(last)print(last);return}
   if(e.key==='F8'){e.preventDefault();if(!cart.length){setNotice('Adicione ao menos um produto antes de pagar.');return}setCounterPaymentError('');setCounterPaymentOpen(true);return}
  }else{
   if(e.key==='F4'){e.preventDefault();searchRef.current?.focus();return}
   if(e.key==='F6'){e.preventDefault();document.getElementById('delivery-street')?.focus();return}
   if(e.key==='F8'){e.preventDefault();document.getElementById('payment-method')?.focus();return}
  }
  if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();void saveSale()}
 };
 window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[saleOpen,saleChannel,page,form,cart,editing,staff?.active,busy,newProduct,newCustomer,counterPaymentOpen,orders]);
 useEffect(()=>{if(!saleOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[saleOpen]);
 useEffect(()=>{if(!saleOpen||saleChannel!=='balcao')return;setCounterClock(new Date());const timer=window.setInterval(()=>setCounterClock(new Date()),1000);return()=>window.clearInterval(timer)},[saleOpen,saleChannel]);
 useEffect(()=>{
  if(!saleOpen||saleChannel!=='balcao'||!editing)return;
  if(counterCustomerDetailsRef.current)counterCustomerDetailsRef.current.open=Boolean(editing.customer_name||editing.customer_phone||editing.note);
 },[saleOpen,saleChannel,editing?.id]);
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setNotice('');const{error}=await sb.auth.signInWithPassword({email:email.trim(),password});if(error)showError(error.message);setBusy(false)}
 async function requestPasswordReset(e:FormEvent){
  e.preventDefault();
  if(busy)return;
  const address=email.trim();
  if(!address){setNotice('Informe o e-mail cadastrado.');return}
  setBusy(true);setNotice('');
  try{
   const redirectTo=window.location.origin+'/?recover=1';
   const {error}=await sb.auth.resetPasswordForEmail(address,{redirectTo});
   if(error)throw error;
   setNotice('Se este e-mail estiver cadastrado, você receberá um link de recuperação. Verifique também o spam.');
  }catch(error){showError(error)}finally{setBusy(false)}
 }
 async function saveRecoveredPassword(e:FormEvent){
  e.preventDefault();if(busy)return;
  if(newPassword.length<8){setNotice('Crie uma senha de pelo menos 8 caracteres.');return}
  if(newPassword!==confirmPassword){setNotice('As senhas não são iguais.');return}
  setBusy(true);setNotice('');
  try{
   const {data:{user:recoveryUser},error:sessionError}=await sb.auth.getUser();
   if(sessionError||!recoveryUser)throw Error('O link expirou ou não foi validado. Solicite outro e-mail de recuperação.');
   const {error}=await sb.auth.updateUser({password:newPassword});
   if(error)throw error;
   await sb.auth.signOut();
   setNewPassword('');setConfirmPassword('');setPassword('');setAuthMode('login');
   window.history.replaceState(null,'',window.location.pathname);
   setNotice('Senha alterada com sucesso. Entre com sua nova senha.');
  }catch(error){showError(error)}finally{setBusy(false)}
 }
 async function requestAccess(){if(!email.trim()||password.length<8){setNotice('Informe e-mail e senha com pelo menos 8 caracteres.');return}setBusy(true);const {error}=await sb.auth.signUp({email:email.trim(),password});setNotice(error?error.message:'Solicitação criada. Confirme o e-mail, se solicitado; um administrador precisará autorizar o perfil.');setBusy(false)}
 async function logout(){await sb.auth.signOut();setStaff(null);setUser(null);setPage('dashboard')}
 function openSale(channel:'balcao'|'delivery'){setSaleChannel(channel);setEditing(null);setForm({...initialForm});setCart([]);setProductSearch('');setCustomerSearch('');setCustomerChoiceIndex(-1);setCounterQty('1');setCounterPaymentError('');setCounterError('');setCounterChoiceIndex(-1);setCounterLastProductId(null);setCounterPendingProductId(null);setCounterPaymentOpen(false);setNotice('');setSaleOpen(true)}
 function startFreshCounter(){
  if(busy)return;
  if((editing||cart.length||form.customer_name.trim()||form.customer_phone.trim()||form.note.trim()||number(form.discount)>0)&&!window.confirm('Descartar a venda atual e iniciar outra venda de balcão?'))return;
  openSale('balcao');
 }
 function closeSale(){
   if(busy)return;
   const hasUnsavedChanges=Boolean(editing||cart.length||Object.keys(initialForm).some(key=>form[key as keyof Form]!==initialForm[key as keyof Form]));
   if(hasUnsavedChanges&&!window.confirm('Descartar alterações desta venda?'))return;
   setSaleOpen(false);
 }
 
 async function receiveCredit(e:FormEvent){
  e.preventDefault();if(creditPaymentBusy||!creditSelectedCustomer)return;
  const amount=paymentCents(creditPaymentAmount);
  const balance=creditBalances.filter(v=>v.customer_id===creditSelectedCustomer).reduce((sum,v)=>sum+Math.round(Number(v.balance)*100),0);
  if(amount===null||amount<=0||amount>balance){
   setCreditPaymentError('Informe um valor positivo até o saldo em aberto.');return;
  }
  if(!window.confirm('Confirmar recebimento de '+cash(amount/100)+'? O valor será abatido da conta do cliente.'))return;
  setCreditPaymentBusy(true);setCreditPaymentError('');
  try{
   const {error}=await sb.rpc('receive_credit_payment',{
    p_customer_id:creditSelectedCustomer,p_amount:amount/100,
    p_method:creditPaymentMethod,p_request_id:creditPaymentRequestId.current,
    p_note:creditPaymentNote.trim()||null
   });
   if(error)throw error;
   creditPaymentRequestId.current=crypto.randomUUID();
   setCreditPaymentAmount('');setCreditPaymentNote('');
   setNotice('Recebimento registrado e saldo devedor atualizado.');
   await refresh();
  }catch(err){setCreditPaymentError(err instanceof Error?err.message:String(err))}
  finally{setCreditPaymentBusy(false)}
 }
 async function loadCreditItems(id:string){
  setCreditOrderId(id);setCreditOrderItems([]);setCreditItemsLoading(true);
  try{
   const {data,error}=await sb.from('order_items').select('id,product_name,quantity,unit_price,line_total').eq('order_id',id);
   if(error)throw error;
   setCreditOrderItems((data||[]) as CreditOrderItem[]);
  }catch(err){showError(err)}
  finally{setCreditItemsLoading(false)}
 }
async function editSale(o:Order){if(creditBalances.some(x=>x.order_id===o.id)){setNotice('Venda fiada protegida: confira as compras e recebimentos na aba Fiados.');setPage('fiados');setCreditSelectedCustomer(o.customer_id);return}setLoading(true);try{const {data,error}=await sb.from('order_items').select('*').eq('order_id',o.id);if(error)throw error;
  const lines:Line[]=[];for(const item of data||[]){const p=products.find(v=>v.id===item.product_id);if(p)lines.push({product:p,quantity:Number(item.quantity),unit_price:Number(item.unit_price)})}
  if(lines.length!==(data||[]).length)throw Error('Produto de algum item não está disponível no cadastro.');
  setSaleChannel(o.channel);setEditing(o);setForm({customer_id:o.customer_id||'',customer_name:o.customer_name||'',customer_phone:o.customer_phone||'',street:o.street||'',neighborhood:o.neighborhood||'',house_number:o.house_number||'',complement:o.complement||'',note:o.note||'',delivery_fee:String(o.delivery_fee),discount:String(o.discount),payment_method:o.payment_method,paid:o.payment_status==='paid',collect_on_delivery:o.collect_on_delivery||false,delivery_collection_amount:o.delivery_collection_amount==null?'':String(o.delivery_collection_amount)});setCart(lines);setProductSearch('');setCustomerSearch('');setCounterQty('1');setCounterPaymentError('');setCounterError('');setCounterChoiceIndex(-1);setCounterLastProductId(lines.length?lines[lines.length-1].product.id:null);setCounterPendingProductId(null);setCounterPaymentOpen(false);setSaleOpen(true)
 }catch(err){showError(err)}finally{setLoading(false)}}
 function addProduct(p:Product){setCart(lines=>{const existing=lines.find(x=>x.product.id===p.id);return existing?lines.map(x=>x.product.id===p.id?{...x,quantity:x.quantity+1}:x):[...lines,{product:p,quantity:1,unit_price:Number(p.sale_price)}]});setProductSearch('');searchRef.current?.focus()}
 function changeQty(id:string,qty:number){setCart(lines=>lines.map(x=>x.product.id===id?{...x,quantity:qty}:x).filter(x=>x.quantity>0))}
 function prepareCounterQuantity(p:Product){
  setCounterPendingProductId(p.id);
  setCounterLastProductId(p.id);
  setCounterQty('');
  setCounterChoiceIndex(-1);
  setCounterError('');
  window.requestAnimationFrame(()=>counterQtyRef.current?.focus());
 }
 function addCounterProduct(p:Product){
  const qty=counterQty.trim()===''?1:Number(counterQty);
  if(!Number.isSafeInteger(qty)||qty<1||qty>100000){
   setCounterError('Informe uma quantidade inteira entre 1 e 100.000.');
   window.requestAnimationFrame(()=>counterQtyRef.current?.focus());
   return;
  }
  setCart(lines=>{const existing=lines.find(x=>x.product.id===p.id);return existing?lines.map(x=>x.product.id===p.id?{...x,quantity:x.quantity+qty}:x):[...lines,{product:p,quantity:qty,unit_price:Number(p.sale_price)}]});
  setCounterLastProductId(p.id);
  setCounterPendingProductId(null);
  setProductSearch('');
  setCounterQty('1');
  setCounterChoiceIndex(-1);
  setCounterError('');
  window.requestAnimationFrame(()=>counterSearchRef.current?.focus());
 }
 const subtotal=cart.reduce((s,x)=>s+x.quantity*x.unit_price,0),total=Math.max(0,subtotal+number(form.delivery_fee)-number(form.discount));
 async function saveSale(payments?:CounterPayment[],creditCustomerId?:string){if(busy)return;
  const creditAmount=payments?.filter(p=>p.method==='conta').reduce((sum,p)=>sum+p.amount,0)||0;
  const creditCustomer=creditAmount>0?customers.find(c=>c.id===creditCustomerId&&c.active):undefined;
  if(creditAmount>0&&(!creditCustomer||saleChannel!=='balcao'||editing)){
   setCounterPaymentError('Fiado exige cliente cadastrado ativo e uma nova venda de balcão.');return;
  }
  if(saleChannel==='balcao'&&!payments){
   if(!cart.length){setNotice('Adicione ao menos um produto.');return}
   setCounterPaymentError('');setCounterPaymentOpen(true);return;
  }
  const effectiveForm=payments?{...form,
    customer_id:creditCustomer?.id||form.customer_id,
    customer_name:creditCustomer?(creditCustomer.name||''):form.customer_name,
    customer_phone:creditCustomer?(creditCustomer.phone||''):form.customer_phone,
    payment_method:creditAmount>0?(payments.length===1?'conta':'misto'):(payments.length>1?'misto':payments[0]?.method||'nao_informado'),
    paid:creditAmount===0}:form;
  if(payments){
   const sum=Math.round(payments.reduce((n,p)=>n+p.amount,0)*100);
   if(!payments.length||sum!==Math.round(total*100)||payments.some(p=>!Number.isFinite(p.amount)||p.amount<=0||
     (p.tendered_amount!==null&&(p.method!=='dinheiro'||p.tendered_amount<p.amount)))||
     (payments.length>1&&new Set(payments.map(p=>p.method)).size<2)){
    setCounterPaymentError('Os pagamentos devem somar exatamente o total e usar modalidades diferentes no modo dividido.');return;
   }
  }
  if(!cart.length){setNotice('Adicione ao menos um produto.');return}
  if(!cart.every(l=>l.quantity>0&&Number.isFinite(l.quantity))||![number(effectiveForm.delivery_fee),number(effectiveForm.discount),total].every(Number.isFinite)||number(effectiveForm.discount)<0||number(effectiveForm.discount)>subtotal+(saleChannel==='delivery'?number(effectiveForm.delivery_fee):0)){setNotice('Confira quantidades, descontos e valores.');if(payments)setCounterPaymentError('Desconto inválido ou superior ao valor dos produtos.');return}
  if(effectiveForm.paid&&effectiveForm.payment_method==='nao_informado'){setNotice('Escolha a forma de pagamento.');if(payments)setCounterPaymentError('Selecione a forma de pagamento.');else setCounterError('Selecione a forma de pagamento antes de confirmar.');return}
  if(effectiveForm.paid&&effectiveForm.collect_on_delivery&&saleChannel==='delivery'){setNotice('Escolha entre pagamento recebido e receber na entrega.');return}
  if(saleChannel==='delivery'&&effectiveForm.collect_on_delivery&&effectiveForm.delivery_collection_amount.trim()&&(!Number.isFinite(number(effectiveForm.delivery_collection_amount))||number(effectiveForm.delivery_collection_amount)<=0||number(effectiveForm.delivery_collection_amount)>999999.99)){setNotice('Informe um valor válido para receber na entrega, ou deixe o campo vazio para cobrar o total.');return}
  setBusy(true);try{
   let customerId=effectiveForm.customer_id||null;
   if(!customerId&&(effectiveForm.customer_name.trim()||effectiveForm.customer_phone.trim())){
    const{data,error}=await sb.from('customers').insert({name:effectiveForm.customer_name.trim()||null,phone:effectiveForm.customer_phone.trim()||null,street:effectiveForm.street||null,neighborhood:effectiveForm.neighborhood||null,house_number:effectiveForm.house_number||null,complement:effectiveForm.complement||null}).select('id').single();
    if(error)throw error;customerId=data.id;
   }
   const payload={channel:saleChannel,customer_id:customerId,customer_name:effectiveForm.customer_name,customer_phone:effectiveForm.customer_phone,street:effectiveForm.street,neighborhood:effectiveForm.neighborhood,house_number:effectiveForm.house_number,complement:effectiveForm.complement,note:effectiveForm.note,delivery_fee:saleChannel==='balcao'?0:number(effectiveForm.delivery_fee),discount:number(effectiveForm.discount),payment_method:effectiveForm.payment_method,paid:effectiveForm.paid,collect_on_delivery:saleChannel==='delivery'&&effectiveForm.collect_on_delivery,delivery_collection_amount:saleChannel==='delivery'&&effectiveForm.collect_on_delivery&&effectiveForm.delivery_collection_amount.trim()?number(effectiveForm.delivery_collection_amount):null,request_id:editing?undefined:requestId.current,items:cart.map(l=>({product_id:l.product.id,quantity:l.quantity,...(admin?{unit_price:l.unit_price}:{})}))};
   const args={p_data:payload,p_order_id:editing?.id||null,p_expected_version:editing?.version||null};
   const payPayload=payments?.filter(p=>p.method!=='conta').map(p=>({
     method:p.method,amount:p.amount.toFixed(2),
     tendered_amount:p.tendered_amount===null?null:p.tendered_amount.toFixed(2)
   }))||[];
   const {error}=creditAmount>0
     ?await sb.rpc('save_balcao_credit',{p_data:payload,p_payments:payPayload,p_credit_amount:Number(creditAmount.toFixed(2))})
     :payments&&saleChannel==='balcao'
      ?await sb.rpc('save_balcao_checkout',{...args,p_payments:payPayload})
      :await sb.rpc('save_order',args);
   if(error)throw error;
   setSaleOpen(false);setEditing(null);requestId.current=crypto.randomUUID();setNotice('Venda salva no banco de dados.');await refresh()
  }catch(err){if(payments){setCounterPaymentError(err instanceof Error?err.message:String(err))}else showError(err)}finally{setBusy(false)}}
 const requestId=useRef(crypto.randomUUID());
 async function advance(o:Order){try{const {error}=await sb.rpc('advance_delivery',{p_order_id:o.id,p_expected_version:o.version});if(error)throw error;await refresh()}catch(err){showError(err)}}
 async function returnToOrders(o:Order){
  if(o.channel!=='delivery'||(o.stage!=='entregues'&&o.stage!=='aguardando_pagamento'))return;
  if(!window.confirm('Voltar o pedido #'+o.order_number+' para Pedidos? O registro de entrega será desfeito, mas o status do pagamento e os valores serão preservados.'))return;
  try{
   const {error}=await sb.rpc('return_delivery_to_orders',{p_order_id:o.id,p_expected_version:o.version});
   if(error)throw error;
   await refresh();
   setNotice('Pedido #'+o.order_number+' devolvido à coluna Pedidos. Informações de pagamento preservadas.');
  }catch(err){showError(err)}
 }
 async function cancel(o:Order){if(creditBalances.some(x=>x.order_id===o.id)){setNotice('Uma venda fiada não pode ser cancelada pelo histórico: o saldo precisa de estorno auditável.');return}if(!admin||!window.confirm('Cancelar pedido #'+o.order_number+'? O estoque controlado será devolvido, mas o sistema NÃO estorna pagamentos. Confirme o estorno manualmente quando necessário.'))return;try{const{error}=await sb.rpc('cancel_order',{p_order_id:o.id,p_expected_version:o.version});if(error)throw error;await refresh()}catch(err){showError(err)}}
 function print(o:Order){const w=window.open('','_blank','width=440,height=680');if(!w){setNotice('Permita janelas pop-up para imprimir.');return}
  w.document.write('<p>Preparando cupom...</p>');void (async()=>{try{
   const [{data,error},{data:paymentParts,error:payError},{data:creditSummary,error:creditError}]=await Promise.all([
    sb.from('order_items').select('*').eq('order_id',o.id),
    sb.from('order_payments').select('method,amount,tendered_amount,change_amount').eq('order_id',o.id).order('sequence'),
    sb.from('credit_sale_balances').select('credit_amount,paid_amount,balance').eq('order_id',o.id).maybeSingle()
   ]);
   if(error)throw error;if(payError)throw payError;if(creditError)throw creditError;
   const address=[o.street,o.house_number,o.neighborhood,o.complement].filter(Boolean).join(' · ');
   const rows=(data||[]).map(i=>'<tr><td colspan="2"><b>'+escapeHtml(i.product_name)+'</b></td></tr><tr><td>'+escapeHtml(i.quantity)+' × '+cash(Number(i.unit_price))+'</td><td align="right">'+cash(Number(i.line_total))+'</td></tr>').join('');
   const paymentDetails=(paymentParts||[]).map(p=>
    '<div>'+escapeHtml(paymentLabels[p.method]||p.method)+': <b>'+cash(Number(p.amount))+'</b>'+
    (Number(p.change_amount)>0?' · Troco: '+cash(Number(p.change_amount)):'')+'</div>'
   ).join('');
   const creditDetails=creditSummary?'<div>Conta do cliente: <b>'+cash(Number(creditSummary.credit_amount))+'</b></div>'+
    '<div>Saldo fiado: <b>'+cash(Number(creditSummary.balance))+'</b></div>':'';
   const paymentSituation=creditSummary?(Number(creditSummary.balance)<=0?'QUITADO':'A RECEBER'):(o.payment_status==='paid'?'RECEBIDO':o.collect_on_delivery?'RECEBER NA ENTREGA':'A RECEBER');
   const html='<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>Cupom '+o.order_number+'</title><style>@page{size:80mm auto;margin:3mm}body{font:12px monospace;color:black;width:72mm;margin:0 auto}h1,h2,p{text-align:center;margin:5px}h1{font-size:20px}hr{border:0;border-top:1px dashed #555;margin:10px 0}table{width:100%;border-collapse:collapse}td{padding:3px 0}strong.total{font-size:19px}small{font-size:10px}button{margin:12px auto;display:block;padding:9px}@media print{button{display:none}}</style></head><body><h1>'+escapeHtml(settings.store_name)+'</h1><p>'+escapeHtml(settings.store_subtitle)+'</p><p>'+escapeHtml(settings.store_phone||'')+'</p><p>'+escapeHtml(settings.store_address||'')+'</p><p><b>CUPOM NÃO FISCAL</b></p><hr><b>PEDIDO #'+o.order_number+' — '+(o.channel==='delivery'?'DELIVERY':'BALCÃO')+'</b><p>'+fmt(o.sold_at)+'</p><hr><div>Cliente: '+escapeHtml(o.customer_name||'Não identificado')+'</div><div>Telefone: '+escapeHtml(o.customer_phone||'-')+'</div>'+ (o.channel==='delivery'&&address?'<div>Endereço: '+escapeHtml(address)+'</div>':'')+'<hr><table>'+rows+'</table><hr><table><tr><td>Subtotal</td><td align="right">'+cash(Number(o.subtotal))+'</td></tr><tr><td>Entrega</td><td align="right">'+cash(Number(o.delivery_fee))+'</td></tr><tr><td>Desconto</td><td align="right">'+cash(Number(o.discount))+'</td></tr><tr><td><strong class="total">TOTAL</strong></td><td align="right"><strong class="total">'+cash(Number(o.total))+'</strong></td></tr></table><hr><div>Pagamento: '+escapeHtml(paymentLabels[o.payment_method]||o.payment_method)+'</div>'+paymentDetails+creditDetails+'<div>Situação: <b>'+paymentSituation+'</b></div>'+(o.channel==='delivery'&&(o.collect_on_delivery||o.delivery_collection_amount!=null)?'<div>Valor informado na entrega: <b>'+cash(o.delivery_collection_amount==null?Number(o.total):Number(o.delivery_collection_amount))+'</b></div>':'')+(o.note?'<div>Observações: '+escapeHtml(o.note)+'</div>':'')+'<hr><p>'+escapeHtml(settings.receipt_footer||'Obrigado!')+'</p><p><small>ESTE DOCUMENTO NÃO É NOTA FISCAL</small></p><button onclick="window.print()">Imprimir</button><script>window.onload=()=>{setTimeout(()=>window.print(),250)}<\/script></body></html>';
   w.document.open();w.document.write(html);w.document.close();
  }catch(err){w.close();showError(err)}})();}
 async function saveProduct(e:FormEvent){e.preventDefault();if(!admin)return;setBusy(true);try{
 const record={name:productForm.name.trim(),category_id:productForm.category_id?Number(productForm.category_id):null,
 barcode:productForm.barcode||null,sku:productForm.sku||null,unit:productForm.unit,
 purchase_price:number(productForm.purchase_price),sale_price:number(productForm.sale_price),
 track_stock:productForm.track_stock,stock_qty:number(productForm.stock_qty),min_stock:number(productForm.min_stock),active:productForm.active};
 if(![record.purchase_price,record.sale_price,record.stock_qty,record.min_stock].every(Number.isFinite))throw Error('Confira os valores numéricos do produto.');
 const {error}=await sb.rpc('save_product',{p_data:record,p_product_id:editProduct?.id||null});if(error)throw error;
 setNewProduct(false);setEditProduct(null);await refresh()
 }catch(err){showError(err)}finally{setBusy(false)}}
 function openProduct(p?:Product){setEditProduct(p||null);setProductForm({name:p?.name||'',category_id:String(p?.category_id||''),barcode:p?.barcode||'',sku:p?.sku||'',unit:p?.unit||'UN',purchase_price:String(p?.purchase_price||0),sale_price:String(p?.sale_price||0),track_stock:p?.track_stock||false,stock_qty:String(p?.stock_qty||0),min_stock:String(p?.min_stock||0),active:p?.active??true});setNewProduct(true)}
 async function saveCustomer(e:FormEvent){e.preventDefault();if(!custForm.name.trim()&&!custForm.phone.trim()){setNotice('Informe nome ou telefone.');return}setBusy(true);try{const record={name:custForm.name||null,phone:custForm.phone||null,street:custForm.street||null,neighborhood:custForm.neighborhood||null,house_number:custForm.house_number||null,complement:custForm.complement||null};const r=editCustomer?await sb.from('customers').update(record).eq('id',editCustomer.id):await sb.from('customers').insert(record);if(r.error)throw r.error;setNewCustomer(false);setEditCustomer(null);await refresh()}catch(err){showError(err)}finally{setBusy(false)}}
 function openCustomer(c?:Customer){setEditCustomer(c||null);setCustForm({name:c?.name||'',phone:c?.phone||'',street:c?.street||'',neighborhood:c?.neighborhood||'',house_number:c?.house_number||'',complement:c?.complement||''});setNewCustomer(true)}
 async function addCategory(){if(!admin||!catName.trim())return;const r=await sb.from('categories').insert({name:catName.trim()});if(r.error)showError(r.error);else{setCatName('');await refresh()}}
 async function manageStaff(e:FormEvent){e.preventDefault();if(!admin||!memberEmail.trim())return;setBusy(true);try{const{error}=await sb.rpc('manage_staff_by_email',{p_email:memberEmail.trim(),p_role:memberRole,p_active:memberActive});if(error)throw error;setMemberEmail('');setNotice('Permissão de usuário atualizada.');await refresh()}catch(err){showError(err)}finally{setBusy(false)}}
 async function saveSettings(e:FormEvent){e.preventDefault();if(!admin)return;const r=await sb.from('app_settings').update({...settings,updated_at:new Date().toISOString()}).eq('id',1);if(r.error)showError(r.error);else setNotice('Configurações atualizadas.')}
 const creditByCustomer=customers.map(customer=>{
  const sales=creditBalances.filter(x=>x.customer_id===customer.id);
  const amount=sales.reduce((sum,x)=>sum+Number(x.credit_amount),0);
  const balance=sales.reduce((sum,x)=>sum+Number(x.balance),0);
  const paid=amount-balance;
  return {customer,amount,balance,paid,count:sales.length};
 }).filter(row=>row.count>0).sort((a,b)=>b.balance-a.balance||a.customer.name?.localeCompare(b.customer.name||'')||0);
 const creditTotalDue=creditByCustomer.reduce((sum,row)=>sum+row.balance,0);
 const creditCustomerCount=creditByCustomer.filter(row=>row.balance>0.001).length;
 const creditCustomerRows=creditByCustomer.filter(row=>{
  const term=creditSearch.trim().toLowerCase(),digits=creditSearch.replace(/\D/g,'');
  return !term||(row.customer.name||'').toLowerCase().includes(term)||
    (row.customer.phone||'').toLowerCase().includes(term)||
    (digits.length>=2&&String(row.customer.phone||'').replace(/\D/g,'').includes(digits));
 });
 const chosenCredit=creditByCustomer.find(row=>row.customer.id===creditSelectedCustomer);
 const chosenCreditSales=creditBalances.filter(row=>row.customer_id===creditSelectedCustomer);
 const chosenCreditReceipts=creditReceipts.filter(row=>row.customer_id===creditSelectedCustomer);
 const creditOrderIds=new Set(creditBalances.map(x=>x.order_id));
 const activeOrders=orders.filter(o=>o.status==='active');
 const filtered=useMemo(()=>activeOrders.filter(o=>{const d=day(o.sold_at),today=shortDay(new Date()),prev=shortDay(new Date(Date.now()-86400000));const last=shortDay(new Date(Date.now()-6*86400000));if(period==='hoje')return d===today;if(period==='ontem')return d===prev;if(period==='7dias')return d>=last&&d<=today;if(period==='mes')return d.slice(0,7)===today.slice(0,7);return (!start||d>=start)&&(!end||d<=end)}),[activeOrders,period,start,end]);
 const sum=filtered.reduce((s,o)=>s+Number(o.total),0),gross=filtered.reduce((s,o)=>s+Number(o.subtotal)-Number(o.discount)-Number(o.cost_total),0);
 const sums={balcao:filtered.filter(x=>x.channel==='balcao').reduce((s,o)=>s+Number(o.total),0),delivery:filtered.filter(x=>x.channel==='delivery').reduce((s,o)=>s+Number(o.total),0)};
 const monthly=Array.from({length:6},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));const key=shortDay(d).slice(0,7);return {key,label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(d),value:activeOrders.filter(o=>day(o.sold_at).slice(0,7)===key).reduce((sum,o)=>sum+Number(o.total),0)}});
 const monthlyMax=Math.max(1,...monthly.map(x=>x.value));
 const matched=products.filter(p=>p.active&&(p.name.toLowerCase().includes(productSearch.toLowerCase())||p.barcode?.includes(productSearch))).slice(0,9);
 const counterQuery=productSearch.trim().toLowerCase();
 const counterMatches=counterQuery?products.filter(p=>p.active&&(p.name.toLowerCase().includes(counterQuery)||String(p.barcode||'').toLowerCase().includes(counterQuery)||String(p.sku||'').toLowerCase().includes(counterQuery))).slice(0,8):[];
 const counterSelected=counterChoiceIndex>=0?counterMatches[counterChoiceIndex]:counterMatches.find(p=>p.barcode===productSearch.trim()||p.sku===productSearch.trim())||counterMatches[0];
 const counterPendingProduct=counterPendingProductId?products.find(p=>p.id===counterPendingProductId&&p.active):undefined;
 const counterPreview=counterPendingProduct||counterSelected||products.find(p=>p.id===counterLastProductId);
 const counterPreviewQty=Math.max(1,Number(counterQty)||1);
 const counterLastOrder=activeOrders.find(o=>o.channel==='balcao');
 const customerSearchTerm=customerSearch.trim().toLowerCase();
 const customerSearchDigits=customerSearchTerm.replace(/\D/g,'');
 const customerMatches=customerSearchTerm?customers.filter(c=>{
  const phone=String(c.phone||'').replace(/\D/g,'');
  if(/^\d{2}$/.test(customerSearchTerm))return phone.endsWith(customerSearchTerm);
  return String(c.name||'').toLowerCase().includes(customerSearchTerm)||
   String(c.phone||'').toLowerCase().includes(customerSearchTerm)||
   (customerSearchDigits.length>=3&&phone.includes(customerSearchDigits));
 }).slice(0,12):[];
 const selectSaleCustomer=(c:Customer)=>{
  setForm(prev=>({...newForm(c),delivery_fee:prev.delivery_fee,discount:prev.discount,payment_method:prev.payment_method,paid:prev.paid,note:prev.note}));
  setCustomerSearch('');setCustomerChoiceIndex(-1);
 };
 const advanceField=(e:ReactKey<HTMLFormElement>)=>{if(e.key!=='Enter'||e.ctrlKey)return;const target=e.target as HTMLElement;if(target.tagName==='TEXTAREA'||target.tagName==='BUTTON')return;if(target.id==='product-search'){e.preventDefault();if(matched[0])addProduct(matched[0]);return}e.preventDefault();const all=[...e.currentTarget.querySelectorAll<HTMLElement>('[data-nav]')].filter(n=>!n.hasAttribute('disabled'));const i=all.indexOf(target);all[i+(e.shiftKey?-1:1)]?.focus()};
 if(!authReady)return <div className="auth-shell">Carregando GELADÃO...</div>;
 if(authMode==='recovery')return <main className="auth-shell"><form className="card login" onSubmit={saveRecoveredPassword}>
  <div className="login-logo">G</div><h1>Criar nova senha</h1><p>Escolha uma nova senha para sua conta do GELADÃO.</p>
  <label>Nova senha<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
  <label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
  <button className="primary" disabled={busy}>{busy?'Salvando...':'Salvar nova senha'}</button>
  <button className="outline" type="button" onClick={()=>{void sb.auth.signOut().then(()=>{setAuthMode('login');setNewPassword('');setConfirmPassword('');setNotice('');window.history.replaceState(null,'',window.location.pathname)}).catch(showError)}}>Voltar para o login</button>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <small>Não compartilhe sua senha nem o link recebido por e-mail.</small>
 </form></main>;
 if(!user)return <main className="auth-shell"><form className="card login" onSubmit={authMode==='forgot'?requestPasswordReset:login}>
  <div className="login-logo">G</div><h1>GELADÃO</h1><p>{authMode==='forgot'?'Recuperação de senha':'Distribuidora de Bebidas · Sistema PDV'}</p>
  <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
  {authMode==='login'&&<label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>}
  <button className="primary" disabled={busy}>{busy?'Aguarde...':authMode==='forgot'?'Enviar link de recuperação':'Entrar no sistema'}</button>
  {authMode==='login'?<><button type="button" className="auth-forgot-link" disabled={busy} onClick={()=>{setAuthMode('forgot');setNotice('')}}>Esqueci minha senha</button><button type="button" className="outline" disabled={busy} onClick={()=>void requestAccess()}>Solicitar acesso</button></>:<button type="button" className="outline" disabled={busy} onClick={()=>{setAuthMode('login');setNotice('')}}>Voltar para o login</button>}
  {notice&&<p className="notice" role="status">{notice}</p>}<small>Acesso exclusivo a usuários autorizados. Não há cadastro público.</small>
 </form></main>;
 if(!staff?.active)return <main className="auth-shell"><section className="card login"><div className="login-logo">G</div><h2>Cadastro aguardando autorização</h2><p>Seu login existe, mas seu perfil ainda não foi habilitado como operador ou administrador do GELADÃO.</p><p>Peça ao administrador que vincule seu usuário no painel seguro do Supabase.</p><div className="actions"><button className="primary" onClick={()=>void loadStaff(user.id)}>Verificar autorização</button><button className="outline" onClick={()=>void logout()}>Sair</button></div></section></main>;
 return <div className="app"><aside className={'sidebar '+(menu?'wide':'')+(mobile?' mobileopen':'')} onMouseEnter={()=>setMenu(true)} onMouseLeave={()=>setMenu(false)}><div className="brand"><b>G</b>{menu&&<strong>GELADÃO</strong>}</div><nav>{tabs.map(([id,title,icon])=><button key={id} title={title} className={page===id?'selected':''} onClick={()=>{setPage(id);setMobile(false);setNotice('');if(id==='balcao')openSale('balcao')}}><span>{icon}</span>{menu&&<label>{title}</label>}</button>)}</nav><div className="sidebottom"><button title="Sair" onClick={()=>void logout()}><span>⇥</span>{menu&&<label>Sair</label>}</button></div></aside>
 <main className="main"><header><div className="headtitle"><button className="mobiletoggle" onClick={()=>setMobile(x=>!x)}>☰</button><div><small>GELADÃO / SISTEMA PDV</small><h1>{tabs.find(t=>t[0]===page)?.[1]}</h1></div></div><div className="headright"><span className="userchip">{staff.display_name||user.email} · {staff.role}</span><button className="outline" onClick={()=>void refresh()} disabled={loading}>↻ Atualizar</button></div></header>
 {notice&&<div className="notice" role="alert">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
 {page==='dashboard'&&<><div className="toolbar"><h2>Visão geral</h2><div className="filters"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="7dias">Últimos 7 dias</option><option value="mes">Este mês</option><option value="custom">Personalizado</option></select>{period==='custom'&&<><input type="date" value={start} onChange={e=>setStart(e.target.value)}/><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></>}</div></div>
 <div className="metrics">{[['Vendas gerais',cash(sum)],['Lucro bruto dos produtos',cash(gross)],['Total de pedidos',String(filtered.length)],['Tíquete médio',cash(filtered.length?sum/filtered.length:0)]].map(([title,value])=><article className="card metric" key={title}><span>{title}</span><strong>{value}</strong></article>)}</div>
 <div className="two"><section className="card"><h3>Vendas por canal</h3><p>Delivery <b>{cash(sums.delivery)}</b></p><div className="track"><span style={{width:sum?String(100*sums.delivery/sum)+'%':'0%'}}/></div><p>Balcão <b>{cash(sums.balcao)}</b></p><div className="track"><span style={{width:sum?String(100*sums.balcao/sum)+'%':'0%'}}/></div></section><section className="card"><h3>Resumo de pagamentos</h3><p>Pedidos recebidos: {filtered.filter(o=>o.payment_status==='paid'||creditBalances.some(c=>c.order_id===o.id&&Number(c.balance)===0)).length}</p>
 <p>A receber: {cash(
   filtered.filter(o=>o.payment_status==='pending'&&!creditOrderIds.has(o.id)).reduce((sum,o)=>sum+Number(o.total),0)
   +creditBalances.filter(c=>filtered.some(o=>o.id===c.order_id)).reduce((sum,c)=>sum+Number(c.balance),0)
  )}</p><p>Fiados em aberto (geral): <b>{cash(creditTotalDue)}</b></p><small>Lucro dos produtos = itens vendidos − custo − descontos. Taxa de entrega não entra nesse lucro.</small></section></div><section className="card chart"><h3>Faturamento nos últimos 6 meses</h3><div className="monthbars">{monthly.map(m=><div key={m.key} className="monthitem" title={cash(m.value)}><small>{cash(m.value)}</small><div className="monthtrack"><span style={{height:String(Math.max(m.value>0?8:2,Math.round(140*m.value/monthlyMax)))+'px'}}/></div><b>{m.label}</b></div>)}</div></section></>}
 {page==='delivery'&&<><div className="toolbar"><div><h2>Fluxo de pedidos</h2><p>Avance cada pedido com um clique</p></div><button className="primary" onClick={()=>openSale('delivery')}>+ Nova venda · F2</button></div><div className="kanban">{(['pedidos','aguardando_pagamento','entregues'] as const).map(s=><section className="lane" data-stage={s} key={s}><h3>{s==='pedidos'?'Pedidos':s==='entregues'?'Entregues':'Aguardando pagamento'} <span>{activeOrders.filter(o=>o.channel==='delivery'&&o.stage===s).length}</span></h3>{!activeOrders.some(o=>o.channel==='delivery'&&o.stage===s)&&<div className="lane-empty"><span className="lane-empty-icon" aria-hidden="true">{s==='pedidos'?'▤':s==='entregues'?'✓':'◷'}</span><strong>{s==='pedidos'?'Tudo organizado por aqui':s==='entregues'?'Nenhuma entrega concluída':'Nenhum pagamento pendente'}</strong><p>{s==='pedidos'?'Os novos pedidos aparecerão nesta coluna.':s==='entregues'?'Os pedidos entregues e pagos aparecerão aqui.':'Pedidos entregues que ainda precisam ser recebidos aparecerão aqui.'}</p>{s==='pedidos'&&<button type="button" className="outline" onClick={()=>openSale('delivery')}>+ Criar pedido</button>}</div>}{activeOrders.filter(o=>o.channel==='delivery'&&o.stage===s).map(o=><article className="card order" key={o.id}><div className="orderhead"><b>#{o.order_number}</b><small>{fmt(o.sold_at)}</small></div><h3>{o.customer_name||'Cliente não identificado'}</h3><strong>{cash(Number(o.total))}</strong><span className={'payment-pill '+(o.payment_status==='paid'?'is-paid':'is-pending')}>{o.payment_status==='paid'?'✓ Pago':o.collect_on_delivery?'◷ Receber na entrega':'◷ A receber'} · {paymentLabels[o.payment_method]}</span>{o.collect_on_delivery&&o.payment_status==='pending'&&<small className="delivery-card-collection">Valor previsto na entrega: {cash(o.delivery_collection_amount==null?Number(o.total):Number(o.delivery_collection_amount))}</small>}<div className="actions"><button onClick={()=>print(o)}>⎙ Imprimir</button><button onClick={()=>void editSale(o)}>✎ Editar</button>{s!=='entregues'&&<button className="actionnext" onClick={()=>void advance(o)}>{s==='pedidos'?'Marcar entregue':'Confirmar pagamento'} →</button>}{s!=='pedidos'&&<button type="button" className="actionback" title="Devolver este pedido à coluna Pedidos sem alterar o pagamento" onClick={()=>void returnToOrders(o)}>↶ Voltar para Pedidos</button>}</div></article>)}</section>)}</div></>}
 {page==='balcao'&&<><div className="toolbar"><div><h2>Vendas de balcão</h2><p>Venda rápida e reimpressão de comprovantes</p></div><button className="primary" onClick={()=>openSale('balcao')}>+ Nova venda de balcão</button></div><section className="card"><h3>Últimas vendas</h3>{activeOrders.filter(o=>o.channel==='balcao').slice(0,30).map(o=><div className="line-row" key={o.id}><div><b>#{o.order_number}</b><small>{fmt(o.sold_at)}</small></div><strong>{cash(Number(o.total))}</strong><div className="actions"><button onClick={()=>void editSale(o)}>Editar</button><button onClick={()=>print(o)}>Imprimir</button></div></div>)}{!activeOrders.some(o=>o.channel==='balcao')&&<p>Nenhuma venda registrada.</p>}</section></>}
 
 {page==='fiados'&&<div className="credit-page">
  <div className="credit-heading"><div><h2>Fiados · Contas de clientes</h2><p>Acompanhe compras, saldos devedores e recebimentos registrados.</p></div>
   <button type="button" className="outline" onClick={()=>void refresh()} disabled={loading}>↻ Atualizar saldos</button></div>
  <div className="credit-metrics">
   <article className="card credit-metric"><span>Saldo total em aberto</span><strong>{cash(creditTotalDue)}</strong><small>Valor a receber de compras fiadas</small></article>
   <article className="card credit-metric"><span>Clientes devendo</span><strong>{creditCustomerCount}</strong><small>{creditByCustomer.length} clientes com histórico de conta</small></article>
   <article className="card credit-metric"><span>Total já recebido em fiados</span><strong>{cash(creditReceipts.reduce((sum,x)=>sum+Number(x.amount),0))}</strong><small>Recebimentos registrados posteriormente</small></article>
  </div>
  <div className="credit-layout">
   <aside className="card credit-directory">
    <div className="credit-section-title"><h3>Clientes</h3><span>{creditCustomerRows.length}</span></div>
    <input type="search" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente com fiado"
     value={creditSearch} onChange={e=>setCreditSearch(e.target.value)}/>
    <div className="credit-customer-list">
     {creditCustomerRows.map(row=><button type="button" key={row.customer.id}
      className={creditSelectedCustomer===row.customer.id?'selected':''}
      onClick={()=>{setCreditSelectedCustomer(row.customer.id);setCreditPaymentAmount('');setCreditPaymentNote('');setCreditPaymentError('');setCreditOrderId(null);setCreditOrderItems([])}}>
      <span><strong>{row.customer.name||'Cliente sem nome'}</strong><small>{row.customer.phone||'Sem telefone'} · {row.count} compra(s)</small></span>
      <b className={row.balance>0?'credit-owing':'credit-clear'}>{cash(row.balance)}</b>
     </button>)}
     {!creditCustomerRows.length&&<div className="credit-empty"><strong>Nenhum cliente encontrado</strong><p>Ao finalizar uma venda em F8 → 5 — Conta, ela aparecerá aqui.</p></div>}
    </div>
   </aside>
   <section className="card credit-details">
    {chosenCredit?<div className="credit-detail-inner">
     <div className="credit-detail-heading"><div><small>CONTA DO CLIENTE</small><h3>{chosenCredit.customer.name||'Cliente sem nome'}</h3>
      <span>{chosenCredit.customer.phone||'Telefone não informado'}</span></div>
      <span className={chosenCredit.balance>0?'credit-status-due':'credit-status-clear'}>{chosenCredit.balance>0?'Em aberto':'Quitado'}</span>
     </div>
     <div className="credit-client-metrics">
      <div><span>Total fiado</span><strong>{cash(chosenCredit.amount)}</strong></div>
      <div><span>Abatido do fiado</span><strong>{cash(chosenCredit.paid)}</strong></div>
      <div><span>Saldo atual</span><strong>{cash(chosenCredit.balance)}</strong></div>
     </div>
     {chosenCredit.balance>0&&<form className="credit-receive" onSubmit={e=>void receiveCredit(e)}>
      <h4>Receber pagamento</h4>
      <div className="credit-receive-fields">
       <label>Valor recebido (R$)
        <input autoComplete="off" inputMode="decimal" placeholder={chosenCredit.balance.toFixed(2).replace('.',',')}
         value={creditPaymentAmount} onChange={e=>{setCreditPaymentAmount(e.target.value);setCreditPaymentError('')}} required disabled={creditPaymentBusy}/></label>
       <label>Forma de recebimento
        <select value={creditPaymentMethod} onChange={e=>setCreditPaymentMethod(e.target.value as 'dinheiro'|'pix'|'cartao')} disabled={creditPaymentBusy}>
         <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option>
        </select></label>
       <label>Observação (opcional)
        <input value={creditPaymentNote} onChange={e=>setCreditPaymentNote(e.target.value)} placeholder="Ex.: Acerto parcial" disabled={creditPaymentBusy}/></label>
       <button type="submit" className="primary" disabled={creditPaymentBusy}>{creditPaymentBusy?'Registrando...':'Registrar recebimento'}</button>
      </div>
      <p>Pagamentos parciais abatem as compras mais antigas. O estoque não é alterado.</p>
      {creditPaymentError&&<p role="alert" className="credit-error">{creditPaymentError}</p>}
     </form>}
     <div className="credit-history-section"><h4>Compras fiadas <span>{chosenCreditSales.length}</span></h4>
      <div className="credit-table-scroll"><table><thead><tr><th>Venda</th><th>Data</th><th>Total da compra</th><th>Fiado</th><th>Abatido</th><th>Em aberto</th><th>Detalhes</th></tr></thead>
       <tbody>{chosenCreditSales.map(sale=><tr key={sale.id}>
        <td><b>#{sale.order_number}</b></td><td>{fmt(sale.sold_at)}</td>
        <td>{cash(Number(sale.total))}</td><td>{cash(Number(sale.credit_amount))}</td><td>{cash(Number(sale.paid_amount))}</td>
        <td><b className={Number(sale.balance)>0?'credit-owing':'credit-clear'}>{cash(Number(sale.balance))}</b></td>
        <td><button type="button" className="outline" onClick={()=>void loadCreditItems(sale.order_id)}>
         {creditOrderId===sale.order_id?'Atualizar itens':'Ver itens'}</button></td>
       </tr>)}</tbody></table></div>
      {creditOrderId&&<div className="credit-sale-items">
       <div className="credit-item-header"><h4>Itens da venda #{chosenCreditSales.find(v=>v.order_id===creditOrderId)?.order_number||'—'}</h4>
        <button type="button" className="outline" onClick={()=>{setCreditOrderId(null);setCreditOrderItems([])}}>Fechar ×</button></div>
       {creditItemsLoading?<p>Consultando itens...</p>:<table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead>
        <tbody>{creditOrderItems.map(item=><tr key={item.id}>
         <td>{item.product_name}</td><td>{Number(item.quantity)}</td><td>{cash(Number(item.unit_price))}</td><td>{cash(Number(item.line_total))}</td>
        </tr>)}</tbody></table>}
      </div>}
     </div>
     <div className="credit-history-section"><h4>Histórico de recebimentos <span>{chosenCreditReceipts.length}</span></h4>
      {chosenCreditReceipts.length?<div className="credit-table-scroll"><table><thead><tr><th>Data</th><th>Forma</th><th>Valor</th><th>Compras quitadas / abatidas</th></tr></thead>
       <tbody>{chosenCreditReceipts.map(receipt=><tr key={receipt.id}>
        <td>{fmt(receipt.received_at)}</td>
        <td>{paymentLabels[receipt.method]}</td>
        <td><strong className="credit-clear">{cash(Number(receipt.amount))}</strong>{receipt.note&&<small className="credit-note">{receipt.note}</small>}</td>
        <td>{creditAllocations.filter(a=>a.receipt_id===receipt.id).map(a=>{
         const related=chosenCreditSales.find(sale=>sale.id===a.credit_sale_id);
         return <span className="credit-allocation" key={a.credit_sale_id}>#{related?.order_number||'—'} · {cash(Number(a.amount))}</span>
        })}</td>
       </tr>)}</tbody></table></div>:<p className="credit-no-history">Nenhum recebimento ainda registrado nesta conta.</p>}
     </div>
    </div>:<div className="credit-instructions"><span aria-hidden="true">▧</span><h3>Escolha um cliente</h3><p>Selecione uma conta na lista para consultar todas as compras fiadas, pagamentos e saldo restante.</p></div>}
   </section>
  </div>
 </div>}
 {page==='produtos'&&<><div className="toolbar"><div><h2>Produtos e categorias</h2><p>Preço de custo, venda e estoque opcional</p></div>{admin&&<button className="primary" onClick={()=>openProduct()}>+ Cadastrar produto</button>}</div><input className="fullsearch" placeholder="Buscar produto, código de barras ou SKU" value={query} onChange={e=>setQuery(e.target.value)}/><section className="card"><div className="tablewrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Estoque</th><th></th></tr></thead><tbody>{products.filter(p=>(p.name+' '+p.barcode+' '+p.sku).toLowerCase().includes(query.toLowerCase())).map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.unit} · {p.active?'Ativo':'Inativo'}</small></td><td>{cats.find(x=>x.id===p.category_id)?.name||'Outros'}</td><td>{cash(Number(p.purchase_price))}</td><td>{cash(Number(p.sale_price))}</td><td>{p.track_stock?String(p.stock_qty):'Não controlado'}</td><td>{admin&&<button className="outline" onClick={()=>openProduct(p)}>Editar</button>}</td></tr>)}</tbody></table></div></section>{admin&&<section className="card categories"><h3>Categorias</h3><div className="actions">{cats.map(c=><span className="chip" key={c.id}>{c.name}</span>)}</div><div className="actions"><input placeholder="Nova categoria" value={catName} onChange={e=>setCatName(e.target.value)}/><button className="outline" onClick={()=>void addCategory()}>Adicionar</button></div></section>}</>}
 {page==='clientes'&&<><div className="toolbar"><h2>Clientes</h2><button className="primary" onClick={()=>openCustomer()}>+ Novo cliente</button></div><input className="fullsearch" placeholder="Buscar por nome ou telefone" value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)}/><section className="card"><div className="tablewrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Endereço</th><th>Pedidos</th><th></th></tr></thead><tbody>{customers.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(customerQuery.toLowerCase())).map(c=><tr key={c.id}><td>{c.name||'—'}</td><td>{c.phone||'—'}</td><td>{[c.street,c.house_number,c.neighborhood].filter(Boolean).join(', ')||'—'}</td><td>{orders.filter(o=>o.customer_id===c.id&&o.status==='active').length}</td><td><button className="outline" onClick={()=>openCustomer(c)}>Editar</button></td></tr>)}</tbody></table></div></section></>}
 {page==='relatorios'&&<><div className="toolbar"><h2>Histórico de vendas</h2><div className="actions"><input placeholder="Número, nome ou telefone" value={orderQuery} onChange={e=>setOrderQuery(e.target.value)}/><button className="outline" onClick={()=>{const rows=[['Pedido','Data','Canal','Total','Pagamento'],...orders.map(o=>[String(o.order_number),fmt(o.sold_at),o.channel,String(o.total),o.payment_status])];const csv=rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}));a.download='geladao-vendas.csv';a.click();URL.revokeObjectURL(a.href)}}>Exportar CSV</button></div></div><section className="card"><div className="tablewrap"><table><thead><tr><th>Pedido</th><th>Data</th><th>Canal</th><th>Total</th><th>Pagamento</th><th>Ações</th></tr></thead><tbody>{orders.filter(o=>(String(o.order_number)+' '+o.customer_name+' '+o.customer_phone).toLowerCase().includes(orderQuery.toLowerCase())).map(o=><tr key={o.id}><td>#{o.order_number}{o.status==='cancelled'?' · Cancelado':''}</td><td>{fmt(o.sold_at)}</td><td>{o.channel}</td><td>{cash(Number(o.total))}</td><td>{creditBalances.some(c=>c.order_id===o.id)?
  (Number(creditBalances.find(c=>c.order_id===o.id)?.balance||0)===0?'Conta quitada':'Fiado: '+cash(Number(creditBalances.find(c=>c.order_id===o.id)?.balance||0)))
  :(o.payment_status==='paid'?'Recebido':'Pendente')}</td><td><div className="actions"><button className="outline" onClick={()=>print(o)}>Imprimir</button>{o.status==='active'&&<><button className="outline" onClick={()=>void editSale(o)}>Editar</button>{admin&&<button className="danger" onClick={()=>void cancel(o)}>Cancelar</button>}</>}</div></td></tr>)}</tbody></table></div></section></>}
 {page==='config'&&<section className="card settings"><h2>Configurações da distribuidora</h2><form onSubmit={saveSettings}><label>Nome<input disabled={!admin} value={settings.store_name} onChange={e=>setSettings(s=>({...s,store_name:e.target.value}))}/></label><label>Subtítulo<input disabled={!admin} value={settings.store_subtitle} onChange={e=>setSettings(s=>({...s,store_subtitle:e.target.value}))}/></label><label>Telefone<input disabled={!admin} value={settings.store_phone||''} onChange={e=>setSettings(s=>({...s,store_phone:e.target.value}))}/></label><label>Endereço no cupom<input disabled={!admin} value={settings.store_address||''} onChange={e=>setSettings(s=>({...s,store_address:e.target.value}))}/></label><label>Rodapé do cupom<input disabled={!admin} value={settings.receipt_footer||''} onChange={e=>setSettings(s=>({...s,receipt_footer:e.target.value}))}/></label><p>A impressão atual abre o diálogo de impressão do navegador para bobinas de 80 mm. Impressão silenciosa depende do modelo e da integração local.</p>{admin&&<button className="primary">Salvar configurações</button>}</form>{admin&&<div className="staff-panel"><h3>Usuários e permissões</h3><p>O usuário deve solicitar acesso primeiro. Apenas administradores podem liberar ou bloquear a conta.</p><form className="staff-form" onSubmit={manageStaff}><label>E-mail cadastrado<input type="email" required value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} placeholder="usuario@exemplo.com"/></label><label>Perfil<select value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option value="operador">Operador</option><option value="admin">Administrador</option></select></label><label>Status<select value={memberActive?'ativo':'inativo'} onChange={e=>setMemberActive(e.target.value==='ativo')}><option value="ativo">Ativo</option><option value="inativo">Bloqueado</option></select></label><button className="primary" disabled={busy}>Salvar permissão</button></form><div className="staff-list">{staffMembers.map(m=><div className="line-row" key={m.user_id}><strong>{m.display_name||m.user_id.slice(0,8)}</strong><span>{m.role==='admin'?'Administrador':'Operador'} · {m.active?'Ativo':'Bloqueado'}</span></div>)}</div></div>}</section>}
 <footer>GELADÃO · Uma unidade · {loading?'Atualizando dados...':'Dados protegidos por autenticação e RLS'}</footer></main>

 {saleOpen&&saleChannel==='balcao'&&<div className="counter-overlay">
  <section className="counter-workspace" role="dialog" aria-modal="true" aria-label={editing?'Editar venda de balcão':'Nova venda de balcão'}>
   <form className="counter-sale-form" onSubmit={e=>{e.preventDefault();void saveSale()}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.ctrlKey){const el=e.target as HTMLElement;if(el.tagName==='INPUT'&&el.id!=='counter-search'&&el.id!=='counter-qty')e.preventDefault()}}}>
    
    <div className="counter-windowbar">
     <span aria-hidden="true">▣</span><b>GELADÃO</b><span>– PDV (Frente de Caixa)</span>
     <button type="button" onClick={closeSale} title="Fechar (Esc)" aria-label="Fechar a tela do caixa">×</button>
    </div>
    <header className="counter-topbar">
     <div className="counter-brand"><strong>GELADÃO</strong><i aria-hidden="true"/></div>
     <div className="counter-attendant"><span aria-hidden="true">♙</span> Atendente: <b>{staff.display_name||user.email||'Operador'}</b></div>
     <div className="counter-top-meta"><span>▦ {counterClock.toLocaleDateString('pt-BR')}</span><span>◷ {counterClock.toLocaleTimeString('pt-BR')}</span></div>
    </header>
    <div className="counter-product-banner">
     <span aria-hidden="true" className="counter-product-tag">◇</span>
     <h2>{counterPreview?.name||'PRONTO PARA NOVA VENDA'}</h2>
    </div>
    <div className="counter-main">
     <aside className="counter-logo-panel" aria-label="PDV GELADÃO">
      <svg viewBox="0 0 154 126" role="img" aria-label="Carrinho de compras">
       <path d="M14 20h15l16 69h81l14-52H40" fill="none" stroke="#1759b9" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
       <path d="M55 56h69M62 73h58" stroke="#2e92ee" strokeWidth="6" strokeLinecap="round"/>
       <circle cx="62" cy="108" r="10" fill="#133c88"/><circle cx="116" cy="108" r="10" fill="#133c88"/>
       <path d="M8 49h20M4 69h28" stroke="#27a2eb" strokeWidth="7" strokeLinecap="round"/>
      </svg>
      <strong>PDV</strong><b>GELADÃO</b><i aria-hidden="true"/>
     </aside>
     <section className="counter-terminal">
      
      <label className="counter-search-label" htmlFor="counter-search">Código</label>
      <div className="counter-search-wrap">
       
       <input id="counter-search" autoFocus ref={counterSearchRef} autoComplete="off" placeholder="Código ou nome do produto"
        value={productSearch}
        onChange={e=>{setProductSearch(e.target.value);setCounterPendingProductId(null);setCounterChoiceIndex(-1);setCounterError('')}}
        onKeyDown={e=>{
         if(e.key==='ArrowDown'&&counterMatches.length){e.preventDefault();setCounterChoiceIndex(i=>Math.min(i+1,counterMatches.length-1));return}
         if(e.key==='ArrowUp'&&counterMatches.length){e.preventDefault();setCounterChoiceIndex(i=>Math.max(0,i-1));return}
         if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(counterSelected)prepareCounterQuantity(counterSelected);else setCounterError('Produto não encontrado. Confira o código ou a descrição.')}
        }}/>
       <span aria-hidden="true" className="counter-barcode-icon">▥</span>
      </div>
      {counterPendingProduct&&<p className="counter-qty-prompt" role="status">Produto selecionado: <b>{counterPendingProduct.name}</b>. Informe a quantidade e pressione Enter. Campo vazio = 1 unidade.</p>}
      {productSearch&&!counterPendingProduct&&<div className="counter-suggestions" role="listbox" aria-label="Produtos encontrados">
       {counterMatches.map((p,i)=><button type="button" key={p.id} className={p.id===counterSelected?.id?'selected':''}
        onClick={()=>prepareCounterQuantity(p)} role="option" aria-selected={p.id===counterSelected?.id}>
        <span><b>{p.name}</b><small>{p.barcode||p.sku||p.unit}</small></span><strong>{cash(Number(p.sale_price))}</strong>
       </button>)}
       {!counterMatches.length&&<p>Nenhum produto encontrado.</p>}
      </div>}
      <div className="counter-entry-grid">
       <label htmlFor="counter-qty">Quantidade
        <input id="counter-qty" ref={counterQtyRef} type="number" min="1" max="100000" step="1" placeholder="1" value={counterQty} onChange={e=>setCounterQty(e.target.value)}
         onKeyDown={e=>{if(e.key==='Enter'&&!e.ctrlKey){e.preventDefault();e.stopPropagation();if(counterPendingProduct)addCounterProduct(counterPendingProduct);else if(counterSelected)prepareCounterQuantity(counterSelected);else counterSearchRef.current?.focus()}}}/>
       </label>
       <label>Preço unitário<input readOnly value={counterPreview?cash(Number(counterPreview.sale_price)):cash(0)} tabIndex={-1}/></label>
       <label>Total do item<input readOnly value={counterPreview?cash(Number(counterPreview.sale_price)*counterPreviewQty):cash(0)} tabIndex={-1}/></label>
      </div>
      <button type="button" className="counter-add" disabled={!counterPendingProduct&&!counterSelected} onClick={()=>{if(counterPendingProduct)addCounterProduct(counterPendingProduct);else if(counterSelected)prepareCounterQuantity(counterSelected)}}>{counterPendingProduct?'+ Adicionar ao resumo':'Selecionar produto'} <span>Enter</span></button>
      <details className="counter-more" ref={counterCustomerDetailsRef}>
       <summary>Cliente e observações <span>opcional</span></summary>
       <div className="counter-more-body">
        <label>Localizar cliente<input ref={counterCustomerRef} autoComplete="off" placeholder="Nome, telefone ou dois últimos dígitos" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)}
         onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(customerMatches.length===1)selectSaleCustomer(customerMatches[0])}}}/></label>
        {customerSearch&&<div className="counter-customer-matches">{customerMatches.map(c=><button type="button" key={c.id} onClick={()=>selectSaleCustomer(c)}>{c.name||'Cliente'} · {c.phone||'Sem telefone'}</button>)}{!customerMatches.length&&<small>Nenhum cliente encontrado. Preencha os campos abaixo.</small>}</div>}
        <div className="counter-client-fields"><label>Nome<input value={form.customer_name} onChange={e=>updateForm('customer_name',e.target.value)}/></label><label>Telefone<input value={form.customer_phone} onChange={e=>updateForm('customer_phone',e.target.value)}/></label></div>
        <label>Observações<input value={form.note} onChange={e=>updateForm('note',e.target.value)}/></label>
       </div>
      </details>
      {(counterError||notice)&&<p className="counter-error" role="alert">{counterError||notice}</p>}
      <p className="counter-help">Código ou produto → Enter → quantidade → Enter. O item aparece na tabela lateral e o foco volta ao código.</p>
     </section>
     <section className="counter-ticket">
      <div className="counter-ticket-scroll">
       <table className="counter-ticket-table counter-summary-table">
        <colgroup><col className="counter-col-qty"/><col className="counter-col-product"/><col className="counter-col-unit"/><col className="counter-col-total"/></colgroup>
        <thead><tr><th scope="col">Quantidade</th><th scope="col">Produto</th><th scope="col">Valor unitário</th><th scope="col">Valor total</th></tr></thead>
        <tbody>{cart.map(line=><tr key={line.product.id}>
         <td className="counter-summary-quantity"><strong>{line.quantity}×</strong></td>
         <td className="counter-summary-product">
          <div><span title={line.product.name}>{line.product.name}</span>
           <button type="button" className="counter-summary-remove" title={'Remover '+line.product.name} aria-label={'Remover '+line.product.name} onClick={()=>changeQty(line.product.id,0)}>×</button>
          </div>
         </td>
         <td className="counter-summary-unit">{cash(Number(line.unit_price))}</td>
         <td className="counter-summary-total">{cash(line.quantity*line.unit_price)}</td>
        </tr>)}</tbody>
       </table>
       {!cart.length&&<div className="counter-empty"><span>▤</span><h3>Nenhum item lançado</h3><p>Pesquise um produto ou use o leitor de código de barras para começar.</p></div>}
      </div>
      
     </section>
    </div>
    
    {counterPaymentOpen&&<CounterCheckoutDialog
      total={total} discount={form.discount}
      onDiscountChange={value=>{updateForm('discount',value);setCounterPaymentError('')}}
      onClose={()=>{if(!busy){setCounterPaymentOpen(false);counterSearchRef.current?.focus()}}}
      onConfirm={(payments,customerId)=>{void saveSale(payments,customerId)}} busy={busy}
      customers={customers} balances={Object.fromEntries(customers.map(c=>[c.id,creditBalances.filter(x=>x.customer_id===c.id).reduce((sum,x)=>sum+Number(x.balance),0)]))}
      defaultCustomerId={form.customer_id}
      externalError={counterPaymentError}/>}
    <div className="counter-bottom-summary">
     <div className="counter-cash-status"><span aria-hidden="true" className="counter-register-icon">▣</span><strong>Caixa em operação</strong></div>
     <div className="counter-total-panel"><span>Total da venda</span><strong>{cash(total)}</strong>
      <button type="submit" disabled={busy||!cart.length}>{busy?'Salvando...':editing?'Salvar alterações':'Finalizar venda'} <small>Ctrl + Enter</small></button>
     </div>
    </div>
    <footer className="counter-shortcuts">
     <button type="button" onClick={()=>{setCounterPaymentOpen(false);counterSearchRef.current?.focus()}}><kbd>F1</kbd> Adicionar produto</button>
     <button type="button" onClick={startFreshCounter}><kbd>F2</kbd> Nova venda</button>
     <button type="button" onClick={()=>counterSearchRef.current?.focus()}><kbd>F3</kbd> Consultar produto</button>
     <button type="button" onClick={()=>counterSearchRef.current?.focus()}><kbd>F4</kbd> Código</button>
     <button type="button" disabled={!cart.length} onClick={()=>{const last=cart[cart.length-1];if(last&&window.confirm('Remover '+last.product.name+' da venda?'))changeQty(last.product.id,0)}}><kbd>F5</kbd> Remover item</button>
     <button type="button" onClick={()=>{if(!cart.length){setNotice('Adicione um produto primeiro.');return}setCounterPaymentError('');setCounterPaymentOpen(true);window.requestAnimationFrame(()=>document.getElementById('counter-discount')?.focus())}}><kbd>F6</kbd> Desconto</button>
     <button type="button" disabled={!counterLastOrder} onClick={()=>{if(counterLastOrder)print(counterLastOrder)}}><kbd>F7</kbd> Reimprimir</button>
     <button type="button" onClick={()=>{if(!cart.length){setNotice('Adicione um produto primeiro.');return}setCounterPaymentError('');setCounterPaymentOpen(true)}}><kbd>F8</kbd> Pagamento</button>
     <button type="button" onClick={closeSale}><kbd>Esc</kbd> Sair</button>
    </footer>
   </form>
  </section>
 </div>}

 {saleOpen&&saleChannel==='delivery'&&<div className="overlay sale-overlay"><div className="dialog card sale-workspace" role="dialog" aria-modal="true" aria-label={editing?"Editar venda":"Nova venda"}><div className="dialoghead"><div><h2>{editing?'Editar venda #'+editing.order_number:'Nova venda '+(saleChannel==='delivery'?'Delivery':'Balcão')}</h2><p>F2 abre nova venda · Esc fecha · Enter avança · F4 produtos · F6 endereço · F8 pagamento · Ctrl+Enter salva</p></div><button type="button" className="outline" onClick={closeSale} title="Fechar venda (Esc)">Fechar · Esc ×</button></div><form onKeyDown={advanceField} onSubmit={e=>{e.preventDefault();void saveSale()}}>
 <div className="salegrid"><div className="formleft"><h3>Cliente <small>(opcional)</small></h3>
 <input autoFocus value={customerSearch}
 onKeyDown={e=>{
  if(e.key==='ArrowDown'&&customerMatches.length){
   e.preventDefault();setCustomerChoiceIndex(i=>Math.min(i+1,customerMatches.length-1));return;
  }
  if(e.key==='ArrowUp'&&customerMatches.length){
   e.preventDefault();setCustomerChoiceIndex(i=>Math.max(i-1,0));return;
  }
  if(e.key==='Enter'){
   e.preventDefault();e.stopPropagation();
   const c=customerChoiceIndex>=0?customerMatches[customerChoiceIndex]:customerMatches.length===1?customerMatches[0]:undefined;
   if(c){selectSaleCustomer(c)}
   else if(!customerMatches.length)document.querySelector<HTMLElement>('[data-nav]')?.focus();
  }
 }}
 onChange={e=>{setCustomerSearch(e.target.value);setCustomerChoiceIndex(-1)}}
 placeholder="Nome, telefone ou os 2 últimos dígitos do celular" autoComplete="off"/>
 {customerSearch&&<div className="suggestions sale-customer-results">
  {customerMatches.map((c,i)=><button type="button" key={c.id}
   className={customerChoiceIndex===i?'sale-customer-active':''}
   onClick={()=>selectSaleCustomer(c)}>
   {c.name||'Cliente sem nome'} · {c.phone||'Sem telefone'}
  </button>)}
  {!customerMatches.length&&<small className="sale-search-hint">Nenhum cliente encontrado. Continue pelos campos abaixo para cadastrar.</small>}
  {customerMatches.length>1&&<small className="sale-search-hint">Encontrados {customerMatches.length} clientes. Clique no correto ou use ↓/↑ e Enter para selecionar.</small>}
 </div>}<div className="fieldgrid"><label>Nome<input data-nav value={form.customer_name} onChange={e=>updateForm('customer_name',e.target.value)}/></label><label>Telefone<input data-nav value={form.customer_phone} onChange={e=>updateForm('customer_phone',e.target.value)}/></label></div>
 {saleChannel==='delivery'&&<><h3>Endereço <small>(todos os campos opcionais)</small></h3><div className="fieldgrid">{([['street','Rua'],['neighborhood','Bairro'],['house_number','Número'],['complement','Complemento']] as const).map(([k,label])=><label key={k}>{label}<input data-nav id={k==='street'?'delivery-street':undefined} value={form[k]} onChange={e=>updateForm(k,e.target.value)}/></label>)}</div></>}
 <h3>Produtos</h3><input ref={searchRef} id="product-search" data-nav placeholder="Buscar produto / código de barras e Enter para adicionar" value={productSearch} onChange={e=>setProductSearch(e.target.value)}/>{productSearch&&<div className="suggestions">{matched.map(p=><button key={p.id} type="button" onClick={()=>addProduct(p)}>{p.name} — {cash(Number(p.sale_price))}</button>)}</div>}
   <div className="cart sale-editable-cart">{cart.map(l=><div className="cartline" key={l.product.id}><div><b>{l.product.name}</b><small>{cash(Number(l.unit_price))} / {l.product.unit}</small>{admin&&<label className="priceinput">Preço unitário<input type="number" step=".01" min="0" value={l.unit_price} onChange={e=>setCart(lines=>lines.map(x=>x.product.id===l.product.id?{...x,unit_price:Number(e.target.value)}:x))}/></label>}</div><div className="qty"><button type="button" onClick={()=>changeQty(l.product.id,l.quantity-1)}>−</button><input type="number" min="1" step="1" value={l.quantity} onChange={e=>changeQty(l.product.id,Number(e.target.value))}/><button type="button" onClick={()=>changeQty(l.product.id,l.quantity+1)}>+</button></div><b>{cash(l.quantity*l.unit_price)}</b></div>)}{!cart.length&&<p className="muted">Adicione os produtos para começar a venda.</p>}</div>

 <section className="payment-panel">
  <h3>Pagamento e entrega</h3>
  <p className="payment-panel-help">Preencha depois de selecionar os produtos. Os valores são atualizados no resumo ao lado.</p>
  <div className="payment-fields">{saleChannel==='delivery'&&<label>Taxa de entrega (R$)<input data-nav value={form.delivery_fee} onChange={e=>updateForm('delivery_fee',e.target.value)}/></label>}<label>Desconto (R$)<input data-nav value={form.discount} onChange={e=>updateForm('discount',e.target.value)}/></label><label>Forma de pagamento<select data-nav id="payment-method" value={form.payment_method} onChange={e=>updateForm('payment_method',e.target.value)}>{Object.keys(paymentLabels).map(k=><option key={k} value={k}>{paymentLabels[k]}</option>)}</select></label>{saleChannel==='delivery'&&<><label className="checkbox collect-delivery-option"><input type="checkbox" checked={form.collect_on_delivery} onChange={e=>setForm(prev=>({...prev,collect_on_delivery:e.target.checked,paid:e.target.checked?false:prev.paid,delivery_collection_amount:e.target.checked?prev.delivery_collection_amount:''}))}/><span><b>Receber valor na entrega</b><small>Cobrar do cliente na entrega. Não marca o pedido como pago.</small></span></label>{form.collect_on_delivery&&<div className="delivery-collection-field"><label htmlFor="delivery-collection-amount">Valor para receber (R$) <small>Opcional, quando diferente do total</small><input id="delivery-collection-amount" type="number" min="0.01" max="999999.99" step="0.01" inputMode="decimal" placeholder={total.toFixed(2)} value={form.delivery_collection_amount} onChange={e=>updateForm('delivery_collection_amount',e.target.value)}/></label><small>{form.delivery_collection_amount.trim()?'Valor informado: '+cash(number(form.delivery_collection_amount))+' · Total da venda: '+cash(total):'Em branco: receber o total de '+cash(total)}. Não altera o faturamento nem registra pagamento parcial.</small>{form.delivery_collection_amount.trim()&&Number.isFinite(number(form.delivery_collection_amount))&&number(form.delivery_collection_amount)>total&&<small>Troco previsto (se for em dinheiro): {cash(number(form.delivery_collection_amount)-total)}</small>}{form.delivery_collection_amount.trim()&&Number.isFinite(number(form.delivery_collection_amount))&&number(form.delivery_collection_amount)<total&&<small className="delivery-collection-warning">Valor menor que o total: confira a diferença de {cash(total-number(form.delivery_collection_amount))} antes de confirmar o pagamento integral.</small>}</div>}</>}<label className="checkbox"><input type="checkbox" checked={form.paid} onChange={e=>setForm(prev=>({...prev,paid:e.target.checked,collect_on_delivery:e.target.checked?false:prev.collect_on_delivery,delivery_collection_amount:e.target.checked?'':prev.delivery_collection_amount}))}/>Pagamento recebido</label><label>Observações<textarea value={form.note} onChange={e=>updateForm('note',e.target.value)}/></label></div>
 </section>
 </div>
 <div className="summary order-summary" aria-label="Resumo do pedido">
  <div className="order-summary-heading">
   <div><h3>Resumo do pedido</h3><small>Confira produtos e valores antes de finalizar.</small></div>
   <span className="order-summary-count">{cart.reduce((sum,line)=>sum+line.quantity,0)} un.</span>
  </div>
  <div className="order-summary-items">
   {cart.map(l=><div className="order-summary-item" key={l.product.id}>
    <div><b>{l.product.name}</b><small>{l.quantity} × {cash(Number(l.unit_price))}</small></div>
    <strong>{cash(l.quantity*l.unit_price)}</strong>
   </div>)}
   {!cart.length&&<p className="muted">Os produtos selecionados aparecerão aqui.</p>}
  </div>
  <div className="order-summary-breakdown"><div className="sumline"><span>Subtotal</span><b>{cash(subtotal)}</b></div><div className="sumline"><span>Entrega</span><b>{cash(saleChannel==='delivery'?number(form.delivery_fee):0)}</b></div>{number(form.discount)>0&&<div className="sumline"><span>Desconto</span><b>− {cash(number(form.discount))}</b></div>}<div className="sumline total"><span>Total</span><strong>{cash(total)}</strong></div>{saleChannel==='delivery'&&form.collect_on_delivery&&<div className="sumline delivery-collection-summary"><span>Valor na entrega</span><b>{cash(form.delivery_collection_amount.trim()?number(form.delivery_collection_amount):total)}</b></div>}<button type="submit" className="primary" disabled={busy||!cart.length}>{busy?'Salvando...':editing?'Salvar alterações':'Finalizar venda'}</button><small>A venda é confirmada somente após gravação no Supabase.</small></div>
 </div></div></form></div></div>}
 {newProduct&&<div className="overlay"><section className="dialog card compact"><div className="dialoghead"><h2>{editProduct?'Editar produto':'Cadastrar produto'}</h2><button className="outline" onClick={()=>setNewProduct(false)}>×</button></div><form onSubmit={saveProduct} className="fieldgrid"><label className="span2">Nome<input required value={productForm.name} onChange={e=>setProductForm(s=>({...s,name:e.target.value}))}/></label><label>Categoria<select value={productForm.category_id} onChange={e=>setProductForm(s=>({...s,category_id:e.target.value}))}><option value="">Sem categoria</option>{cats.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Unidade<input value={productForm.unit} onChange={e=>setProductForm(s=>({...s,unit:e.target.value}))}/></label><label>Preço de compra<input required value={productForm.purchase_price} onChange={e=>setProductForm(s=>({...s,purchase_price:e.target.value}))}/></label><label>Preço de venda<input required value={productForm.sale_price} onChange={e=>setProductForm(s=>({...s,sale_price:e.target.value}))}/></label><label>Código de barras<input value={productForm.barcode} onChange={e=>setProductForm(s=>({...s,barcode:e.target.value}))}/></label><label>SKU<input value={productForm.sku} onChange={e=>setProductForm(s=>({...s,sku:e.target.value}))}/></label><label className="checkbox span2"><input type="checkbox" checked={productForm.track_stock} onChange={e=>setProductForm(s=>({...s,track_stock:e.target.checked}))}/>Controlar estoque</label>{productForm.track_stock&&<><label>Quantidade em estoque<input value={productForm.stock_qty} onChange={e=>setProductForm(s=>({...s,stock_qty:e.target.value}))}/></label><label>Estoque mínimo<input value={productForm.min_stock} onChange={e=>setProductForm(s=>({...s,min_stock:e.target.value}))}/></label></>}<label className="checkbox span2"><input type="checkbox" checked={productForm.active} onChange={e=>setProductForm(s=>({...s,active:e.target.checked}))}/>Produto ativo</label><button className="primary span2" disabled={busy}>Salvar produto</button></form></section></div>}
 {newCustomer&&<div className="overlay"><section className="dialog card compact"><div className="dialoghead"><h2>{editCustomer?'Editar cliente':'Novo cliente'}</h2><button className="outline" onClick={()=>setNewCustomer(false)}>×</button></div><form onSubmit={saveCustomer} className="fieldgrid">{([['name','Nome'],['phone','Telefone'],['street','Rua'],['neighborhood','Bairro'],['house_number','Número'],['complement','Complemento']] as const).map(([k,label])=><label key={k}>{label}<input value={custForm[k]} onChange={e=>setCustForm(s=>({...s,[k]:e.target.value}))}/></label>)}<p className="span2">Todos os campos são opcionais individualmente; informe pelo menos nome ou telefone.</p><button className="primary span2" disabled={busy}>Salvar cliente</button></form></section></div>}
 </div>
}
export default App;
