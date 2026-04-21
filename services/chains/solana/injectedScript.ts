/**
 * Solana — Wallet Standard announce + `window.solana` shim.
 *
 * Emits a single IIFE per spec §4.2a–f. Target: ≤3 KB gzipped.
 *
 * Invariants (spec §10.4):
 *   - Both handshake halves fire (dispatch + listen). Inv 13.
 *   - `supportedTransactionVersions` is a frozen literal. Inv 14.
 *   - Feature-function identity stable across re-inject. Inv 18.
 *   - `publicKey` is `Uint8Array(32)` on the WebView side. Inv 13.
 *   - Legacy shim `signIn` throws `4200` (forces WS path). Inv 17.
 *   - Every outbound request stamps `__takumi_nonce`. TWV-2026-015.
 */

export interface SolanaInjectedScriptParams {
  activeAddress: string | null;
  sessionNonce?: string;
  /**
   * `data:image/<svg+xml|webp|png|gif>;base64,...` data URL. Must be
   * ≤ 100 KB per §10.6. Passed as a parameter (not inlined) so the
   * script template can stay small while the real Takumi logo rides
   * alongside.
   */
  iconDataUrl?: string;
}

const FALLBACK_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMwMDAiLz48dGV4dCB4PSI1MCUiIHk9IjUyJSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgZmlsbD0iI2ZmZiIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiPlQ8L3RleHQ+PC9zdmc+";

export function getSolanaInjectedScript(p: SolanaInjectedScriptParams): string {
  const A = JSON.stringify(p.activeAddress);
  const N = JSON.stringify(p.sessionNonce ?? "");
  const I = JSON.stringify(p.iconDataUrl ?? FALLBACK_ICON);
  return `(function(){
// Diagnostic breadcrumb — lets the native side observe whether the
// Solana script ran at all on this inject pass.
try{
  window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({
    type:"takumi_diagnostic",
    tag:"solana_inject",
    at:Date.now(),
    alreadyInstalled:!!window.__takumi_solana_installed,
    hasActive:${A ? "true" : "false"},
    location:location.href
  }));
}catch(e){}
// Session nonce is rotated on every top-frame navigation and stamped
// into re-injected scripts. The shim reads it from window at request
// time (NOT closure-captured) so SPA nav doesn't leave us sending a
// stale nonce — which the native bridge would silently drop, stranding
// the dApp's connect/sign promises forever.
window.__takumi_solana_nonce=${N};
if(window.__takumi_solana_installed){
  var EW=window.__takumi_solana_wallet;
  if(EW){
    try{var re=new Event("wallet-standard:register-wallet");re.detail=function(api){try{api.register(EW);}catch(e){}};window.dispatchEvent(re);}catch(e){}
  }
  return;
}
window.__takumi_solana_installed=1;
var A=${A};
var C=["solana:mainnet","solana:devnet","solana:testnet","solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp","solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1","solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z"];
var V=Object.freeze(["legacy",0]);
var F=["solana:signIn","solana:signMessage","solana:signTransaction","solana:signAndSendTransaction"];
var L="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bd(s){var b=[0],i,j,k,c,y;for(i=0;i<s.length;i++){c=L.indexOf(s.charAt(i));if(c<0)throw 0;for(j=0;j<b.length;j++)b[j]*=58;b[0]+=c;y=0;for(k=0;k<b.length;k++){b[k]+=y;y=b[k]>>8;b[k]&=255;}while(y){b.push(y&255);y>>=8;}}for(i=0;i<s.length&&s.charAt(i)==="1";i++)b.push(0);return new Uint8Array(b.reverse());}
function be(u){var d=[0],i,j,k,y;for(i=0;i<u.length;i++){for(j=0;j<d.length;j++)d[j]<<=8;d[0]+=u[i];y=0;for(k=0;k<d.length;k++){d[k]+=y;y=(d[k]/58)|0;d[k]%=58;}while(y){d.push(y%58);y=(y/58)|0;}}for(i=0;i<u.length&&u[i]===0;i++)d.push(0);var s="";for(i=d.length-1;i>=0;i--)s+=L.charAt(d[i]);return s;}
function b64e(u){var s="",i;for(i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s);}
function b64d(s){var n=atob(s),u=new Uint8Array(n.length),i;for(i=0;i<n.length;i++)u[i]=n.charCodeAt(i);return u;}
function U(x){if(x instanceof Uint8Array)return x;if(x&&x.buffer&&typeof x.byteLength==="number")return new Uint8Array(x.buffer,x.byteOffset||0,x.byteLength);if(x instanceof ArrayBuffer)return new Uint8Array(x);if(typeof x==="string")return new TextEncoder().encode(x);throw 0;}
var P=window._takumiSolPending=window._takumiSolPending||new Map();
function R(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);}
function S(m,p){return new Promise(function(ok,ng){var id=R();P.set(id,{r:ok,j:ng});try{
  var nc=window.__takumi_solana_nonce||"";
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"takumi_diagnostic",tag:"solana_request",at:Date.now(),method:m,id:id,hasNonce:!!nc,location:location.href}));}catch(d){}
  window.ReactNativeWebView.postMessage(JSON.stringify({type:"bridge_request",namespace:"solana",id:id,method:m,params:p,__takumi_nonce:nc,__takumi_origin:(function(){try{return window.top.location.origin;}catch(e){return location.origin;}})()}));
}catch(e){P.delete(id);ng(new Error("bridge transport failed"));}});}
var H=window._handleEthereumResponse;
window._handleEthereumResponse=function(x){try{if(x&&x.type==="bridge_response"&&P.has(x.id)){var p=P.get(x.id);P.delete(x.id);if(x.error){var e=new Error(x.error.message||"rejected");e.code=x.error.code;p.j(e);}else p.r(x.result);return;}}catch(e){}if(H)try{H(x);}catch(e){}};
function K(a){if(!a)return null;var u=bd(a);return{toBytes:function(){return u;},toBase58:function(){return a;},toString:function(){return a;},equals:function(o){return o&&o.toBase58&&o.toBase58()===a;}};}
function MA(a){return{address:a,publicKey:bd(a),chains:C,features:F,label:"TakumiPay"};}
function NA(r){var a=(r&&r.accounts)||[],o=[],i;for(i=0;i<a.length;i++)o.push(MA(a[i].address));return o;}
var lsn={change:new Set()};
function EV(e,cb){var s=lsn[e]||(lsn[e]=new Set());s.add(cb);return function(){s.delete(cb);};}
// setAccounts: shared WS + legacy shim state transition.
function setAccounts(next){
  W.accounts=next;
  lsn.change.forEach(function(cb){try{cb({accounts:next});}catch(e){}});
  var ad=next.length?next[0].address:null;
  sh.publicKey=K(ad);sh.isConnected=!!ad;
  var hs=ad?hk.connect:hk.disconnect;
  hs.forEach(function(cb){try{cb(ad?sh.publicKey:undefined);}catch(e){}});
}
async function C1(x){
  var accs=NA(await S("standard:connect",[{silent:!!(x&&x.silent)}]));
  setAccounts(accs);
  return {accounts:accs};
}
async function D1(){
  await S("standard:disconnect",[]);
  setAccounts([]);
}
async function SI(){var a=[].slice.call(arguments),o=[],i,r;for(i=0;i<a.length;i++){r=await S("solana:signIn",[a[i]]);o.push({account:MA(r.account.address),signedMessage:b64d(r.signedMessage),signature:b64d(r.signature),signatureType:"ed25519"});}return o;}
async function SM(){var a=[].slice.call(arguments),o=[],i,r;for(i=0;i<a.length;i++){r=await S("solana:signMessage",[{address:a[i].account&&a[i].account.address,message:b64e(U(a[i].message))}]);o.push({signedMessage:b64d(r.signedMessage||""),signature:b64d(r.signature),signatureType:"ed25519"});}return o;}
async function ST(){var a=[].slice.call(arguments),w=[],i,r;for(i=0;i<a.length;i++)w.push({address:a[i].account&&a[i].account.address,transaction:b64e(U(a[i].transaction)),chain:a[i].chain});r=await S("solana:signTransaction",w);var o=[];for(i=0;i<r.length;i++)o.push({signedTransaction:b64d(r[i].signedTransaction)});return o;}
async function SS(){var a=[].slice.call(arguments),w=[],i,r;for(i=0;i<a.length;i++)w.push({address:a[i].account&&a[i].account.address,transaction:b64e(U(a[i].transaction)),chain:a[i].chain,options:a[i].options});r=await S("solana:signAndSendTransaction",w);var o=[];for(i=0;i<r.length;i++)o.push({signature:bd(r[i].signature)});return o;}
async function SC(t){await S("takumi:switchCluster",[{to:t}]);}
async function WT(m,h){await S("takumi:watchToken",[{mint:m,hint:h||null}]);}
var feats={
"standard:connect":{version:"1.0.0",connect:C1},
"standard:disconnect":{version:"1.0.0",disconnect:D1},
"standard:events":{version:"1.0.0",on:EV},
"solana:signIn":{version:"1.0.0",signIn:SI},
"solana:signMessage":{version:"1.0.0",signMessage:SM},
"solana:signTransaction":{version:"1.0.0",supportedTransactionVersions:V,signTransaction:ST},
"solana:signAndSendTransaction":{version:"1.0.0",supportedTransactionVersions:V,signAndSendTransaction:SS},
"takumi:switchCluster":{version:"1.0.0",switchCluster:SC},
"takumi:watchToken":{version:"1.0.0",watchToken:WT}};
// accounts MUST start as [] pre-connect per §4.2b. Pre-populating from
// the active wallet makes some dApps (Raydium, Jupiter variants) infer
// "already connected" and skip the connect flow entirely — user taps
// Connect and nothing happens. Accounts are only populated after the
// dApp calls standard:connect and the user approves on our sheet.
var W={version:"1.0.0",name:"TakumiPay",icon:${I},chains:C,features:feats,accounts:[]};
// Stash on window so re-injects can re-dispatch register-wallet with
// the same identity — dApps that mount their listener after our first
// dispatch (e.g. React Wallet Adapter after hydration) will catch us.
window.__takumi_solana_wallet=W;
window._updateSolanaWallet=function(st){
  try{
    var n=st&&st.accounts?st.accounts.map(function(a){return MA(a.address);}):[];
    setAccounts(n);
  }catch(e){}
};
try{var ev=new Event("wallet-standard:register-wallet");ev.detail=function(api){try{api.register(W);}catch(e){}};window.dispatchEvent(ev);}catch(e){}
window.addEventListener("wallet-standard:app-ready",function(e){
  try{
    e.detail.register(W);
    try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:"takumi_diagnostic",tag:"solana_app_ready",at:Date.now(),location:location.href}));}catch(d){}
  }catch(err){}
});
var hk={connect:new Set(),disconnect:new Set(),accountChanged:new Set()};
// isPhantom:true = legacy-detection compat (Uniswap switch-Solana,
// Backpack/Solflare pattern). isTakumi = authoritative identity.
var sh={
isPhantom:true,isTakumi:true,
// Legacy shim must also start disconnected — sync with WS wallet state.
publicKey:null,isConnected:false,
connect:async function(o){
  var r=await S("standard:connect",[{silent:!!(o&&o.onlyIfTrusted)}]);
  var accs=NA(r);
  var ad=accs.length?accs[0].address:null;
  if(!ad){var e=new Error("not connected");e.code=4001;throw e;}
  setAccounts(accs);
  return{publicKey:sh.publicKey};
},
disconnect:async function(){
  await S("standard:disconnect",[]);
  setAccounts([]);
},
signMessage:async function(m){var b=U(m);var r=await S("solana:signMessage",[{address:sh.publicKey&&sh.publicKey.toBase58(),message:b64e(b)}]);return{signature:b64d(r.signature),publicKey:sh.publicKey};},
signTransaction:async function(t){var w=[{address:sh.publicKey&&sh.publicKey.toBase58(),transaction:b64e(U(t))}];var r=await S("solana:signTransaction",w);return b64d(r[0].signedTransaction);},
signAllTransactions:async function(ts){var w=[],i;for(i=0;i<ts.length;i++)w.push({address:sh.publicKey&&sh.publicKey.toBase58(),transaction:b64e(U(ts[i]))});var r=await S("solana:signTransaction",w);var o=[];for(i=0;i<r.length;i++)o.push(b64d(r[i].signedTransaction));return o;},
signAndSendTransaction:async function(t,o){var w=[{address:sh.publicKey&&sh.publicKey.toBase58(),transaction:b64e(U(t)),options:o||{}}];var r=await S("solana:signAndSendTransaction",w);return{signature:r[0].signature};},
signIn:async function(){var e=new Error("use WS solana:signIn");e.code=4200;throw e;},
request:async function(r){var m=r&&r.method,p=(r&&r.params)||[];if(m==="connect")return sh.connect(p[0]);if(m==="disconnect")return sh.disconnect();if(m==="signMessage")return sh.signMessage(p[0]);if(m==="signTransaction")return sh.signTransaction(p[0]);if(m==="signAndSendTransaction")return sh.signAndSendTransaction(p[0],p[1]);var e=new Error("unsupported");e.code=4200;throw e;},
on:function(e,cb){(hk[e]||(hk[e]=new Set())).add(cb);return sh;},
off:function(e,cb){hk[e]&&hk[e].delete(cb);return sh;}};
window.solana=sh;
try{window.phantom=Object.assign({},window.phantom||{},{solana:sh});}catch(e){window.phantom={solana:sh};}
})();`;
}
