import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent as ReactKey,FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase as sb} from './supabase';

type Page='dashboard'|'balcao'|'delivery'|'produtos'|'clientes'|'relatorios'|'config';
type Staff={user_id:string;role:'admin'|'operador';active:boolean;display_name:string};
type Cat={id:number;name:string;active:boolean};
type Product={id:string;category_id:number|null;name:string;sku:string|null;barcode:string|null;unit:string;purchase_price:number;sale_price:number;track_stock:boolean;stock_qty:number;min_stock:number;active:boolean};
type Customer={id:string;name:string|null;phone:string|null;street:string|null;neighborhood:string|null;house_number:string|null;complement:string|null;active:boolean};
type Order={id:string;order_number:number;channel:'delivery'|'balcao';stage:'pedidos'|'entregues'|'aguardando_pagamento';status:string;version:number;customer_id:string|null;customer_name:string|null;customer_phone:string|null;street:string|null;neighborhood:string|null;house_number:string|null;complement:string|null;note:string|null;subtotal:number;delivery_fee:number;discount:number;total:number;cost_total:number;payment_method:string;payment_status:'paid'|'pending';sold_at:string;created_at:string;delivered_at:string|null};
type Line={product:Product;quantity:number;unit_price:number};
type Form={customer_id:string;customer_name:string;customer_phone:string;street:string;neighborhood:string;house_number:string;complement:string;note:string;delivery_fee:string;discount:string;payment_method:string;paid:boolean};
type Settings={store_name:string;store_subtitle:string;store_phone:string|null;store_address:string|null;receipt_footer:string|null;auto_print:boolean};
const tabs:[Page,string,string][]=[['dashboard','Dashboard','▦'],['balcao','PDV Balcão','▤'],['delivery','PDV Delivery','▥'],['produtos','Produtos','◫'],['clientes','Clientes','♙'],['relatorios','Relatórios','▧'],['config','Configurações','⚙']];
const initialForm:Form={customer_id:'',customer_name:'',customer_phone:'',street:'',neighborhood:'',house_number:'',complement:'',note:'',delivery_fee:'0',discount:'0',payment_method:'nao_informado',paid:false};
const paymentLabels:{[key:string]:string}={nao_informado:'Não informado',dinheiro:'Dinheiro',pix:'Pix',cartao:'Cartão',misto:'Misto'};
const cash=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'});
const day=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const shortDay=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const number=(s:string)=>Number(String(s||0).trim().replace(',','.'));
const escapeHtml=(x:unknown)=>String(x??'').replace(/[&<>"']/g,a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]||a));
function newForm(c?:Customer):Form{return {...initialForm,customer_id:c?.id||'',customer_name:c?.name||'',customer_phone:c?.phone||'',street:c?.street||'',neighborhood:c?.neighborhood||'',house_number:c?.house_number||'',complement:c?.complement||''}}
function App(){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false);
 const [staff,setStaff]=useState<Staff|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 const [authMode,setAuthMode]=useState<'login'|'forgot'|'recovery'>(new URLSearchParams(window.location.search).get('recover')==='1'?'recovery':'login');
 const [newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
 const [page,setPage]=useState<Page>('dashboard'),[menu,setMenu]=useState(false),[mobile,setMobile]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
 const [staffMembers,setStaffMembers]=useState<Staff[]>([]),[memberEmail,setMemberEmail]=useState(''),[memberRole,setMemberRole]=useState('operador'),[memberActive,setMemberActive]=useState(true);
 const [cats,setCats]=useState<Cat[]>([]),[products,setProducts]=useState<Product[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[orders,setOrders]=useState<Order[]>([]);
 const [settings,setSettings]=useState<Settings>({store_name:'GELADÃO',store_subtitle:'Distribuidora de Bebidas',store_phone:'',store_address:'',receipt_footer:'Obrigado pela preferência!',auto_print:false});
 const [period,setPeriod]=useState('hoje'),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const [query,setQuery]=useState(''),[customerQuery,setCustomerQuery]=useState(''),[orderQuery,setOrderQuery]=useState('');
 const [saleOpen,setSaleOpen]=useState(false),[saleChannel,setSaleChannel]=useState<'balcao'|'delivery'>('delivery'),[editing,setEditing]=useState<Order|null>(null);
 const [form,setForm]=useState<Form>(initialForm),[cart,setCart]=useState<Line[]>([]),[productSearch,setProductSearch]=useState(''),[customerSearch,setCustomerSearch]=useState(''),[customerChoiceIndex,setCustomerChoiceIndex]=useState(-1);
 const [newProduct,setNewProduct]=useState(false),[editProduct,setEditProduct]=useState<Product|null>(null);
 const [productForm,setProductForm]=useState({name:'',category_id:'',barcode:'',sku:'',unit:'UN',purchase_price:'0',sale_price:'0',track_stock:false,stock_qty:'0',min_stock:'0',active:true});
 const [newCustomer,setNewCustomer]=useState(false),[editCustomer,setEditCustomer]=useState<Customer|null>(null);
 const [custForm,setCustForm]=useState({name:'',phone:'',street:'',neighborhood:'',house_number:'',complement:''});
 const [catName,setCatName]=useState('');
 const searchRef=useRef<HTMLInputElement>(null);
 const admin=staff?.role==='admin';
 const showError=(error:unknown)=>setNotice(error instanceof Error?error.message:String(error));
 const updateForm=(key:keyof Form,value:string|boolean)=>setForm(f=>({...f,[key]:value}));
 const loadStaff=useCallback(async(id:string)=>{const{data,error}=await sb.from('staff_profiles').select('user_id,role,active,display_name').eq('user_id',id).maybeSingle();if(error)showError(error.message);setStaff((data||null) as Staff|null)},[]);
 const refresh=useCallback(async()=>{setLoading(true);try{
  const [a,b,c,d,e,f]=await Promise.all([
    sb.from('categories').select('*').order('name'),
    sb.from('products').select('*').order('name'),
    sb.from('customers').select('*').order('name'),
    sb.from('orders').select('*').order('sold_at',{ascending:false}).limit(5000),
    sb.from('app_settings').select('*').eq('id',1).single(),
    sb.from('staff_profiles').select('*').order('created_at')
  ]);
  const err=a.error||b.error||c.error||d.error||e.error||f.error;if(err)throw err;
  setCats((a.data||[]) as Cat[]);setProducts((b.data||[]) as Product[]);setCustomers((c.data||[]) as Customer[]);setOrders((d.data||[]) as Order[]);setStaffMembers((f.data||[]) as Staff[]);if(e.data)setSettings(e.data as Settings);
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
 const key=(e:KeyboardEvent)=>{if(e.key==='F2'&&!saleOpen&&!newProduct&&!newCustomer){e.preventDefault();openSale('delivery')}if(!saleOpen)return;
 if(e.key==='Escape'){e.preventDefault();closeSale()}
 if(e.key==='F4'){e.preventDefault();searchRef.current?.focus()}
 if(e.key==='F6'){e.preventDefault();document.getElementById('delivery-street')?.focus()}
 if(e.key==='F8'){e.preventDefault();document.getElementById('payment-method')?.focus()}
 if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();void saveSale()}
 };
 window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[saleOpen,form,cart,editing,staff?.active,busy,newProduct,newCustomer]);
 useEffect(()=>{if(!saleOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[saleOpen]);
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
 function openSale(channel:'balcao'|'delivery'){setSaleChannel(channel);setEditing(null);setForm({...initialForm});setCart([]);setProductSearch('');setCustomerSearch('');setCustomerChoiceIndex(-1);setSaleOpen(true)}
 function closeSale(){
   if(busy)return;
   const hasUnsavedChanges=Boolean(editing||cart.length||Object.keys(initialForm).some(key=>form[key as keyof Form]!==initialForm[key as keyof Form]));
   if(hasUnsavedChanges&&!window.confirm('Descartar alterações desta venda?'))return;
   setSaleOpen(false);
 }
 async function editSale(o:Order){setLoading(true);try{const {data,error}=await sb.from('order_items').select('*').eq('order_id',o.id);if(error)throw error;
  const lines:Line[]=[];for(const item of data||[]){const p=products.find(v=>v.id===item.product_id);if(p)lines.push({product:p,quantity:Number(item.quantity),unit_price:Number(item.unit_price)})}
  if(lines.length!==(data||[]).length)throw Error('Produto de algum item não está disponível no cadastro.');
  setSaleChannel(o.channel);setEditing(o);setForm({customer_id:o.customer_id||'',customer_name:o.customer_name||'',customer_phone:o.customer_phone||'',street:o.street||'',neighborhood:o.neighborhood||'',house_number:o.house_number||'',complement:o.complement||'',note:o.note||'',delivery_fee:String(o.delivery_fee),discount:String(o.discount),payment_method:o.payment_method,paid:o.payment_status==='paid'});setCart(lines);setSaleOpen(true)
 }catch(err){showError(err)}finally{setLoading(false)}}
 function addProduct(p:Product){setCart(lines=>{const existing=lines.find(x=>x.product.id===p.id);return existing?lines.map(x=>x.product.id===p.id?{...x,quantity:x.quantity+1}:x):[...lines,{product:p,quantity:1,unit_price:Number(p.sale_price)}]});setProductSearch('');searchRef.current?.focus()}
 function changeQty(id:string,qty:number){setCart(lines=>lines.map(x=>x.product.id===id?{...x,quantity:qty}:x).filter(x=>x.quantity>0))}
 const subtotal=cart.reduce((s,x)=>s+x.quantity*x.unit_price,0),total=Math.max(0,subtotal+number(form.delivery_fee)-number(form.discount));
 async function saveSale(){if(busy)return;if(!cart.length){setNotice('Adicione ao menos um produto.');return}
  if(!cart.every(l=>l.quantity>0&&Number.isFinite(l.quantity))||![number(form.delivery_fee),number(form.discount),total].every(Number.isFinite)||number(form.discount)>subtotal+(saleChannel==='delivery'?number(form.delivery_fee):0)){setNotice('Confira quantidades, descontos e valores.');return}
  if(form.paid&&form.payment_method==='nao_informado'){setNotice('Escolha a forma de pagamento.');return}
  setBusy(true);try{
   let customerId=form.customer_id||null;
   if(!customerId&&(form.customer_name.trim()||form.customer_phone.trim())){
    const{data,error}=await sb.from('customers').insert({name:form.customer_name.trim()||null,phone:form.customer_phone.trim()||null,street:form.street||null,neighborhood:form.neighborhood||null,house_number:form.house_number||null,complement:form.complement||null}).select('id').single();
    if(error)throw error;customerId=data.id;
   }
   const payload={channel:saleChannel,customer_id:customerId,customer_name:form.customer_name,customer_phone:form.customer_phone,street:form.street,neighborhood:form.neighborhood,house_number:form.house_number,complement:form.complement,note:form.note,delivery_fee:saleChannel==='balcao'?0:number(form.delivery_fee),discount:number(form.discount),payment_method:form.payment_method,paid:form.paid,request_id:editing?undefined:requestId.current,items:cart.map(l=>({product_id:l.product.id,quantity:l.quantity,...(admin?{unit_price:l.unit_price}:{})}))};
   const {error}=await sb.rpc('save_order',{p_data:payload,p_order_id:editing?.id||null,p_expected_version:editing?.version||null});if(error)throw error;
   setSaleOpen(false);setEditing(null);requestId.current=crypto.randomUUID();setNotice('Venda salva no banco de dados.');await refresh()
  }catch(err){showError(err)}finally{setBusy(false)}}
 const requestId=useRef(crypto.randomUUID());
 async function advance(o:Order){try{const {error}=await sb.rpc('advance_delivery',{p_order_id:o.id,p_expected_version:o.version});if(error)throw error;await refresh()}catch(err){showError(err)}}
 async function cancel(o:Order){if(!admin||!window.confirm('Cancelar pedido #'+o.order_number+'? O estoque controlado será devolvido, mas o sistema NÃO estorna pagamentos. Confirme o estorno manualmente quando necessário.'))return;try{const{error}=await sb.rpc('cancel_order',{p_order_id:o.id,p_expected_version:o.version});if(error)throw error;await refresh()}catch(err){showError(err)}}
 function print(o:Order){const w=window.open('','_blank','width=440,height=680');if(!w){setNotice('Permita janelas pop-up para imprimir.');return}
  w.document.write('<p>Preparando cupom...</p>');void (async()=>{try{const{data,error}=await sb.from('order_items').select('*').eq('order_id',o.id);if(error)throw error;
   const address=[o.street,o.house_number,o.neighborhood,o.complement].filter(Boolean).join(' · ');
   const rows=(data||[]).map(i=>'<tr><td colspan="2"><b>'+escapeHtml(i.product_name)+'</b></td></tr><tr><td>'+escapeHtml(i.quantity)+' × '+cash(Number(i.unit_price))+'</td><td align="right">'+cash(Number(i.line_total))+'</td></tr>').join('');
   const html='<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>Cupom '+o.order_number+'</title><style>@page{size:80mm auto;margin:3mm}body{font:12px monospace;color:black;width:72mm;margin:0 auto}h1,h2,p{text-align:center;margin:5px}h1{font-size:20px}hr{border:0;border-top:1px dashed #555;margin:10px 0}table{width:100%;border-collapse:collapse}td{padding:3px 0}strong.total{font-size:19px}small{font-size:10px}button{margin:12px auto;display:block;padding:9px}@media print{button{display:none}}</style></head><body><h1>'+escapeHtml(settings.store_name)+'</h1><p>'+escapeHtml(settings.store_subtitle)+'</p><p>'+escapeHtml(settings.store_phone||'')+'</p><p>'+escapeHtml(settings.store_address||'')+'</p><p><b>CUPOM NÃO FISCAL</b></p><hr><b>PEDIDO #'+o.order_number+' — '+(o.channel==='delivery'?'DELIVERY':'BALCÃO')+'</b><p>'+fmt(o.sold_at)+'</p><hr><div>Cliente: '+escapeHtml(o.customer_name||'Não identificado')+'</div><div>Telefone: '+escapeHtml(o.customer_phone||'-')+'</div>'+ (o.channel==='delivery'&&address?'<div>Endereço: '+escapeHtml(address)+'</div>':'')+'<hr><table>'+rows+'</table><hr><table><tr><td>Subtotal</td><td align="right">'+cash(Number(o.subtotal))+'</td></tr><tr><td>Entrega</td><td align="right">'+cash(Number(o.delivery_fee))+'</td></tr><tr><td>Desconto</td><td align="right">'+cash(Number(o.discount))+'</td></tr><tr><td><strong class="total">TOTAL</strong></td><td align="right"><strong class="total">'+cash(Number(o.total))+'</strong></td></tr></table><hr><div>Pagamento: '+escapeHtml(paymentLabels[o.payment_method]||o.payment_method)+'</div><div>Situação: <b>'+(o.payment_status==='paid'?'RECEBIDO':'A RECEBER')+'</b></div>'+(o.note?'<div>Observações: '+escapeHtml(o.note)+'</div>':'')+'<hr><p>'+escapeHtml(settings.receipt_footer||'Obrigado!')+'</p><p><small>ESTE DOCUMENTO NÃO É NOTA FISCAL</small></p><button onclick="window.print()">Imprimir</button><script>window.onload=()=>{setTimeout(()=>window.print(),250)}<\/script></body></html>';
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
 const activeOrders=orders.filter(o=>o.status==='active');
 const filtered=useMemo(()=>activeOrders.filter(o=>{const d=day(o.sold_at),today=shortDay(new Date()),prev=shortDay(new Date(Date.now()-86400000));const last=shortDay(new Date(Date.now()-6*86400000));if(period==='hoje')return d===today;if(period==='ontem')return d===prev;if(period==='7dias')return d>=last&&d<=today;if(period==='mes')return d.slice(0,7)===today.slice(0,7);return (!start||d>=start)&&(!end||d<=end)}),[activeOrders,period,start,end]);
 const sum=filtered.reduce((s,o)=>s+Number(o.total),0),gross=filtered.reduce((s,o)=>s+Number(o.subtotal)-Number(o.discount)-Number(o.cost_total),0);
 const sums={balcao:filtered.filter(x=>x.channel==='balcao').reduce((s,o)=>s+Number(o.total),0),delivery:filtered.filter(x=>x.channel==='delivery').reduce((s,o)=>s+Number(o.total),0)};
 const monthly=Array.from({length:6},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));const key=shortDay(d).slice(0,7);return {key,label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(d),value:activeOrders.filter(o=>day(o.sold_at).slice(0,7)===key).reduce((sum,o)=>sum+Number(o.total),0)}});
 const monthlyMax=Math.max(1,...monthly.map(x=>x.value));
 const matched=products.filter(p=>p.active&&(p.name.toLowerCase().includes(productSearch.toLowerCase())||p.barcode?.includes(productSearch))).slice(0,9);
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
  <button className="outline" type="button" onClick={()=>{setAuthMode('login');setNotice('');window.history.replaceState(null,'',window.location.pathname)}}>Voltar para o login</button>
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
 return <div className="app"><aside className={'sidebar '+(menu?'wide':'')+(mobile?' mobileopen':'')} onMouseEnter={()=>setMenu(true)} onMouseLeave={()=>setMenu(false)}><div className="brand"><b>G</b>{menu&&<strong>GELADÃO</strong>}</div><nav>{tabs.map(([id,title,icon])=><button key={id} title={title} className={page===id?'selected':''} onClick={()=>{setPage(id);setMobile(false);setNotice('')}}><span>{icon}</span>{menu&&<label>{title}</label>}</button>)}</nav><div className="sidebottom"><button title="Sair" onClick={()=>void logout()}><span>⇥</span>{menu&&<label>Sair</label>}</button></div></aside>
 <main className="main"><header><div className="headtitle"><button className="mobiletoggle" onClick={()=>setMobile(x=>!x)}>☰</button><div><small>GELADÃO / SISTEMA PDV</small><h1>{tabs.find(t=>t[0]===page)?.[1]}</h1></div></div><div className="headright"><span className="userchip">{staff.display_name||user.email} · {staff.role}</span><button className="outline" onClick={()=>void refresh()} disabled={loading}>↻ Atualizar</button></div></header>
 {notice&&<div className="notice" role="alert">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
 {page==='dashboard'&&<><div className="toolbar"><h2>Visão geral</h2><div className="filters"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="7dias">Últimos 7 dias</option><option value="mes">Este mês</option><option value="custom">Personalizado</option></select>{period==='custom'&&<><input type="date" value={start} onChange={e=>setStart(e.target.value)}/><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></>}</div></div>
 <div className="metrics">{[['Vendas gerais',cash(sum)],['Lucro bruto dos produtos',cash(gross)],['Total de pedidos',String(filtered.length)],['Tíquete médio',cash(filtered.length?sum/filtered.length:0)]].map(([title,value])=><article className="card metric" key={title}><span>{title}</span><strong>{value}</strong></article>)}</div>
 <div className="two"><section className="card"><h3>Vendas por canal</h3><p>Delivery <b>{cash(sums.delivery)}</b></p><div className="track"><span style={{width:sum?String(100*sums.delivery/sum)+'%':'0%'}}/></div><p>Balcão <b>{cash(sums.balcao)}</b></p><div className="track"><span style={{width:sum?String(100*sums.balcao/sum)+'%':'0%'}}/></div></section><section className="card"><h3>Resumo de pagamentos</h3><p>Pedidos recebidos: {filtered.filter(o=>o.payment_status==='paid').length}</p><p>A receber: {cash(filtered.filter(o=>o.payment_status==='pending').reduce((s,o)=>s+Number(o.total),0))}</p><small>Lucro dos produtos = itens vendidos − custo − descontos. Taxa de entrega não entra nesse lucro.</small></section></div><section className="card chart"><h3>Faturamento nos últimos 6 meses</h3><div className="monthbars">{monthly.map(m=><div key={m.key} className="monthitem" title={cash(m.value)}><small>{cash(m.value)}</small><div className="monthtrack"><span style={{height:String(Math.max(m.value>0?8:2,Math.round(140*m.value/monthlyMax)))+'px'}}/></div><b>{m.label}</b></div>)}</div></section></>}
 {page==='delivery'&&<><div className="toolbar"><div><h2>Fluxo de pedidos</h2><p>Avance cada pedido com um clique</p></div><button className="primary" onClick={()=>openSale('delivery')}>+ Nova venda · F2</button></div><div className="kanban">{(['pedidos','aguardando_pagamento','entregues'] as const).map(s=><section className="lane" data-stage={s} key={s}><h3>{s==='pedidos'?'Pedidos':s==='entregues'?'Entregues':'Aguardando pagamento'} <span>{activeOrders.filter(o=>o.channel==='delivery'&&o.stage===s).length}</span></h3>{!activeOrders.some(o=>o.channel==='delivery'&&o.stage===s)&&<div className="lane-empty"><span className="lane-empty-icon" aria-hidden="true">{s==='pedidos'?'▤':s==='entregues'?'✓':'◷'}</span><strong>{s==='pedidos'?'Tudo organizado por aqui':s==='entregues'?'Nenhuma entrega concluída':'Nenhum pagamento pendente'}</strong><p>{s==='pedidos'?'Os novos pedidos aparecerão nesta coluna.':s==='entregues'?'Os pedidos entregues e pagos aparecerão aqui.':'Pedidos entregues que ainda precisam ser recebidos aparecerão aqui.'}</p>{s==='pedidos'&&<button type="button" className="outline" onClick={()=>openSale('delivery')}>+ Criar pedido</button>}</div>}{activeOrders.filter(o=>o.channel==='delivery'&&o.stage===s).map(o=><article className="card order" key={o.id}><div className="orderhead"><b>#{o.order_number}</b><small>{fmt(o.sold_at)}</small></div><h3>{o.customer_name||'Cliente não identificado'}</h3><strong>{cash(Number(o.total))}</strong><span className={'payment-pill '+(o.payment_status==='paid'?'is-paid':'is-pending')}>{o.payment_status==='paid'?'✓ Pago':'◷ A receber'} · {paymentLabels[o.payment_method]}</span><div className="actions"><button onClick={()=>print(o)}>⎙ Imprimir</button><button onClick={()=>void editSale(o)}>✎ Editar</button>{s!=='entregues'&&<button className="actionnext" onClick={()=>void advance(o)}>{s==='pedidos'?'Marcar entregue':'Confirmar pagamento'} →</button>}</div></article>)}</section>)}</div></>}
 {page==='balcao'&&<><div className="toolbar"><div><h2>Vendas de balcão</h2><p>Venda rápida e reimpressão de comprovantes</p></div><button className="primary" onClick={()=>openSale('balcao')}>+ Nova venda de balcão</button></div><section className="card"><h3>Últimas vendas</h3>{activeOrders.filter(o=>o.channel==='balcao').slice(0,30).map(o=><div className="line-row" key={o.id}><div><b>#{o.order_number}</b><small>{fmt(o.sold_at)}</small></div><strong>{cash(Number(o.total))}</strong><div className="actions"><button onClick={()=>void editSale(o)}>Editar</button><button onClick={()=>print(o)}>Imprimir</button></div></div>)}{!activeOrders.some(o=>o.channel==='balcao')&&<p>Nenhuma venda registrada.</p>}</section></>}
 {page==='produtos'&&<><div className="toolbar"><div><h2>Produtos e categorias</h2><p>Preço de custo, venda e estoque opcional</p></div>{admin&&<button className="primary" onClick={()=>openProduct()}>+ Cadastrar produto</button>}</div><input className="fullsearch" placeholder="Buscar produto, código de barras ou SKU" value={query} onChange={e=>setQuery(e.target.value)}/><section className="card"><div className="tablewrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Estoque</th><th></th></tr></thead><tbody>{products.filter(p=>(p.name+' '+p.barcode+' '+p.sku).toLowerCase().includes(query.toLowerCase())).map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.unit} · {p.active?'Ativo':'Inativo'}</small></td><td>{cats.find(x=>x.id===p.category_id)?.name||'Outros'}</td><td>{cash(Number(p.purchase_price))}</td><td>{cash(Number(p.sale_price))}</td><td>{p.track_stock?String(p.stock_qty):'Não controlado'}</td><td>{admin&&<button className="outline" onClick={()=>openProduct(p)}>Editar</button>}</td></tr>)}</tbody></table></div></section>{admin&&<section className="card categories"><h3>Categorias</h3><div className="actions">{cats.map(c=><span className="chip" key={c.id}>{c.name}</span>)}</div><div className="actions"><input placeholder="Nova categoria" value={catName} onChange={e=>setCatName(e.target.value)}/><button className="outline" onClick={()=>void addCategory()}>Adicionar</button></div></section>}</>}
 {page==='clientes'&&<><div className="toolbar"><h2>Clientes</h2><button className="primary" onClick={()=>openCustomer()}>+ Novo cliente</button></div><input className="fullsearch" placeholder="Buscar por nome ou telefone" value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)}/><section className="card"><div className="tablewrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Endereço</th><th>Pedidos</th><th></th></tr></thead><tbody>{customers.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(customerQuery.toLowerCase())).map(c=><tr key={c.id}><td>{c.name||'—'}</td><td>{c.phone||'—'}</td><td>{[c.street,c.house_number,c.neighborhood].filter(Boolean).join(', ')||'—'}</td><td>{orders.filter(o=>o.customer_id===c.id&&o.status==='active').length}</td><td><button className="outline" onClick={()=>openCustomer(c)}>Editar</button></td></tr>)}</tbody></table></div></section></>}
 {page==='relatorios'&&<><div className="toolbar"><h2>Histórico de vendas</h2><div className="actions"><input placeholder="Número, nome ou telefone" value={orderQuery} onChange={e=>setOrderQuery(e.target.value)}/><button className="outline" onClick={()=>{const rows=[['Pedido','Data','Canal','Total','Pagamento'],...orders.map(o=>[String(o.order_number),fmt(o.sold_at),o.channel,String(o.total),o.payment_status])];const csv=rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}));a.download='geladao-vendas.csv';a.click();URL.revokeObjectURL(a.href)}}>Exportar CSV</button></div></div><section className="card"><div className="tablewrap"><table><thead><tr><th>Pedido</th><th>Data</th><th>Canal</th><th>Total</th><th>Pagamento</th><th>Ações</th></tr></thead><tbody>{orders.filter(o=>(String(o.order_number)+' '+o.customer_name+' '+o.customer_phone).toLowerCase().includes(orderQuery.toLowerCase())).map(o=><tr key={o.id}><td>#{o.order_number}{o.status==='cancelled'?' · Cancelado':''}</td><td>{fmt(o.sold_at)}</td><td>{o.channel}</td><td>{cash(Number(o.total))}</td><td>{o.payment_status==='paid'?'Recebido':'Pendente'}</td><td><div className="actions"><button className="outline" onClick={()=>print(o)}>Imprimir</button>{o.status==='active'&&<><button className="outline" onClick={()=>void editSale(o)}>Editar</button>{admin&&<button className="danger" onClick={()=>void cancel(o)}>Cancelar</button>}</>}</div></td></tr>)}</tbody></table></div></section></>}
 {page==='config'&&<section className="card settings"><h2>Configurações da distribuidora</h2><form onSubmit={saveSettings}><label>Nome<input disabled={!admin} value={settings.store_name} onChange={e=>setSettings(s=>({...s,store_name:e.target.value}))}/></label><label>Subtítulo<input disabled={!admin} value={settings.store_subtitle} onChange={e=>setSettings(s=>({...s,store_subtitle:e.target.value}))}/></label><label>Telefone<input disabled={!admin} value={settings.store_phone||''} onChange={e=>setSettings(s=>({...s,store_phone:e.target.value}))}/></label><label>Endereço no cupom<input disabled={!admin} value={settings.store_address||''} onChange={e=>setSettings(s=>({...s,store_address:e.target.value}))}/></label><label>Rodapé do cupom<input disabled={!admin} value={settings.receipt_footer||''} onChange={e=>setSettings(s=>({...s,receipt_footer:e.target.value}))}/></label><p>A impressão atual abre o diálogo de impressão do navegador para bobinas de 80 mm. Impressão silenciosa depende do modelo e da integração local.</p>{admin&&<button className="primary">Salvar configurações</button>}</form>{admin&&<div className="staff-panel"><h3>Usuários e permissões</h3><p>O usuário deve solicitar acesso primeiro. Apenas administradores podem liberar ou bloquear a conta.</p><form className="staff-form" onSubmit={manageStaff}><label>E-mail cadastrado<input type="email" required value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} placeholder="usuario@exemplo.com"/></label><label>Perfil<select value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option value="operador">Operador</option><option value="admin">Administrador</option></select></label><label>Status<select value={memberActive?'ativo':'inativo'} onChange={e=>setMemberActive(e.target.value==='ativo')}><option value="ativo">Ativo</option><option value="inativo">Bloqueado</option></select></label><button className="primary" disabled={busy}>Salvar permissão</button></form><div className="staff-list">{staffMembers.map(m=><div className="line-row" key={m.user_id}><strong>{m.display_name||m.user_id.slice(0,8)}</strong><span>{m.role==='admin'?'Administrador':'Operador'} · {m.active?'Ativo':'Bloqueado'}</span></div>)}</div></div>}</section>}
 <footer>GELADÃO · Uma unidade · {loading?'Atualizando dados...':'Dados protegidos por autenticação e RLS'}</footer></main>
 {saleOpen&&<div className="overlay sale-overlay"><div className="dialog card sale-workspace" role="dialog" aria-modal="true" aria-label={editing?"Editar venda":"Nova venda"}><div className="dialoghead"><div><h2>{editing?'Editar venda #'+editing.order_number:'Nova venda '+(saleChannel==='delivery'?'Delivery':'Balcão')}</h2><p>F2 abre nova venda · Esc fecha · Enter avança · F4 produtos · F6 endereço · F8 pagamento · Ctrl+Enter salva</p></div><button type="button" className="outline" onClick={closeSale} title="Fechar venda (Esc)">Fechar · Esc ×</button></div><form onKeyDown={advanceField} onSubmit={e=>{e.preventDefault();void saveSale()}}>
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
  <div className="payment-fields">{saleChannel==='delivery'&&<label>Taxa de entrega (R$)<input data-nav value={form.delivery_fee} onChange={e=>updateForm('delivery_fee',e.target.value)}/></label>}<label>Desconto (R$)<input data-nav value={form.discount} onChange={e=>updateForm('discount',e.target.value)}/></label><label>Forma de pagamento<select data-nav id="payment-method" value={form.payment_method} onChange={e=>updateForm('payment_method',e.target.value)}>{Object.keys(paymentLabels).map(k=><option key={k} value={k}>{paymentLabels[k]}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={form.paid} onChange={e=>updateForm('paid',e.target.checked)}/>Pagamento recebido</label><label>Observações<textarea value={form.note} onChange={e=>updateForm('note',e.target.value)}/></label></div>
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
  <div className="order-summary-breakdown"><div className="sumline"><span>Subtotal</span><b>{cash(subtotal)}</b></div><div className="sumline"><span>Entrega</span><b>{cash(saleChannel==='delivery'?number(form.delivery_fee):0)}</b></div>{number(form.discount)>0&&<div className="sumline"><span>Desconto</span><b>− {cash(number(form.discount))}</b></div>}<div className="sumline total"><span>Total</span><strong>{cash(total)}</strong></div><button type="submit" className="primary" disabled={busy||!cart.length}>{busy?'Salvando...':editing?'Salvar alterações':'Finalizar venda'}</button><small>A venda é confirmada somente após gravação no Supabase.</small></div>
 </div></div></form></div></div>}
 {newProduct&&<div className="overlay"><section className="dialog card compact"><div className="dialoghead"><h2>{editProduct?'Editar produto':'Cadastrar produto'}</h2><button className="outline" onClick={()=>setNewProduct(false)}>×</button></div><form onSubmit={saveProduct} className="fieldgrid"><label className="span2">Nome<input required value={productForm.name} onChange={e=>setProductForm(s=>({...s,name:e.target.value}))}/></label><label>Categoria<select value={productForm.category_id} onChange={e=>setProductForm(s=>({...s,category_id:e.target.value}))}><option value="">Sem categoria</option>{cats.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Unidade<input value={productForm.unit} onChange={e=>setProductForm(s=>({...s,unit:e.target.value}))}/></label><label>Preço de compra<input required value={productForm.purchase_price} onChange={e=>setProductForm(s=>({...s,purchase_price:e.target.value}))}/></label><label>Preço de venda<input required value={productForm.sale_price} onChange={e=>setProductForm(s=>({...s,sale_price:e.target.value}))}/></label><label>Código de barras<input value={productForm.barcode} onChange={e=>setProductForm(s=>({...s,barcode:e.target.value}))}/></label><label>SKU<input value={productForm.sku} onChange={e=>setProductForm(s=>({...s,sku:e.target.value}))}/></label><label className="checkbox span2"><input type="checkbox" checked={productForm.track_stock} onChange={e=>setProductForm(s=>({...s,track_stock:e.target.checked}))}/>Controlar estoque</label>{productForm.track_stock&&<><label>Quantidade em estoque<input value={productForm.stock_qty} onChange={e=>setProductForm(s=>({...s,stock_qty:e.target.value}))}/></label><label>Estoque mínimo<input value={productForm.min_stock} onChange={e=>setProductForm(s=>({...s,min_stock:e.target.value}))}/></label></>}<label className="checkbox span2"><input type="checkbox" checked={productForm.active} onChange={e=>setProductForm(s=>({...s,active:e.target.checked}))}/>Produto ativo</label><button className="primary span2" disabled={busy}>Salvar produto</button></form></section></div>}
 {newCustomer&&<div className="overlay"><section className="dialog card compact"><div className="dialoghead"><h2>{editCustomer?'Editar cliente':'Novo cliente'}</h2><button className="outline" onClick={()=>setNewCustomer(false)}>×</button></div><form onSubmit={saveCustomer} className="fieldgrid">{([['name','Nome'],['phone','Telefone'],['street','Rua'],['neighborhood','Bairro'],['house_number','Número'],['complement','Complemento']] as const).map(([k,label])=><label key={k}>{label}<input value={custForm[k]} onChange={e=>setCustForm(s=>({...s,[k]:e.target.value}))}/></label>)}<p className="span2">Todos os campos são opcionais individualmente; informe pelo menos nome ou telefone.</p><button className="primary span2" disabled={busy}>Salvar cliente</button></form></section></div>}
 </div>
}
export default App;
