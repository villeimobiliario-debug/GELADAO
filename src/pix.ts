/**
 * Pix BR Code estatico (EMV), gerado localmente, sem integracao bancaria.
 * O operador precisa conferir a entrada do dinheiro no aplicativo do banco.
 */
export type PixData={pix_key:string;pix_receiver:string;pix_city:string};

function field(id:string,value:string):string{
 if(!/^\d{2}$/.test(id)||value.length>99)throw new Error('Dados Pix excedem o limite do QR Code.');
 return id+String(value.length).padStart(2,'0')+value;
}

function normalizeKey(raw:string):string{
 const input=raw.trim();
 if(!input)throw new Error('Cadastre a chave Pix em Configurações.');
 if(input.length>77)throw new Error('A chave Pix deve ter até 77 caracteres.');
 const numeric=input.replace(/[.\-/]/g,'');
 if((/^\d{11}$|^\d{14}$/).test(numeric)&&/^[\d.\-/]+$/.test(input))return numeric;
 if(/^\+[1-9]\d{7,14}$/.test(input))return input;
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)&&/^[\x21-\x7E]+$/.test(input))return input;
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input))return input.toLowerCase();
 throw new Error('Chave Pix inválida: use CPF, CNPJ, e-mail, telefone com +55 ou chave aleatória.');
}

function normalizeLabel(raw:string,limit:number,label:string):string{
 const value=raw.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^A-Za-z0-9 .\-]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
 if(!value)throw new Error('Informe '+label+' do recebedor em Configurações.');
 if(value.length>limit)throw new Error(label+' do recebedor deve ter no máximo '+limit+' caracteres.');
 return value;
}

function crc16(payload:string):string{
 let crc=0xffff;
 for(let i=0;i<payload.length;i++){
  crc^=payload.charCodeAt(i)<<8;
  for(let bit=0;bit<8;bit++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;
 }
 return crc.toString(16).toUpperCase().padStart(4,'0');
}

/** amountCents is an integer amount, e.g. R$ 47,90 -> 4790. */
export function buildPixPayload(settings:PixData,amountCents:number):string{
 if(!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>99999999)throw new Error('Valor Pix inválido.');
 const key=normalizeKey(settings.pix_key||'');
 const receiver=normalizeLabel(settings.pix_receiver||'',25,'O nome');
 const city=normalizeLabel(settings.pix_city||'',15,'A cidade');
 const merchant=field('00','br.gov.bcb.pix')+field('01',key);
 const raw=field('00','01')+
  field('26',merchant)+field('52','0000')+field('53','986')+
  field('54',(amountCents/100).toFixed(2))+field('58','BR')+
  field('59',receiver)+field('60',city)+
  field('62',field('05','***'))+'6304';
 return raw+crc16(raw);
}
