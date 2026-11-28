import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent,KeyboardEvent as ReactKey} from 'react';
import {supabase as sb} from './supabase';
import './stock.css';

type StockProduct={
 id:string;name:string;barcode:string|null;sku:string|null;unit:string;
 category_id:number|null;purchase_price:number;sale_price:number;
 track_stock:boolean;stock_qty:number;min_stock:number;active:boolean;
 fardo_enabled:boolean;units_per_fardo:number;fardo_sale_price:number;fardo_barcode:string|null;
 closed_fardos:number;loose_units:number;
};
type StockCategory={id:number;name:string};
type StockOperator={user_id:string;display_name:string};
type StockMovement={
 id:number;product_id:string;order_id:string|null;qty_change:number;reason:string;
 actor:string|null;created_at:string;note:string|null;qty_before:number|null;qty_after:number|null;
 entry_unit_cost:number|null;entry_total_cost:number|null;avg_cost_before:number|null;avg_cost_after:number|null;
 fardo_entry_qty:number|null;units_per_fardo_snapshot:number|null;
 closed_fardos_before:number|null;closed_fardos_after:number|null;loose_units_before:number|null;loose_units_after:number|null;fardos_opened:number|null;
};
type Action='entrada'|'saida'|'inventario';
type StockFilter='todos'|'baixo'|'esgotado'|'normal'|'sem_controle';
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const averageMoney=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4,maximumFractionDigits:4});
const quantity=(n:number)=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const dateTime=(v:string)=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'});
const actionLabels:Record<Action,string>={entrada:'Entrada',saida:'Saída',inventario:'Ajuste de inventário'};
const reasonLabels:Record<string,string>={
 venda:'Venda',edicao:'Edição de venda',cancelamento:'Cancelamento',
 ajuste:'Ajuste no cadastro',entrada:'Entrada de mercadorias',saida:'Saída manual',inventario:'Ajuste de inventário'
};
function stockStatus(p:StockProduct){
 if(!p.track_stock)return {key:'off',text:'Sem controle'};
 if(Number(p.stock_qty)<=0)return {key:'empty',text:'Esgotado'};
 if(Number(p.min_stock)>0&&Number(p.stock_qty)<=Number(p.min_stock))return {key:'low',text:'Estoque baixo'};
 return {key:'ok',text:'Normal'};
}
function parseQty(v:string):number|null{
 const raw=v.trim();
 if(!/^(?:0|[1-9]\d{0,5})(?:[.,]\d{1,3})?$/.test(raw))return null;
 const result=Number(raw.replace(',','.'));
 return Number.isFinite(result)&&result>=0&&result<=999999?result:null;
}
function parseCost(v:string):number|null{
 const raw=v.trim();
 if(!/^(?:0|[1-9]\d{0,5})(?:[.,]\d{1,2})?$/.test(raw))return null;
 const result=Number(raw.replace(',','.'));
 return Number.isFinite(result)&&result>0&&result<=999999.99?result:null;
}
function StockActionModal({products,initialProduct,initialAction,busy,onClose,onSuccess}:{
 products:StockProduct[];initialProduct:string|null;initialAction:Action;
 busy:boolean;onClose:()=>void;onSuccess:(message:string)=>Promise<void>;
}){
 const [action,setAction]=useState<Action>(initialAction);
 const [productId,setProductId]=useState<string|null>(initialProduct);
 const [search,setSearch]=useState('');
 const [highlight,setHighlight]=useState(0);
 const [value,setValue]=useState(()=>{
  const p=products.find(v=>v.id===initialProduct);
  return p?.fardo_enabled&&initialAction==='inventario'?String(p.closed_fardos):'';
 });
 const [exitFormat,setExitFormat]=useState<'unidade'|'fardo'>('fardo');
 const [looseCount,setLooseCount]=useState(()=>{
  const p=products.find(v=>v.id===initialProduct);
  return p?.fardo_enabled&&initialAction==='inventario'?String(p.loose_units):'';
 });
 const [entryPrice,setEntryPrice]=useState(()=>{
  const product=products.find(p=>p.id===initialProduct);
  return product&&Number(product.purchase_price)>0?(Number(product.purchase_price)*(product.fardo_enabled?product.units_per_fardo:1)).toFixed(2).replace('.',','):'';
 });
 const [note,setNote]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const requestId=useRef(crypto.randomUUID());
 const searchRef=useRef<HTMLInputElement>(null);
 const qtyRef=useRef<HTMLInputElement>(null);
 const looseRef=useRef<HTMLInputElement>(null);
 const priceRef=useRef<HTMLInputElement>(null);
 const noteRef=useRef<HTMLInputElement>(null);
 const formRef=useRef<HTMLFormElement>(null);
 const selected=products.find(p=>p.id===productId&&p.active&&p.track_stock);
 const tracked=products.filter(p=>p.active&&p.track_stock);
 const term=search.trim().toLocaleLowerCase('pt-BR');
 const matches=term?tracked.filter(p=>[p.name,p.barcode,p.fardo_barcode,p.sku].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(term))).slice(0,8):[];
 const parsed=parseQty(value);
 const parsedLoose=parseQty(looseCount);
 const parsedPrice=parseCost(entryPrice);
 const isPack=Boolean(selected?.fardo_enabled);
 const factor=Number(selected?.units_per_fardo||1);
 const entryTotal=action==='entrada'&&parsed!==null&&parsedPrice!==null?Math.round((parsed*parsedPrice+Number.EPSILON)*100)/100:null;
 const entryUnits=parsed!==null?parsed*(isPack?factor:1):null;
 const averagePreview=action==='entrada'&&selected&&entryUnits!==null&&entryUnits>0&&entryTotal!==null
  ?Number(((Number(selected.stock_qty)*Number(selected.purchase_price)+entryTotal)/(Number(selected.stock_qty)+entryUnits)).toFixed(4)):null;
 const estimate=selected&&parsed!==null?
  (action==='entrada'?Number(selected.stock_qty)+parsed*(isPack?factor:1):
   action==='saida'?Number(selected.stock_qty)-parsed*(isPack&&exitFormat==='fardo'?factor:1):
   isPack?(parsedLoose===null?null:parsed*factor+parsedLoose):parsed):null;
 useEffect(()=>{if(initialProduct)qtyRef.current?.focus();else searchRef.current?.focus()},[initialProduct]);
 const resetRequest=()=>{requestId.current=crypto.randomUUID();setError('')};
 const pick=(p:StockProduct)=>{
  setProductId(p.id);setSearch('');setValue(p.fardo_enabled&&action==='inventario'?String(p.closed_fardos):'');
  setLooseCount(p.fardo_enabled&&action==='inventario'?String(p.loose_units):'');
  setExitFormat('fardo');
  setEntryPrice(Number(p.purchase_price)>0?(Number(p.purchase_price)*(p.fardo_enabled?p.units_per_fardo:1)).toFixed(2).replace('.',','):'');
  setNote('');setHighlight(0);resetRequest();window.requestAnimationFrame(()=>qtyRef.current?.focus())
 };
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(saving||busy)return;
  if(!selected){setError('Selecione um produto com controle de estoque ativado.');return}
  if(parsed===null||(action!=='inventario'&&parsed<=0)|| (isPack&&(parsed!==Math.trunc(parsed)||(action==='inventario'&&(parsedLoose===null||parsedLoose!==Math.trunc(parsedLoose)))))){
   setError(isPack?'Informe quantidades inteiras de fardos e unidades avulsas.':'Informe uma quantidade válida.');
   qtyRef.current?.focus();return;
  }
  if(action==='entrada'&&parsedPrice===null){setError('Informe o preço de entrada por unidade (maior que zero, até 2 casas decimais).');priceRef.current?.focus();return}
  if((action==='saida'||action==='inventario')&&!note.trim()){setError('Informe o motivo da saída ou do ajuste.');noteRef.current?.focus();return}
  if(estimate===null||estimate<0||estimate>999999){setError('Estoque insuficiente ou acima do limite permitido.');return}
  if(action==='inventario'&&estimate===Number(selected.stock_qty)){setError('A quantidade informada é igual ao estoque atual.');return}
  setSaving(true);setError('');
  try{
   if(action==='entrada'){
    if(isPack){
     const {error:entryError}=await sb.rpc('record_fardo_entry',{
      p_product_id:selected.id,p_fardos:parsed,p_cost_per_fardo:parsedPrice,p_note:note.trim()||null,p_request_id:requestId.current
     });
     if(entryError)throw entryError;
    }else{
     const {error:entryError}=await sb.rpc('record_stock_entry',{
      p_product_id:selected.id,p_quantity:parsed,p_unit_cost:parsedPrice,p_note:note.trim()||null,p_request_id:requestId.current
     });
     if(entryError)throw entryError;
    }
    await onSuccess('Entrada registrada para '+selected.name+' · '+money(entryTotal||0)+' · custo médio atualizado.');
   }else{
    if(isPack){
     const {error:movementError}=await sb.rpc('record_fardo_movement',{
      p_product_id:selected.id,p_action:action,p_format:exitFormat,p_quantity:parsed,
      p_loose_units:action==='inventario'?parsedLoose:null,p_note:note.trim()||null,p_request_id:requestId.current
     });
     if(movementError)throw movementError;
    }else{
     const {error:movementError}=await sb.rpc('record_stock_movement',{
      p_product_id:selected.id,p_action:action,p_quantity:parsed,p_note:note.trim()||null,p_request_id:requestId.current
     });
     if(movementError)throw movementError;
    }
    await onSuccess(actionLabels[action]+' registrada para '+selected.name+'.');
   }
   onClose();
  }catch(err){setError(err instanceof Error?err.message:String(err))}
  finally{setSaving(false)}
 };
 const handleKeys=(e:ReactKey<HTMLDivElement>)=>{
  if(e.key==='Escape'&&!saving){e.preventDefault();e.stopPropagation();onClose()}
 };
 return <div className="stock-modal-overlay">
  <div className="stock-modal" role="dialog" aria-modal="true" aria-label="Movimentação de estoque" onKeyDown={handleKeys}>
   <header className="stock-modal-header">
    <div><small>GELADÃO · GESTÃO DE MERCADORIAS</small><h2>{actionLabels[action]}</h2></div>
    <button type="button" onClick={onClose} aria-label="Fechar" disabled={saving}>×</button>
   </header>
   <form ref={formRef} onSubmit={save}>
    <div className="stock-action-switch" role="group" aria-label="Tipo de movimentação">
     {(['entrada','saida','inventario'] as Action[]).map(kind=><button type="button" key={kind}
      className={action===kind?'selected':''} onClick={()=>{setAction(kind);setValue(selected?.fardo_enabled&&kind==='inventario'?String(selected.closed_fardos):'');
       setLooseCount(selected?.fardo_enabled&&kind==='inventario'?String(selected.loose_units):'');
       setNote('');resetRequest();qtyRef.current?.focus()}}
      disabled={saving}>{actionLabels[kind]}</button>)}
    </div>
    <div className="stock-modal-fields">
     <label htmlFor="stock-product-search">Produto</label>
     {selected?<div className="stock-selected-product"><div><strong>{selected.name}</strong><small>{selected.barcode||selected.sku||selected.unit}</small></div>
      <button type="button" onClick={()=>{setProductId(null);resetRequest();window.requestAnimationFrame(()=>searchRef.current?.focus())}} disabled={saving}>Trocar produto</button></div>:<>
      <input id="stock-product-search" ref={searchRef} autoComplete="off" placeholder="Digite nome, código de barras ou SKU"
       value={search} onChange={e=>{setSearch(e.target.value);setHighlight(0)}} disabled={saving}
       onKeyDown={e=>{
        if(e.key==='ArrowDown'&&matches.length){e.preventDefault();setHighlight(n=>Math.min(n+1,matches.length-1))}
        if(e.key==='ArrowUp'&&matches.length){e.preventDefault();setHighlight(n=>Math.max(0,n-1))}
        if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(matches[highlight])pick(matches[highlight]);else setError('Produto não encontrado. Ative o controle na aba Produtos.')}
       }}/>
      {term&&<div className="stock-search-results" role="listbox" aria-label="Produtos encontrados">
       {matches.map((p,i)=><button type="button" role="option" aria-selected={i===highlight} className={i===highlight?'selected':''}
        key={p.id} onClick={()=>pick(p)}><span>{p.name}<small>{p.barcode||p.sku||p.unit}</small></span><b>{quantity(Number(p.stock_qty))} {p.unit}</b></button>)}
       {!matches.length&&<p>Nenhum produto controlado encontrado.</p>}
      </div>}
     </>}
     {selected&&<div className="stock-current"><span>Estoque atual</span><strong>{quantity(Number(selected.stock_qty))} {selected.unit}</strong></div>}
     {selected?.fardo_enabled&&<div className="stock-pack-physical">
      <div><span>Fardos fechados</span><strong>{Number(selected.closed_fardos)}</strong></div>
      <div><span>Unidades avulsas</span><strong>{quantity(Number(selected.loose_units))}</strong></div>
      <div><span>Unid. por fardo</span><strong>{selected.units_per_fardo}</strong></div>
     </div>}
     {selected?.fardo_enabled&&action==='saida'&&<div className="stock-pack-exit-format" role="group" aria-label="Retirar fardos ou unidades">
      <button type="button" className={exitFormat==='fardo'?'selected':''} onClick={()=>{setExitFormat('fardo');setValue('');resetRequest()}}>Fardos fechados</button>
      <button type="button" className={exitFormat==='unidade'?'selected':''} onClick={()=>{setExitFormat('unidade');setValue('');resetRequest()}}>Unidades avulsas</button>
     </div>}
     <label htmlFor="stock-quantity">{selected?.fardo_enabled
       ?action==='entrada'?'Quantidade recebida (fardos)':action==='saida'?('Quantidade retirada ('+(exitFormat==='fardo'?'fardos':'unidades')+')'):'Fardos fechados contados'
       :action==='entrada'?'Quantidade recebida':action==='saida'?'Quantidade retirada':'Nova quantidade contada'}</label>
     <input id="stock-quantity" ref={qtyRef} type="text" inputMode="decimal" autoComplete="off" placeholder="Ex.: 30"
      value={value} onChange={e=>{setValue(e.target.value);resetRequest()}} disabled={saving||!selected}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();
       if(action==='entrada')priceRef.current?.focus();
       else if(action==='inventario'&&isPack)looseRef.current?.focus();
       else noteRef.current?.focus()
      }}}/>
     {action==='inventario'&&selected?.fardo_enabled&&<>
      <label htmlFor="stock-loose-qty">Unidades avulsas contadas</label>
      <input id="stock-loose-qty" ref={looseRef} type="number" min="0" step="1" inputMode="numeric"
       value={looseCount} onChange={e=>{setLooseCount(e.target.value);resetRequest()}} disabled={saving}
       onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();noteRef.current?.focus()}}}/>
      <p className="stock-key-help">Informe exatamente a quantidade física: fardos lacrados + unidades fora dos fardos.</p>
     </>}
     {action==='entrada'&&<div className="stock-entry-cost-fields">
      <label htmlFor="stock-entry-cost">{isPack?'Preço de compra por fardo (R$)':'Preço de entrada por unidade (R$)'}</label>
      <input id="stock-entry-cost" ref={priceRef} type="text" inputMode="decimal" autoComplete="off"
       placeholder="Ex.: 75,00" value={entryPrice} disabled={saving||!selected}
       onChange={e=>{setEntryPrice(e.target.value);resetRequest()}}
       onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();formRef.current?.requestSubmit()}}}/>
      <p>{isPack?'Informe o custo de um fardo fechado; o sistema calculará custo unitário e média automaticamente.':'Preenchido com o custo atual; ajuste conforme o preço pago.'}</p>
      {entryTotal!==null&&selected&&<div className="stock-entry-cost-summary">
       <div><span>Total da entrada</span><strong>{money(entryTotal)}</strong></div>
       <div><span>Custo médio atual</span><strong>{averageMoney(Number(selected.purchase_price))}</strong></div>
       {averagePreview!==null&&<div><span>Novo custo médio previsto</span><strong>{averageMoney(averagePreview)}</strong></div>}
      </div>}
     </div>}
     {estimate!==null&&selected&&<div className={'stock-projected '+(estimate<0?'negative':'')}>
      <span>Saldo previsto</span><strong>{quantity(estimate)} {selected.unit}</strong>
     </div>}
     <label htmlFor="stock-note">Motivo / observação {action==='entrada'?'(opcional)':'(obrigatório)'}</label>
     <input id="stock-note" ref={noteRef} autoComplete="off" maxLength={300} value={note}
      placeholder={action==='entrada'?'Ex.: Reposição do fornecedor':action==='saida'?'Ex.: Quebra, vencimento, retirada':'Ex.: Contagem física realizada'}
      onChange={e=>{setNote(e.target.value);resetRequest()}} disabled={saving}/>
     {error&&<p className="stock-error" role="alert">{error}</p>}
     <p className="stock-key-help">Código → Enter → quantidade → {action==='entrada'?'Enter → preço de entrada → Enter para registrar':'motivo → Enter para registrar'}. Esc para fechar.</p>
    </div>
    <footer className="stock-modal-actions">
     <button className="outline" type="button" onClick={onClose} disabled={saving}>Cancelar · Esc</button>
     <button className="primary" type="submit" disabled={!selected||saving||busy}>{saving?'Registrando...':'Confirmar '+actionLabels[action]}</button>
    </footer>
   </form>
  </div>
 </div>;
}
export default function StockPage({products,categories,operators,admin,onReload}:{
 products:StockProduct[];categories:StockCategory[];operators:StockOperator[];admin:boolean;onReload:()=>Promise<void>;
}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<StockFilter>('todos');
 const [historyQuery,setHistoryQuery]=useState('');
 const [historyFilter,setHistoryFilter]=useState('todos');
 const [movements,setMovements]=useState<StockMovement[]>([]);
 const [loading,setLoading]=useState(false);
 const [historyError,setHistoryError]=useState('');
 const [notice,setNotice]=useState('');
 const [action,setAction]=useState<Action|null>(null);
 const [initialProduct,setInitialProduct]=useState<string|null>(null);
 const controlled=products.filter(p=>p.active&&p.track_stock);
 const low=controlled.filter(p=>stockStatus(p).key==='low');
 const empty=controlled.filter(p=>stockStatus(p).key==='empty');
 const value=controlled.reduce((sum,p)=>sum+Number(p.stock_qty)*Number(p.purchase_price),0);
 const loadHistory=useCallback(async()=>{
  setLoading(true);setHistoryError('');
  try{
   const {data,error}=await sb.from('stock_movements')
    .select('id,product_id,order_id,qty_change,reason,actor,created_at,note,qty_before,qty_after,entry_unit_cost,entry_total_cost,avg_cost_before,avg_cost_after,fardo_entry_qty,units_per_fardo_snapshot,closed_fardos_before,closed_fardos_after,loose_units_before,loose_units_after,fardos_opened')
    .order('created_at',{ascending:false}).limit(500);
   if(error)throw error;
   setMovements((data||[]) as StockMovement[]);
  }catch(err){setHistoryError(err instanceof Error?err.message:String(err))}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void loadHistory()},[loadHistory]);
 const refreshAll=async()=>{await Promise.all([onReload(),loadHistory()])};
 const open=(kind:Action,product:string|null=null)=>{setInitialProduct(product);setAction(kind);setNotice('')};
 const lower=query.trim().toLocaleLowerCase('pt-BR');
 const display=useMemo(()=>products.filter(p=>{
  const matches=!lower||[p.name,p.barcode,p.fardo_barcode,p.sku].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(lower));
  if(!matches)return false;
  const status=stockStatus(p).key;
  if(filter==='todos')return p.active&&p.track_stock;
  if(filter==='baixo')return status==='low';
  if(filter==='esgotado')return status==='empty';
  if(filter==='sem_controle')return !p.track_stock&&p.active;
  return status==='ok';
 }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),[products,lower,filter]);
 const movementRows=movements.filter(m=>{
  const p=products.find(x=>x.id===m.product_id);
  const matches=!historyQuery||[p?.name,p?.barcode,p?.fardo_barcode,p?.sku,String(m.order_id||'')].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(historyQuery.toLocaleLowerCase('pt-BR')));
  if(!matches)return false;
  if(historyFilter==='todos')return true;
  if(historyFilter==='vendas')return ['venda','edicao','cancelamento'].includes(m.reason);
  if(historyFilter==='ajustes')return ['ajuste','inventario'].includes(m.reason);
  return m.reason===historyFilter;
 });
 const category=(p:StockProduct)=>categories.find(c=>c.id===p.category_id)?.name||'Sem categoria';
 const actor=(id:string|null)=>operators.find(o=>o.user_id===id)?.display_name|| (id?'Operador':'Sistema');
 return <div className="stock-page">
  <div className="stock-page-heading">
   <div><h2>Controle de estoque</h2><p>Entradas, saídas, inventário e rastreamento automático das vendas.</p></div>
   <div className="stock-heading-actions">
    <button className="outline" type="button" onClick={()=>void refreshAll()} disabled={loading}>↻ Atualizar</button>
    {admin&&<button className="primary" type="button" onClick={()=>open('entrada')}>+ Entrada de mercadorias</button>}
   </div>
  </div>
  <div className="stock-metrics">
   <article className="card stock-metric"><span>Produtos controlados</span><strong>{controlled.length}</strong><small>Com controle de estoque ativado</small></article>
   <article className="card stock-metric"><span>Estoque baixo</span><strong>{low.length}</strong><small>Até o limite mínimo configurado</small></article>
   <article className="card stock-metric"><span>Produtos esgotados</span><strong>{empty.length}</strong><small>Quantidade disponível igual a zero</small></article>
   <article className="card stock-metric"><span>Valor em estoque</span><strong>{money(value)}</strong><small>Quantidade × custo médio ponderado</small></article>
  </div>
  <section className="card stock-products-card">
   <div className="stock-section-head"><div><h3>Mercadorias</h3><p>Consulte saldos e opere apenas produtos que possuem controle ativado.</p></div>
    {admin&&<div className="stock-quick-actions">
     <button type="button" className="outline" onClick={()=>open('saida')}>− Registrar saída</button>
     <button type="button" className="outline" onClick={()=>open('inventario')}>≡ Ajustar inventário</button>
    </div>}
   </div>
   <div className="stock-controls">
    <input type="search" aria-label="Buscar produto ou código" placeholder="Buscar por nome, código de barras ou SKU"
     value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="stock-filters" role="group" aria-label="Filtrar estoque">
     {([{id:'todos',label:'Controlados'},{id:'baixo',label:'Baixo'},{id:'esgotado',label:'Esgotados'},{id:'normal',label:'Normal'},{id:'sem_controle',label:'Sem controle'}] as {id:StockFilter;label:string}[]).map(x=><button
       key={x.id} type="button" className={filter===x.id?'selected':''} onClick={()=>setFilter(x.id)}>{x.label}</button>)}
    </div>
   </div>
   <div className="stock-table-wrap"><table className="stock-table">
    <thead><tr><th>Produto</th><th>Código</th><th>Fardos fechados</th><th>Unidades avulsas</th><th>Total unidades</th><th>Mínimo</th><th>Situação</th><th>Custo médio/un.</th><th>Valor em estoque</th><th>Ações</th></tr></thead>
    <tbody>{display.map(p=><tr key={p.id}>
     <td><div className="stock-name"><strong>{p.name}</strong><small>{category(p)} · {p.unit}{p.fardo_enabled?' · '+p.units_per_fardo+' un./fardo':''}</small></div></td>
     <td className="stock-code">{p.barcode||p.fardo_barcode||p.sku||'—'}</td>
     <td><strong className="stock-amount">{p.fardo_enabled?Number(p.closed_fardos):'—'}</strong></td>
     <td><strong>{p.fardo_enabled?quantity(Number(p.loose_units)):'—'}</strong></td>
     <td><strong className="stock-amount">{p.track_stock?quantity(Number(p.stock_qty)):'—'}</strong></td>
     <td>{p.track_stock?quantity(Number(p.min_stock)):'—'}</td>
     <td><span className={'stock-status '+stockStatus(p).key}>{stockStatus(p).text}</span></td>
     <td>{p.track_stock?averageMoney(Number(p.purchase_price)):'—'}</td>
     <td>{p.track_stock?money(Number(p.stock_qty)*Number(p.purchase_price)):'—'}</td>
     <td>{admin&&p.active&&p.track_stock?<div className="stock-row-actions">
      <button className="outline" type="button" onClick={()=>open('entrada',p.id)} title="Entrada de mercadoria">+ Entrada</button>
      <button className="outline" type="button" onClick={()=>open('saida',p.id)} title="Registrar saída">− Saída</button>
      <button className="outline" type="button" onClick={()=>open('inventario',p.id)} title="Contagem física">Ajustar</button>
     </div>:<small>{p.track_stock?'Somente administrador':'Ative em Produtos'}</small>}</td>
    </tr>)}</tbody>
   </table></div>
   {!display.length&&<div className="stock-empty"><strong>{!controlled.length&&filter==='todos'?'Nenhum produto com controle ativado':'Nenhum produto encontrado'}</strong>
    <p>{!controlled.length&&filter==='todos'?'Ative “Controlar estoque” no cadastro do produto. Depois registre a quantidade inicial nesta aba.':'Altere a busca ou o filtro para ver outros produtos.'}</p>
   </div>}
   <p className="stock-table-help">Produtos sem controle continuam disponíveis para venda normalmente, mas não entram nos saldos nem nos alertas de reposição.</p>
  </section>
  <section className="card stock-history">
   <div className="stock-section-head"><div><h3>Histórico de movimentações</h3><p>Vendas, reposições, perdas, cancelamentos e ajustes registrados no Supabase.</p></div><span>{movementRows.length} registros exibidos</span></div>
   <div className="stock-history-tools">
    <input type="search" placeholder="Buscar movimentação por produto ou código" aria-label="Buscar histórico" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/>
    <select aria-label="Tipo de movimentação" value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}>
     <option value="todos">Todos os movimentos</option><option value="entrada">Entradas</option>
     <option value="saida">Saídas manuais</option><option value="ajustes">Ajustes</option>
     <option value="vendas">Vendas / cancelamentos</option>
    </select>
   </div>
   {historyError&&<p role="alert" className="stock-error">{historyError}</p>}
   <div className="stock-table-wrap"><table className="stock-table stock-history-table">
    <thead><tr><th>Data</th><th>Produto</th><th>Operação</th><th>Variação</th><th>Fardos / avulsas</th><th>Antes → Depois</th><th>Custo entrada</th><th>Total entrada</th><th>Custo médio antes → depois</th><th>Responsável</th><th>Motivo</th></tr></thead>
    <tbody>{movementRows.map(m=>{
     const p=products.find(x=>x.id===m.product_id);
     return <tr key={m.id}>
      <td>{dateTime(m.created_at)}</td><td><strong>{p?.name||'Produto não localizado'}</strong></td>
      <td>{reasonLabels[m.reason]||m.reason}{m.fardo_entry_qty!==null?' · '+m.fardo_entry_qty+' fardo(s)':''}</td>
      <td><b className={Number(m.qty_change)>0?'stock-positive':'stock-negative'}>{Number(m.qty_change)>0?'+':''}{quantity(Number(m.qty_change))}</b></td>
      <td>{m.closed_fardos_before!==null&&m.closed_fardos_after!==null?
       'Fechados: '+m.closed_fardos_before+' → '+m.closed_fardos_after+
       ' / Avulsas: '+quantity(Number(m.loose_units_before))+' → '+quantity(Number(m.loose_units_after))+
       (Number(m.fardos_opened)>0?' / Abertos: '+m.fardos_opened:''):'—'}</td>
      <td>{m.qty_before!==null&&m.qty_after!==null?quantity(Number(m.qty_before))+' → '+quantity(Number(m.qty_after)):'—'}</td>
      <td>{m.entry_unit_cost!==null?money(Number(m.entry_unit_cost))+(m.fardo_entry_qty!==null?' / fardo':' / unidade'):'—'}</td>
      <td>{m.entry_total_cost!==null?money(Number(m.entry_total_cost)):'—'}</td>
      <td>{m.avg_cost_before!==null&&m.avg_cost_after!==null?averageMoney(Number(m.avg_cost_before))+' → '+averageMoney(Number(m.avg_cost_after)):'—'}</td>
      <td>{actor(m.actor)}</td><td>{m.note|| (m.order_id?'Movimentação automática da venda':'—')}</td>
     </tr>
    })}</tbody>
   </table></div>
   {loading&&<p className="stock-table-help">Atualizando movimentações...</p>}
   {!loading&&!movementRows.length&&<div className="stock-empty"><strong>Sem movimentações nesse filtro</strong><p>Entradas e vendas aparecerão aqui quando registradas.</p></div>}
   {movements.length>=500&&<p className="stock-table-help">Exibindo no máximo as últimas 500 movimentações. A consulta completa permanece no banco.</p>}
  </section>
  {notice&&<p role="status" className="stock-success">{notice}<button type="button" onClick={()=>setNotice('')}>×</button></p>}
  {action&&<StockActionModal key={action+'-'+(initialProduct||'new')} products={products} initialProduct={initialProduct}
   initialAction={action} busy={loading} onClose={()=>setAction(null)}
   onSuccess={async message=>{await refreshAll();setNotice(message)}}/>}
 </div>;
}
