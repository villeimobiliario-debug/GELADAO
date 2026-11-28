import {useEffect,useMemo,useState} from 'react';
import {supabase as sb} from './supabase';
import './stock-intelligence.css';

type Product={
 id:string;name:string;active:boolean;track_stock:boolean;
 stock_qty:number;min_stock:number;fardo_enabled:boolean;units_per_fardo:number;
 closed_fardos:number;loose_units:number;created_at?:string;
};
type Demand={product_id:string;units_sold:number;order_count:number;last_sold_at:string|null};
const fmt=(n:number)=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:1});
const locale=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export default function StockIntelligence({products,admin,refreshToken,onRestock}:{
 products:Product[];admin:boolean;refreshToken:number;onRestock:(id:string)=>void
}){
 const [stats,setStats]=useState<Demand[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [targetDays,setTargetDays]=useState(14);
 const [term,setTerm]=useState('');
 const [request,setRequest]=useState(0);
 useEffect(()=>{
  let valid=true;
  const load=async()=>{
   setLoading(true);setError('');
   const {data,error:rpcError}=await sb.rpc('stock_demand_summary',{p_days:30});
   if(!valid)return;
   if(rpcError){setError(rpcError.message);setStats([])}
   else setStats((data||[]) as Demand[]);
   setLoading(false);
  };
  void load();
  return()=>{valid=false};
 },[refreshToken,request]);
 const analysis=useMemo(()=>{
  const byId=new Map(stats.map(x=>[x.product_id,x]));
  return products.filter(p=>p.active&&p.track_stock).map(product=>{
   const row=byId.get(product.id);
   const sold=Number(row?.units_sold||0);
   const avg=sold/30;
   const stock=Math.max(0,Number(product.stock_qty)||0);
   const min=Math.max(0,Number(product.min_stock)||0);
   const cover=avg>0?stock/avg:null;
   const shortage=Math.max(0,Math.ceil(avg*targetDays+min-stock));
   const factor=product.fardo_enabled?Math.max(1,Number(product.units_per_fardo)||1):1;
   const suggestedFardos=product.fardo_enabled?Math.ceil(shortage/factor):0;
   const suggestedUnits=product.fardo_enabled?suggestedFardos*factor:shortage;
   const low=stock<=0||(min>0&&stock<=min)||(cover!==null&&cover<7);
   const existed30Days=product.created_at?new Date(product.created_at).getTime()<=Date.now()-30*86400000:false;
   const stagnant=stock>0&&sold<=0&&existed30Days;
   return {product,sold,orders:Number(row?.order_count||0),avg,stock,min,cover,low,
    stagnant,suggestedUnits,suggestedFardos,shortage};
  });
 },[products,stats,targetDays]);
 const alerts=analysis.filter(x=>x.low).sort((a,b)=>{
  if(a.stock<=0&&b.stock>0)return -1;
  if(b.stock<=0&&a.stock>0)return 1;
  return (a.cover??999)-(b.cover??999);
 });
 const ranking=analysis.filter(x=>x.sold>0).sort((a,b)=>b.sold-a.sold).slice(0,5);
 const stagnant=analysis.filter(x=>x.stagnant).sort((a,b)=>a.product.name.localeCompare(b.product.name,'pt-BR'));
 const order=analysis.filter(x=>x.suggestedUnits>0&&x.avg>0)
  .sort((a,b)=>Number(b.low)-Number(a.low)||a.product.name.localeCompare(b.product.name,'pt-BR'));
 const filtered=order.filter(x=>locale(x.product.name).includes(locale(term.trim())));
 return <section className="stock-ai card" aria-label="Reposição inteligente">
  <header className="stock-ai-heading">
   <div><h3>Reposição inteligente</h3><p>Consumo real dos últimos 30 dias, contabilizado em unidades equivalentes (fardos incluídos).</p></div>
   <div className="stock-ai-heading-actions">
    <label>Planejar para
     <select value={targetDays} onChange={e=>setTargetDays(Number(e.target.value))}>
      <option value={7}>7 dias</option><option value={14}>14 dias</option><option value={21}>21 dias</option><option value={30}>30 dias</option>
     </select>
    </label>
    <button type="button" className="outline" disabled={loading} onClick={()=>setRequest(n=>n+1)}>↻ Recalcular</button>
   </div>
  </header>
  {error?<p className="stock-ai-error" role="alert">Não foi possível consultar as vendas: {error}. Nenhuma sugestão foi estimada.</p>:null}
  {loading?<p className="stock-ai-loading" role="status">Calculando giro e necessidade de reposição...</p>:!error&&<>
   <div className="stock-ai-kpis">
    <div><small>Precisam de atenção</small><strong>{alerts.length}</strong><span>Esgotados, abaixo do mínimo ou menos de 7 dias de cobertura</span></div>
    <div><small>Com sugestão de compra</small><strong>{order.length}</strong><span>Considerando {targetDays} dias de demanda + estoque mínimo</span></div>
    <div><small>Sem vendas em 30 dias</small><strong>{stagnant.length}</strong><span>Com estoque e cadastro anterior ao período</span></div>
   </div>
   <div className="stock-ai-columns">
    <div className="stock-ai-panel">
     <h4>Alertas de estoque</h4>
     {alerts.length?alerts.slice(0,7).map(x=><div className="stock-ai-alert" key={x.product.id}>
      <span><strong>{x.product.name}</strong><small>{x.stock===0?'Esgotado':x.cover!==null?fmt(x.cover)+' dias de cobertura':'Abaixo do mínimo'}</small></span>
      <b>{fmt(x.stock)} un.</b>
     </div>):<p className="stock-ai-empty">Nenhum alerta neste momento.</p>}
    </div>
    <div className="stock-ai-panel">
     <h4>Ranking de saída · 30 dias</h4>
     {ranking.length?ranking.map((x,i)=><div className="stock-ai-rank" key={x.product.id}>
      <span className="stock-ai-rank-num">{i+1}</span>
      <span>{x.product.name}</span>
      <strong>{fmt(x.sold)} un.</strong>
     </div>):<p className="stock-ai-empty">Ainda não há vendas registradas no período para produtos controlados.</p>}
     {stagnant.length>0&&<p className="stock-ai-stagnant"><b>Sem giro há 30 dias:</b> {stagnant.slice(0,4).map(x=>x.product.name).join(', ')}{stagnant.length>4?' e mais '+(stagnant.length-4):''}.</p>}
    </div>
   </div>
   <div className="stock-ai-purchase">
    <div className="stock-ai-purchase-heading"><div><h4>Sugestões de reposição</h4><small>Estimativa, não é pedido automático. Confira com o fornecedor antes de comprar.</small></div>
     <input type="search" placeholder="Filtrar produto" aria-label="Filtrar sugestões de reposição" value={term} onChange={e=>setTerm(e.target.value)}/>
    </div>
    <div className="stock-ai-table-wrap"><table>
     <thead><tr><th>Produto</th><th>Estoque</th><th>Vendas 30d</th><th>Média/dia</th><th>Cobertura</th><th>Compra sugerida</th><th>Ação</th></tr></thead>
     <tbody>{filtered.map(x=><tr key={x.product.id}>
      <td><b>{x.product.name}</b>{x.low&&<small className="stock-ai-urgent">Atenção</small>}</td>
      <td>{fmt(x.stock)} un.</td><td>{fmt(x.sold)} un.</td><td>{fmt(x.avg)}</td>
      <td>{x.cover===null?'Sem giro':fmt(x.cover)+' dias'}</td>
      <td><strong>{x.product.fardo_enabled?x.suggestedFardos+' fardo(s)':' '+fmt(x.suggestedUnits)+' un.'}</strong>
       <small>{x.product.fardo_enabled?x.suggestedUnits+' unidades equivalentes':''}</small></td>
      <td>{admin?<button type="button" className="outline" onClick={()=>onRestock(x.product.id)}>Registrar entrada</button>:'Somente administrador'}</td>
     </tr>)}</tbody>
    </table></div>
    {!filtered.length&&<p className="stock-ai-empty">{order.length?'Nenhuma sugestão corresponde à busca.':'Nenhuma reposição sugerida pelos dados disponíveis. Estoque mínimo sem vendas continua visível nos alertas.'}</p>}
   </div>
  </>}
 </section>;
}
