import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, addDoc, deleteDoc, setDoc, updateDoc, doc, onSnapshot, serverTimestamp, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig={apiKey:"AIzaSyDwzfk7-3P4Afi4d3i965PZNERrFUJrEsM",authDomain:"budget-bbec2.firebaseapp.com",projectId:"budget-bbec2",storageBucket:"budget-bbec2.firebasestorage.app",messagingSenderId:"321441819817",appId:"1:321441819817:web:4c51f2efb940ee3e3e8db8"};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

const DEFAULT_EXP=[{name:'식비',icon:'🍽'},{name:'교통',icon:'🚇'},{name:'쇼핑',icon:'🛍'},{name:'문화·여가',icon:'🎬'},{name:'의료·건강',icon:'💊'},{name:'통신',icon:'📱'},{name:'주거',icon:'🏠'},{name:'교육',icon:'📚'},{name:'기타',icon:'📌'}];
const DEFAULT_INC=[{name:'급여',icon:'💰'},{name:'용돈',icon:'💵'},{name:'기타수입',icon:'💹'}];
const CCOLORS=['#1D9E75','#185FA5','#D4537E','#7F77DD','#D85A30','#BA7517','#3B6D11','#639922','#888780','#0F6E56','#A32D2D','#0C447C'];
const CMAP={식비:'#1D9E75',교통:'#185FA5',쇼핑:'#D4537E','문화·여가':'#7F77DD','의료·건강':'#D85A30',통신:'#BA7517',주거:'#3B6D11',교육:'#639922',기타:'#888780',급여:'#185FA5',용돈:'#1D9E75','기타수입':'#0F6E56'};
const MONTHS=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const PAYICONS={카드:'<path d="M2 9h20M2 13h6"/>',현금:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',계좌이체:'<path d="M5 12h14M12 5l7 7-7 7"/>',간편결제:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',기타:'<circle cx="12" cy="12" r="3"/>'};

let txType='expense',curYear=new Date().getFullYear(),curMonth=new Date().getMonth();
let txs=[],payments=[],categories=[],budgets=[],assets=[],transfers=[],mainCategories=[],members=[],barInst=null,payBarInst=null,donutInst=null;
let unsub=null,unsubPay=null,unsubCat=null,unsubBudget=null,unsubAsset=null,unsubTransfer=null,unsubMainCat=null,unsubMember=null,currentUser=null,authMode='login';

const fmt=n=>'₩'+Math.abs(n).toLocaleString('ko-KR');
const getMonthTx=()=>txs.filter(t=>{const d=new Date(t.date);return d.getFullYear()===curYear&&d.getMonth()===curMonth;}).sort((a,b)=>new Date(b.date)-new Date(a.date));
const setSyncing=v=>document.getElementById('syncBar').classList.toggle('syncing',v);
const getExpCats=()=>categories.filter(c=>c.kind==='expense');
const getIncCats=()=>categories.filter(c=>c.kind==='income');
const getCatIcon=n=>{const c=categories.find(c=>c.name===n);return c?c.icon:'📌';};
const getCatColor=n=>CMAP[n]||'#888780';

window.switchAuthTab=function(mode){
  authMode=mode;
  document.getElementById('tabLogin').classList.toggle('active',mode==='login');
  document.getElementById('tabSignup').classList.toggle('active',mode==='signup');
  document.getElementById('authBtn').textContent=mode==='login'?'로그인':'회원가입';
  document.getElementById('authErr').textContent='';
};
window.doAuth=async function(){
  const email=document.getElementById('authEmail').value.trim();
  const pw=document.getElementById('authPw').value;
  const btn=document.getElementById('authBtn'),err=document.getElementById('authErr');
  if(!email||!pw){err.textContent='이메일과 비밀번호를 입력해주세요';return;}
  btn.disabled=true;btn.textContent='처리 중...';err.textContent='';
  try{
    if(authMode==='login') await signInWithEmailAndPassword(auth,email,pw);
    else await createUserWithEmailAndPassword(auth,email,pw);
  }catch(e){
    const msgs={'auth/user-not-found':'등록되지 않은 이메일이에요','auth/wrong-password':'비밀번호가 틀렸어요','auth/email-already-in-use':'이미 사용 중인 이메일이에요','auth/weak-password':'비밀번호는 6자 이상이어야 해요','auth/invalid-email':'이메일 형식이 올바르지 않아요','auth/invalid-credential':'이메일 또는 비밀번호가 틀렸어요'};
    err.textContent=msgs[e.code]||'오류: '+e.message;
  }
  btn.disabled=false;btn.textContent=authMode==='login'?'로그인':'회원가입';
};
window.doLogout=async function(){[unsub,unsubPay,unsubCat,unsubBudget,unsubAsset,unsubTransfer,unsubMainCat,unsubMember].forEach(u=>{if(u)u();});await signOut(auth);};

onAuthStateChanged(auth,user=>{
  const splash=document.getElementById('splash');
  if(splash){splash.classList.add('hide');setTimeout(()=>splash.remove(),350);}
  if(user){
    currentUser=user;
    document.getElementById('authScreen').style.display='none';
    document.getElementById('appScreen').classList.add('on');
    document.getElementById('userEmail').textContent=user.email;
    subscribeAll();init();
    if(window._pendingSharedText){setTimeout(()=>{handleSharedText(window._pendingSharedText);window._pendingSharedText=null;},1000);}
  }else{
    currentUser=null;txs=[];payments=[];categories=[];budgets=[];
    document.getElementById('authScreen').style.display='flex';document.getElementById('authScreen').style.flexDirection='column';
    document.getElementById('appScreen').classList.remove('on');
  }
});

function subscribeAll(){
  if(unsub)unsub();
  setSyncing(true);
  unsub=onSnapshot(collection(db,'transactions'),snap=>{txs=snap.docs.map(d=>({id:d.id,...d.data()}));setSyncing(false);refresh();},()=>setSyncing(false));
  if(unsubPay)unsubPay();
  unsubPay=onSnapshot(collection(db,'payments'),snap=>{payments=snap.docs.map(d=>({id:d.id,...d.data()}));renderPayList();updateAssetSelects();});
  if(unsubCat)unsubCat();
  unsubCat=onSnapshot(collection(db,'categories'),snap=>{
    categories=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!categories.length) seedCats();
    renderCatChips();updateCatSelects();
  
    refresh();
  });
  if(unsubBudget)unsubBudget();
  unsubBudget=onSnapshot(collection(db,'budgets'),snap=>{budgets=snap.docs.map(d=>({id:d.id,...d.data()}));renderBudgets();});

  if(unsubAsset)unsubAsset();
  unsubAsset=onSnapshot(collection(db,'assets'),snap=>{
    assets=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAssets();updateAssetSelects();
  });

  if(unsubTransfer)unsubTransfer();
  unsubTransfer=onSnapshot(collection(db,'transfers'),snap=>{
    transfers=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.date.localeCompare(a.date));
    renderTransfers();
  });

  if(unsubMainCat)unsubMainCat();
  unsubMainCat=onSnapshot(collection(db,'mainCategories'),snap=>{
    mainCategories=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!mainCategories.length) seedMainCategories();
    renderMainCatChips();updateMainCatSelects();
  });

  if(unsubMember)unsubMember();
  unsubMember=onSnapshot(collection(db,'members'),snap=>{
    members=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!members.length) seedMembers();
    renderMemberChips();updateMemberSelects();
  });
}
async function seedCats(){
  for(const c of DEFAULT_EXP) await addDoc(collection(db,'categories'),{...c,kind:'expense'});
  for(const c of DEFAULT_INC) await addDoc(collection(db,'categories'),{...c,kind:'income'});
}

window.addTx=async function(){
  const amt=parseInt(document.getElementById('txAmt').value);
  const date=document.getElementById('txDate').value;
  if(!amt||amt<=0||!date){alert('금액과 날짜를 입력해주세요');return;}
  const btn=document.getElementById('addBtn');
  btn.disabled=true;setSyncing(true);
  const cat=document.getElementById('txCat').value;
  try{
    await addDoc(collection(db,'transactions'),{type:txType,amount:amt,date,category:cat,payment:document.getElementById('txPay').value||'',
      mainCat:document.getElementById('txMainCat')?.value||'',
      member:document.getElementById('txMember')?.value||'',note:document.getElementById('txNote').value.trim(),userEmail:currentUser.email,uid:currentUser.uid,createdAt:serverTimestamp()});
    document.getElementById('txAmt').value='';
    document.getElementById('txNote').value='';
    if(txType==='expense') checkBudget(cat);
  }catch(e){alert('저장 실패: '+e.message);setSyncing(false);}
  btn.disabled=false;
};
window.delTx=async function(id){if(!confirm('삭제하시겠어요?'))return;setSyncing(true);try{await deleteDoc(doc(db,'transactions',id));}catch(e){alert('삭제 실패: '+e.message);setSyncing(false);}};

window.addPayment=async function(){
  const name=document.getElementById('payName').value.trim();
  const type=document.getElementById('payType').value;
  if(!name){alert('수단 이름을 입력해주세요');return;}
  if(payments.find(p=>p.name===name)){alert('이미 등록된 이름이에요');return;}
  try{await addDoc(collection(db,'payments'),{name,type,createdAt:serverTimestamp()});document.getElementById('payName').value='';}
  catch(e){alert('저장 실패: '+e.message);}
};
window.delPayment=async function(id){if(!confirm('삭제하시겠어요?'))return;try{await deleteDoc(doc(db,'payments',id));}catch(e){alert('삭제 실패: '+e.message);}};

window.addCategory=async function(){
  const name=document.getElementById('catName').value.trim();
  const kind=document.getElementById('catKind').value;
  const icon=document.getElementById('catIcon').value.trim()||'📌';
  const mainCat=document.getElementById('catMainCat')?.value||'';
  if(!name){alert('카테고리 이름을 입력해주세요');return;}
  if(categories.find(c=>c.name===name)){alert('이미 등록된 이름이에요');return;}
  try{
    await addDoc(collection(db,'categories'),{name,kind,icon,mainCat,createdAt:serverTimestamp()});
    document.getElementById('catName').value='';
    document.getElementById('catIcon').value='';
  }catch(e){alert('저장 실패: '+e.message);}
};
window.delCategory=async function(id){if(!confirm('삭제하시겠어요?'))return;try{await deleteDoc(doc(db,'categories',id));}catch(e){alert('삭제 실패: '+e.message);}};

window.addBudget=async function(){
  const cat=document.getElementById('budgetCat').value;
  const amt=parseInt(document.getElementById('budgetAmt').value);
  if(!cat||!amt||amt<=0){alert('카테고리와 예산을 입력해주세요');return;}
  try{await setDoc(doc(db,'budgets',cat),{category:cat,amount:amt,id:cat,updatedAt:serverTimestamp()});document.getElementById('budgetAmt').value='';alert('✅ '+cat+' 예산이 설정되었어요!');}
  catch(e){alert('저장 실패: '+e.message);}
};
window.delBudget=async function(id){if(!confirm('삭제하시겠어요?'))return;try{await deleteDoc(doc(db,'budgets',id));}catch(e){alert('삭제 실패: '+e.message);}};

function checkBudget(catName){
  const b=budgets.find(b=>b.category===catName);if(!b)return;
  const spent=getMonthTx().filter(t=>t.type==='expense'&&t.category===catName).reduce((s,t)=>s+t.amount,0);
  const pct=Math.round(spent/b.amount*100);
  if(pct>=100) alert('⚠️ '+catName+' 예산 초과!\n예산: '+fmt(b.amount)+'\n지출: '+fmt(spent));
  else if(pct>=80) alert('⚡ '+catName+' 예산 80% 초과\n예산: '+fmt(b.amount)+'\n지출: '+fmt(spent)+' ('+pct+'%)');
}

window.setType=function(type){
  txType=type;
  document.getElementById('btnExp').className='type-btn exp-btn'+(type==='expense'?' active':'');
  document.getElementById('btnInc').className='type-btn inc-btn'+(type==='income'?' active':'');
  updateCatSelects();
};
function updateCatSelects(filterMainCat){
  let cats=txType==='expense'?getExpCats():getIncCats();
  if(filterMainCat) cats=cats.filter(c=>c.mainCat===filterMainCat);
  const sel=document.getElementById('txCat'),cur=sel.value;
  sel.innerHTML=cats.length?cats.map(c=>'<option value="'+c.name+'">'+c.icon+' '+c.name+'</option>').join(''):'<option value="">없음</option>';
  if(cur&&cats.find(c=>c.name===cur)) sel.value=cur;
  const bsel=document.getElementById('budgetCat');
  if(bsel) bsel.innerHTML=getExpCats().map(c=>'<option value="'+c.name+'">'+c.icon+' '+c.name+'</option>').join('');
}

function updateEditCatSelectFiltered(filterMainCat){
  let cats=editType==='expense'?getExpCats():getIncCats();
  if(filterMainCat) cats=cats.filter(c=>c.mainCat===filterMainCat);
  const sel=document.getElementById('editCat');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML=cats.map(c=>'<option value="'+c.name+'">'+c.icon+' '+c.name+'</option>').join('');
  if(cur&&cats.find(c=>c.name===cur)) sel.value=cur;
}
function updatePaySelect(){
  const sel=document.getElementById('txPay'),cur=sel.value;
  sel.innerHTML='<option value="">선택 안 함</option>'+payments.map(p=>'<option value="'+p.name+'">'+p.name+'</option>').join('');
  if(cur) sel.value=cur;
}
function renderPayList(){
  const el=document.getElementById('payList');if(!el)return;
  if(!payments.length){el.innerHTML='<div class="empty">등록된 결제 수단이 없어요</div>';return;}
  el.innerHTML=payments.sort((a,b)=>a.name.localeCompare(b.name)).map(p=>'<div class="pay-item" onclick="openItemEditModal(\'payment\',\''+p.id+'\')" style="cursor:pointer"><div class="pay-icon"><svg viewBox="0 0 24 24">'+( PAYICONS[p.type]||PAYICONS['기타'])+'</svg></div><span class="pay-name">'+p.name+'</span><span class="pay-type-badge">'+p.type+'</span><button class="pay-del" onclick="event.stopPropagation();delPayment(\''+p.id+'\')">×</button></div>').join('');
}
function renderCatChips(){
  const ee=document.getElementById('expCatChips'),ii=document.getElementById('incCatChips');if(!ee||!ii)return;
  ee.innerHTML=getExpCats().map(c=>'<div class="chip" onclick="openItemEditModal(\'subCat\',\''+c.id+'\')" style="cursor:pointer">'+c.icon+' '+c.name+'<button class="chip-del" onclick="event.stopPropagation();delCategory(\''+c.id+'\')">×</button></div>').join('')||'<span style="font-size:12px;color:var(--t2)">없음</span>';
  ii.innerHTML=getIncCats().map(c=>'<div class="chip" onclick="openItemEditModal(\'subCat\',\''+c.id+'\')" style="cursor:pointer">'+c.icon+' '+c.name+'<button class="chip-del" onclick="event.stopPropagation();delCategory(\''+c.id+'\')">×</button></div>').join('')||'<span style="font-size:12px;color:var(--t2)">없음</span>';
}
function renderBudgets(){
  const el=document.getElementById('budgetList');if(!el)return;
  if(!budgets.length){el.innerHTML='<div class="empty">설정된 예산이 없어요</div>';return;}
  const m=getMonthTx();
  el.innerHTML=budgets.map(b=>{
    const spent=m.filter(t=>t.type==='expense'&&t.category===b.category).reduce((s,t)=>s+t.amount,0);
    const pct=Math.min(Math.round(spent/b.amount*100),100);
    const over=spent>b.amount;
    const col=over?'#E24B4A':pct>=80?'#BA7517':getCatColor(b.category);
    return '<div class="budget-item"><div class="budget-info"><div class="budget-label">'+getCatIcon(b.category)+' '+b.category+(over?'<span class="alert-badge">초과</span>':pct>=80?'<span class="alert-badge" style="background:#FAEEDA;color:#633806">80%+</span>':'')+'</div><div class="budget-sub">'+fmt(spent)+' / '+fmt(b.amount)+' ('+pct+'%)</div><div class="budget-bar-wrap"><div class="budget-bar" style="width:'+pct+'%;background:'+col+'"></div></div></div><button class="budget-del" onclick="delBudget(\''+b.id+'\')">×</button></div>';
  }).join('');
}

function updateSummary(){
  const m=getMonthTx();
  const inc=m.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp=m.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const bal=inc-exp;
  document.getElementById('totInc').textContent=fmt(inc);
  document.getElementById('totExp').textContent=fmt(exp);
  const b=document.getElementById('totBal');
  b.textContent=(bal<0?'-':'')+fmt(bal);
  b.className='val '+(bal>=0?'pos':'neg');
  document.getElementById('monthLabel').textContent=curYear+'년 '+MONTHS[curMonth];
}
function renderList(){
  const m=getMonthTx(),el=document.getElementById('txList');
  if(!m.length){el.innerHTML='<div class="empty">이번 달 기록이 없어요 🌱<br>첫 번째 항목을 추가해보세요</div>';return;}
  el.innerHTML=m.map(t=>{
    const mine=t.uid===currentUser?.uid;
    const actionBtns=mine
      ?`<button class="tx-edit" onclick="openEditModal('${t.id}')">✎</button><button class="tx-del" onclick="delTx('${t.id}')">×</button>`
      :'';
    return `<div class="tx-item">
      <div class="tx-icon" style="background:${t.type==='income'?'#FCEBEB':'#E6F1FB'}">${getCatIcon(t.category)}</div>
      <div class="tx-info">
        <div class="tx-title">${t.note||t.category}</div>
        <div class="tx-meta">${t.mainCat?t.mainCat+' > ':''} ${t.category}${t.payment?' · '+t.payment:''}${t.member?' · '+t.member:''} · ${t.date}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${t.type==='income'?'inc':'exp'}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
        <div class="tx-who">${(t.userEmail||'').split('@')[0]}</div>
        <div style="display:flex;gap:4px">${actionBtns}</div>
      </div>
    </div>`;
  }).join('');
}

window.renderChart=function(){
  const m=getMonthTx();
  const cats={};
  m.filter(t=>t.type==='expense').forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount;});
  const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const maxV=sorted.length?sorted[0][1]:1;
  document.getElementById('catBars').innerHTML=sorted.length?sorted.map(([c,v])=>'<div class="cat-item"><div class="cat-row"><span class="cat-name">'+getCatIcon(c)+' '+c+'</span><span class="cat-val">'+fmt(v)+'</span></div><div class="cat-track"><div class="cat-fill" style="width:'+Math.round(v/maxV*100)+'%;background:'+getCatColor(c)+'"></div></div></div>').join(''):'<div class="empty">지출 데이터가 없어요</div>';

  // 도넛 차트
  if(donutInst)donutInst.destroy();
  const donutWrap=document.getElementById('donutWrap');
  const donutLegend=document.getElementById('donutLegend');
  if(sorted.length&&window.Chart){
    donutWrap.innerHTML='<canvas id="donutChart"></canvas>';
    donutInst=new Chart(document.getElementById('donutChart'),{
      type:'doughnut',
      data:{
        labels:sorted.map(([c])=>getCatIcon(c)+' '+c),
        datasets:[{data:sorted.map(([,v])=>v),backgroundColor:sorted.map(([c],i)=>getCatColor(c)||CCOLORS[i%CCOLORS.length]),borderWidth:2,borderColor:'transparent',hoverOffset:6}]
      },
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmt(ctx.raw)+' ('+Math.round(ctx.raw/sorted.reduce((s,[,v])=>s+v,0)*100)+'%)'}}}}
    });
    donutLegend.innerHTML=sorted.map(([c,v])=>{
      const pct=Math.round(v/sorted.reduce((s,[,x])=>s+x,0)*100);
      return '<div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--t2)"><div style="width:10px;height:10px;border-radius:2px;background:'+getCatColor(c)+';flex-shrink:0"></div>'+getCatIcon(c)+' '+c+' '+pct+'%</div>';
    }).join('');
  } else {
    donutWrap.innerHTML='<div class="empty" style="padding:1rem">지출 데이터가 없어요</div>';
    donutLegend.innerHTML='';
  }

  const payMap={};
  m.filter(t=>t.type==='expense'&&t.payment).forEach(t=>{payMap[t.payment]=(payMap[t.payment]||0)+t.amount;});
  const pe=Object.entries(payMap).sort((a,b)=>b[1]-a[1]);
  if(payBarInst)payBarInst.destroy();
  const pwrap=document.getElementById('payBarWrap');
  if(pe.length&&window.Chart){
    pwrap.innerHTML='<canvas id="payChart"></canvas>';
    payBarInst=new Chart(document.getElementById('payChart'),{type:'bar',data:{labels:pe.map(e=>e[0]),datasets:[{data:pe.map(e=>e[1]),backgroundColor:CCOLORS.slice(0,pe.length),borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#888',font:{size:12}}},y:{grid:{color:'rgba(128,128,128,0.1)'},ticks:{color:'#888',font:{size:11},callback:v=>'₩'+(v/10000).toFixed(0)+'만'}}}}});
  } else {
    pwrap.innerHTML='<div class="empty" style="padding:1rem">결제 수단 데이터가 없어요</div>';
  }

  const inc=m.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expT=m.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  if(barInst)barInst.destroy();
  if(window.Chart) barInst=new Chart(document.getElementById('barChart'),{type:'bar',data:{labels:['수입','지출'],datasets:[{data:[inc,expT],backgroundColor:['#E24B4A','#378ADD'],borderRadius:8,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#888',font:{size:13}}},y:{grid:{color:'rgba(128,128,128,0.1)'},ticks:{color:'#888',font:{size:11},callback:v=>'₩'+(v/10000).toFixed(0)+'만'}}}}});
};

function txToCSV(list){
  const rows=[['날짜','유형','카테고리','결제수단','금액','메모','작성자']];
  list.sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{rows.push([t.date,t.type==='income'?'수입':'지출',t.category,t.payment||'',t.amount,t.note||'',(t.userEmail||'').split('@')[0]]);});
  return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
}
function dlCSV(content,name){const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(content);a.download=name;a.click();}
window.exportCSV=function(){const m=getMonthTx();if(!m.length){alert('이번 달 데이터가 없어요');return;}dlCSV(txToCSV(m),'가계부_'+curYear+'년'+MONTHS[curMonth]+'.csv');};
window.exportCSVAll=function(){if(!txs.length){alert('데이터가 없어요');return;}dlCSV(txToCSV(txs),'가계부_전체.csv');};

window.changeMonth=function(d){curMonth+=d;if(curMonth<0){curMonth=11;curYear--;}if(curMonth>11){curMonth=0;curYear++;}refresh();renderBudgets();};
window.switchTab=function(name,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bot-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('p-'+name).classList.add('active');
  btn.classList.add('active');
  if(name==='chart')renderChart();
  if(name==='budget')renderBudgets();
  if(name==='asset'){renderAssets();renderTransfers();}
};

window.runAI=async function(){
  const key=localStorage.getItem('gaebub_key');
  if(!key){document.getElementById('aiResult').textContent='설정 탭에서 API 키를 먼저 입력해주세요.';return;}
  const m=getMonthTx();
  if(!m.length){document.getElementById('aiResult').textContent='이번 달 기록이 없어요.';return;}
  const inc=m.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp=m.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const cats={};
  m.filter(t=>t.type==='expense').forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount;});
  const catStr=Object.entries(cats).map(([k,v])=>k+': '+v.toLocaleString()+'원').join(', ');
  const budStr=budgets.map(b=>{const s=m.filter(t=>t.type==='expense'&&t.category===b.category).reduce((s,t)=>s+t.amount,0);return b.category+' 예산 '+b.amount.toLocaleString()+'원 중 '+s.toLocaleString()+'원 사용';}).join(', ');
  const btn=document.getElementById('aiBtn'),res=document.getElementById('aiResult');
  btn.disabled=true;btn.textContent='분석 중...';res.className='ai-result dim';res.textContent='AI가 분석하고 있어요...';
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,messages:[{role:'user',content:'이번 달 가계부:\n수입: '+inc.toLocaleString()+'원, 지출: '+exp.toLocaleString()+'원\n카테고리별: '+catStr+'\n예산 현황: '+(budStr||'없음')+'\n\n친절하고 실용적인 한국어로 소비 패턴 분석, 예산 초과 항목 언급, 절약 팁을 4~5문장으로 알려주세요.'}]})});
    const data=await r.json();
    res.className='ai-result';res.textContent=data.content?.[0]?.text||'오류: '+(data.error?.message||'');
  }catch(e){res.className='ai-result';res.textContent='오류: '+e.message;}
  btn.disabled=false;btn.innerHTML='✦ 다시 분석';
};


let editType = 'expense';

window.openEditModal = function(id) {
  const t = txs.find(t => t.id === id);
  if (!t) return;
  editType = t.type;
  document.getElementById('editId').value = id;
  document.getElementById('editAmt').value = t.amount;
  document.getElementById('editDate').value = t.date;
  document.getElementById('editNote').value = t.note || '';
  if(document.getElementById('editMainCat')) document.getElementById('editMainCat').value = t.mainCat||'';
  if(document.getElementById('editMember')) document.getElementById('editMember').value = t.member||'';
  // type toggle
  setEditType(t.type);
  // cat select
  updateEditCatSelect(t.type, t.category);
  // pay select
  const ps = document.getElementById('editPay');
  ps.innerHTML = '<option value="">선택 안 함</option>' + payments.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('');
  ps.value = t.payment || '';
  document.getElementById('editModal').classList.add('open');
};

window.setEditType = function(type) {
  editType = type;
  document.getElementById('editBtnExp').className = 'type-btn exp-btn' + (type === 'expense' ? ' active' : '');
  document.getElementById('editBtnInc').className = 'type-btn inc-btn' + (type === 'income' ? ' active' : '');
  updateEditCatSelect(type, '');
};

function updateEditCatSelect(type, selected) {
  const cats = type === 'expense' ? getExpCats() : getIncCats();
  const sel = document.getElementById('editCat');
  sel.innerHTML = cats.map(c => '<option value="' + c.name + '">' + c.icon + ' ' + c.name + '</option>').join('');
  if (selected && cats.find(c => c.name === selected)) sel.value = selected;
}

window.closeEditModal = function(e) {
  if (e && e.target !== document.getElementById('editModal')) return;
  document.getElementById('editModal').classList.remove('open');
};

window.saveTxEdit = async function() {
  const id = document.getElementById('editId').value;
  const amt = parseInt(document.getElementById('editAmt').value);
  const date = document.getElementById('editDate').value;
  if (!amt || amt <= 0 || !date) { alert('금액과 날짜를 입력해주세요'); return; }
  setSyncing(true);
  try {
    await updateDoc(doc(db, 'transactions', id), {
      type: editType,
      amount: amt,
      date,
      category: document.getElementById('editCat').value,
      payment: document.getElementById('editPay').value || '',
      mainCat: document.getElementById('editMainCat')?.value || '',
      member: document.getElementById('editMember')?.value || '',
      note: document.getElementById('editNote').value.trim(),
    });
    document.getElementById('editModal').classList.remove('open');
  } catch(e) { alert('수정 실패: ' + e.message); setSyncing(false); }
};


// ── 자산 관리 ──

// 자산 잔액 계산 (초기잔액 + 수입거래 - 지출거래 + 이체입금 - 이체출금)
function calcAssetBalance(assetId) {
  const asset = assets.find(a => a.id === assetId);
  if (!asset) return 0;
  let bal = asset.initBalance || 0;
  // 거래 내역 반영 (결제수단이 이 자산 이름인 것)
  txs.forEach(t => {
    if (t.payment === asset.name) {
      bal += t.type === 'income' ? t.amount : -t.amount;
    }
  });
  // 이체 반영
  transfers.forEach(tr => {
    if (tr.fromId === assetId) bal -= tr.amount;
    if (tr.toId === assetId) bal += tr.amount;
  });
  return bal;
}

function calcTotalAsset() {
  return assets.reduce((s, a) => s + calcAssetBalance(a.id), 0);
}

window.addAsset = async function() {
  const name = document.getElementById('assetName').value.trim();
  const type = document.getElementById('assetType').value;
  const icon = document.getElementById('assetIcon').value.trim() || (type === 'cash' ? '💵' : '🏦');
  const initBalance = parseInt(document.getElementById('assetInitBal').value) || 0;
  if (!name) { alert('자산 이름을 입력해주세요'); return; }
  if (assets.find(a => a.name === name)) { alert('이미 등록된 이름이에요'); return; }
  try {
    await addDoc(collection(db, 'assets'), { name, type, icon, initBalance, createdAt: serverTimestamp() });
    document.getElementById('assetName').value = '';
    document.getElementById('assetInitBal').value = '';
    document.getElementById('assetIcon').value = '';
    alert('✅ ' + name + ' 자산이 추가되었어요!');
  } catch(e) { alert('저장 실패: ' + e.message); }
};

window.delAsset = async function(id) {
  if (!confirm('자산을 삭제하시겠어요?\n관련 이체 내역도 함께 삭제됩니다.')) return;
  try {
    await deleteDoc(doc(db, 'assets', id));
    // 관련 이체도 삭제
    const related = transfers.filter(t => t.fromId === id || t.toId === id);
    for (const t of related) await deleteDoc(doc(db, 'transfers', t.id));
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

window.addTransfer = async function() {
  const fromId = document.getElementById('transferFrom').value;
  const toId = document.getElementById('transferTo').value;
  const amt = parseInt(document.getElementById('transferAmt').value);
  const date = document.getElementById('transferDate').value;
  const note = document.getElementById('transferNote').value.trim();
  if (!fromId || !toId) { alert('출금/입금 자산을 선택해주세요'); return; }
  if (fromId === toId) { alert('같은 자산끼리는 이체할 수 없어요'); return; }
  if (!amt || amt <= 0 || !date) { alert('금액과 날짜를 입력해주세요'); return; }
  const fromAsset = assets.find(a => a.id === fromId);
  const toAsset = assets.find(a => a.id === toId);
  try {
    await addDoc(collection(db, 'transfers'), {
      fromId, toId,
      fromName: fromAsset?.name || '',
      toName: toAsset?.name || '',
      amount: amt, date, note,
      createdAt: serverTimestamp()
    });
    document.getElementById('transferAmt').value = '';
    document.getElementById('transferNote').value = '';
  } catch(e) { alert('저장 실패: ' + e.message); }
};

window.delTransfer = async function(id) {
  if (!confirm('이체 내역을 삭제하시겠어요?')) return;
  try { await deleteDoc(doc(db, 'transfers', id)); }
  catch(e) { alert('삭제 실패: ' + e.message); }
};

window.switchAssetSeg = function(seg, btn) {
  ['accounts','add','transfer'].forEach(s => {
    document.getElementById('assetSeg-' + s).style.display = s === seg ? 'block' : 'none';
    document.getElementById('seg-' + s).classList.toggle('active', s === seg);
  });
};

function updateAssetSelects() {
  const fromSel = document.getElementById('transferFrom');
  const toSel = document.getElementById('transferTo');
  if (!fromSel || !toSel) return;
  const opts = assets.map(a => '<option value="' + a.id + '">' + a.icon + ' ' + a.name + '</option>').join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  // 결제수단 select에 자산 연동 (자산 이름 기준)
  const txPay = document.getElementById('txPay');
  const editPay = document.getElementById('editPay');
  const assetOpts = assets.map(a => '<option value="' + a.name + '">' + a.icon + ' ' + a.name + '</option>').join('');
  if (txPay) {
    const cur = txPay.value;
    txPay.innerHTML = '<option value="">선택 안 함</option>' + assetOpts + (payments.length ? '<optgroup label="기타 결제수단">' + payments.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('') + '</optgroup>' : '');
    if (cur) txPay.value = cur;
  }
  if (editPay) {
    const cur2 = editPay.value;
    editPay.innerHTML = '<option value="">선택 안 함</option>' + assetOpts + (payments.length ? payments.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('') : '');
    if (cur2) editPay.value = cur2;
  }
}

function renderAssets() {
  const el = document.getElementById('assetList');
  if (!el) return;
  if (!assets.length) { el.innerHTML = '<div class="empty">등록된 자산이 없어요<br>자산 추가 탭에서 추가해보세요</div>'; }
  else {
    el.innerHTML = assets.map(a => { const editBtn = `<button class="asset-del" style="color:var(--a);margin-right:4px" onclick="event.stopPropagation();openItemEditModal('asset','${a.id}')">✎</button>`;
      const bal = calcAssetBalance(a.id);
      return `<div class="asset-item">
        <div class="asset-icon" style="background:${bal>=0?'var(--al)':'#FCEBEB'}">${a.icon}</div>
        <div class="asset-info">
          <div class="asset-name">${a.name}</div>
          <div class="asset-bank">${a.type==='cash'?'현금':'은행 통장'}</div>
        </div>
        <div class="asset-bal ${bal<0?'neg':''}">${bal<0?'-':''}${fmt(bal)}</div>
        <button class="asset-del" onclick="delAsset('${a.id}')">×</button>
      </div>`;
    }).join('');
  }
  // 총자산 업데이트
  const total = calcTotalAsset();
  const el2 = document.getElementById('totalAsset');
  if (el2) el2.textContent = (total < 0 ? '-' : '') + fmt(total);
}

function renderTransfers() {
  const el = document.getElementById('transferList');
  if (!el) return;
  if (!transfers.length) { el.innerHTML = '<div class="empty">이체 내역이 없어요</div>'; return; }
  el.innerHTML = transfers.slice(0, 30).map(t => `
    <div class="transfer-item">
      <div class="transfer-info">
        <div class="transfer-name">${t.fromName} → ${t.toName}${t.note ? ' · ' + t.note : ''}</div>
        <div class="transfer-date">${t.date}</div>
      </div>
      <div class="transfer-amt">${fmt(t.amount)}</div>
      <button class="transfer-del" onclick="delTransfer('${t.id}')">×</button>
    </div>`).join('');
}


// ── 대분류 관리 ──
const DEFAULT_MAIN_CATS=[
  {name:'식비/카페',icon:'🍽'},{name:'교통/여행',icon:'🚗'},{name:'쇼핑',icon:'🛍'},
  {name:'문화/취미',icon:'🎬'},{name:'의료/건강',icon:'💊'},{name:'생활/주거',icon:'🏠'},
  {name:'교육',icon:'📚'},{name:'수입',icon:'💰'},{name:'기타',icon:'📌'},
];
const DEFAULT_MEMBERS=[
  {name:'본인',icon:'👤'},{name:'배우자',icon:'💑'},{name:'자녀',icon:'👶'},
  {name:'부모님',icon:'👴'},{name:'공동',icon:'👪'},
];

async function seedMainCategories(){
  for(const c of DEFAULT_MAIN_CATS) await addDoc(collection(db,'mainCategories'),{...c,createdAt:serverTimestamp()});
}
async function seedMembers(){
  for(const m of DEFAULT_MEMBERS) await addDoc(collection(db,'members'),{...m,createdAt:serverTimestamp()});
}

window.addMainCategory=async function(){
  const name=document.getElementById('mainCatName').value.trim();
  const icon=document.getElementById('mainCatIcon').value.trim()||'📁';
  if(!name){alert('대분류 이름을 입력해주세요');return;}
  if(mainCategories.find(c=>c.name===name)){alert('이미 등록된 이름이에요');return;}
  try{
    await addDoc(collection(db,'mainCategories'),{name,icon,createdAt:serverTimestamp()});
    document.getElementById('mainCatName').value='';
    document.getElementById('mainCatIcon').value='';
  }catch(e){alert('저장 실패: '+e.message);}
};

window.delMainCategory=async function(id){
  if(!confirm('대분류를 삭제하시겠어요?'))return;
  try{await deleteDoc(doc(db,'mainCategories',id));}
  catch(e){alert('삭제 실패: '+e.message);}
};

window.addMember=async function(){
  const name=document.getElementById('memberName').value.trim();
  const icon=document.getElementById('memberIcon').value.trim()||'👤';
  if(!name){alert('구성원 이름을 입력해주세요');return;}
  if(members.find(m=>m.name===name)){alert('이미 등록된 이름이에요');return;}
  try{
    await addDoc(collection(db,'members'),{name,icon,createdAt:serverTimestamp()});
    document.getElementById('memberName').value='';
    document.getElementById('memberIcon').value='';
  }catch(e){alert('저장 실패: '+e.message);}
};

window.delMember=async function(id){
  if(!confirm('구성원을 삭제하시겠어요?'))return;
  try{await deleteDoc(doc(db,'members',id));}
  catch(e){alert('삭제 실패: '+e.message);}
};

function renderMainCatChips(){
  const el=document.getElementById('mainCatChips');
  if(!el)return;
  el.innerHTML=mainCategories.map(c=>`<div class="chip" onclick="openItemEditModal('mainCat','${c.id}')" style="cursor:pointer">${c.icon} ${c.name}<button class="chip-del" onclick="event.stopPropagation();delMainCategory('${c.id}')">×</button></div>`).join('')||'<span style="font-size:12px;color:var(--t2)">없음</span>';
  const sel=document.getElementById('catMainCat');
  if(sel) sel.innerHTML='<option value="">없음</option>'+mainCategories.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
}

function renderMemberChips(){
  const el=document.getElementById('memberChips');
  if(!el)return;
  el.innerHTML=members.map(m=>`<div class="chip" onclick="openItemEditModal('member','${m.id}')" style="cursor:pointer">${m.icon} ${m.name}<button class="chip-del" onclick="event.stopPropagation();delMember('${m.id}')">×</button></div>`).join('')||'<span style="font-size:12px;color:var(--t2)">없음</span>';
}

function updateMainCatSelects(){
  const opts='<option value="">전체</option>'+mainCategories.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  ['txMainCat','editMainCat'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const cur=el.value;
    el.innerHTML=opts;
    if(cur)el.value=cur;
  });
  renderMainCatChips();
}

function updateMemberSelects(){
  const opts='<option value="">선택 안 함</option>'+members.map(m=>`<option value="${m.name}">${m.icon} ${m.name}</option>`).join('');
  ['txMember','editMember'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const cur=el.value;
    el.innerHTML=opts;
    if(cur)el.value=cur;
  });
  renderMemberChips();
}

window.onMainCatChange=function(){
  updateCatSelects(document.getElementById('txMainCat').value);
};
window.onEditMainCatChange=function(){
  updateEditCatSelectFiltered(document.getElementById('editMainCat').value);
};


// ── 항목 수정 공통 모달 ──
const ITEM_EDIT_FIELDS = {
  mainCat: {
    title: '대분류 수정',
    fields: () => `
      <div class="form-row"><div class="field"><label>아이콘</label><input type="text" id="ief-icon" maxlength="2" placeholder="📁"/></div><div class="field"><label>이름</label><input type="text" id="ief-name" placeholder="이름"/></div></div>`
  },
  subCat: {
    title: '소분류 수정',
    fields: () => `
      <div class="form-row"><div class="field"><label>아이콘</label><input type="text" id="ief-icon" maxlength="2" placeholder="📌"/></div><div class="field"><label>이름</label><input type="text" id="ief-name" placeholder="이름"/></div></div>
      <div class="form-row">
        <div class="field"><label>종류</label><select id="ief-kind"><option value="expense">지출</option><option value="income">수입</option></select></div>
        <div class="field"><label>대분류</label><select id="ief-mainCat"><option value="">없음</option>${mainCategories.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('')}</select></div>
      </div>`
  },
  member: {
    title: '구성원 수정',
    fields: () => `
      <div class="form-row"><div class="field"><label>아이콘</label><input type="text" id="ief-icon" maxlength="2" placeholder="👤"/></div><div class="field"><label>이름</label><input type="text" id="ief-name" placeholder="이름"/></div></div>`
  },
  payment: {
    title: '결제수단 수정',
    fields: () => `
      <div class="form-row"><div class="field"><label>이름</label><input type="text" id="ief-name" placeholder="이름"/></div>
      <div class="field"><label>종류</label><select id="ief-payType"><option value="카드">카드</option><option value="현금">현금</option><option value="계좌이체">계좌이체</option><option value="간편결제">간편결제</option><option value="기타">기타</option></select></div></div>`
  },
  asset: {
    title: '자산 수정',
    fields: () => `
      <div class="form-row"><div class="field"><label>아이콘</label><input type="text" id="ief-icon" maxlength="2" placeholder="🏦"/></div><div class="field"><label>이름</label><input type="text" id="ief-name" placeholder="이름"/></div></div>
      <div class="form-row"><div class="field"><label>종류</label><select id="ief-assetType"><option value="bank">은행 통장</option><option value="cash">현금</option></select></div>
      <div class="field"><label>초기 잔액</label><input type="number" id="ief-initBalance" inputmode="numeric" placeholder="0"/></div></div>`
  }
};

window.openItemEditModal = function(type, id) {
  const cfg = ITEM_EDIT_FIELDS[type];
  if (!cfg) return;
  document.getElementById('itemEditTitle').textContent = cfg.title;
  document.getElementById('itemEditId').value = id;
  document.getElementById('itemEditType').value = type;
  document.getElementById('itemEditFields').innerHTML = cfg.fields();

  // 현재 값 채우기
  let item;
  if (type === 'mainCat') item = mainCategories.find(c => c.id === id);
  else if (type === 'subCat') item = categories.find(c => c.id === id);
  else if (type === 'member') item = members.find(m => m.id === id);
  else if (type === 'payment') item = payments.find(p => p.id === id);
  else if (type === 'asset') item = assets.find(a => a.id === id);

  if (!item) return;
  const nameEl = document.getElementById('ief-name');
  const iconEl = document.getElementById('ief-icon');
  if (nameEl) nameEl.value = item.name || '';
  if (iconEl) iconEl.value = item.icon || '';

  if (type === 'subCat') {
    const kindEl = document.getElementById('ief-kind');
    const mainCatEl = document.getElementById('ief-mainCat');
    if (kindEl) kindEl.value = item.kind || 'expense';
    if (mainCatEl) mainCatEl.value = item.mainCat || '';
  } else if (type === 'payment') {
    const ptEl = document.getElementById('ief-payType');
    if (ptEl) ptEl.value = item.type || '카드';
  } else if (type === 'asset') {
    const atEl = document.getElementById('ief-assetType');
    const balEl = document.getElementById('ief-initBalance');
    if (atEl) atEl.value = item.type || 'bank';
    if (balEl) balEl.value = item.initBalance || 0;
  }

  document.getElementById('itemEditModal').classList.add('open');
};

window.closeItemEditModal = function(e) {
  if (e && e.target !== document.getElementById('itemEditModal')) return;
  document.getElementById('itemEditModal').classList.remove('open');
};

window.saveItemEdit = async function() {
  const id = document.getElementById('itemEditId').value;
  const type = document.getElementById('itemEditType').value;
  const name = document.getElementById('ief-name')?.value.trim();
  const icon = document.getElementById('ief-icon')?.value.trim();

  if (!name) { alert('이름을 입력해주세요'); return; }

  let colName, data;
  if (type === 'mainCat') {
    colName = 'mainCategories'; data = {name, icon: icon||'📁'};
  } else if (type === 'subCat') {
    colName = 'categories';
    data = {name, icon: icon||'📌', kind: document.getElementById('ief-kind')?.value||'expense', mainCat: document.getElementById('ief-mainCat')?.value||''};
  } else if (type === 'member') {
    colName = 'members'; data = {name, icon: icon||'👤'};
  } else if (type === 'payment') {
    colName = 'payments'; data = {name, type: document.getElementById('ief-payType')?.value||'카드'};
  } else if (type === 'asset') {
    colName = 'assets';
    data = {name, icon: icon||'🏦', type: document.getElementById('ief-assetType')?.value||'bank', initBalance: parseInt(document.getElementById('ief-initBalance')?.value)||0};
  }

  if (!colName) return;
  setSyncing(true);
  try {
    await updateDoc(doc(db, colName, id), data);
    document.getElementById('itemEditModal').classList.remove('open');
  } catch(e) { alert('수정 실패: ' + e.message); setSyncing(false); }
};

window.saveKey=function(){const k=document.getElementById('keyInput').value.trim();if(!k)return;localStorage.setItem('gaebub_key',k);document.getElementById('keyInput').value='';document.getElementById('keyStatus').textContent='✅ API 키가 저장되었어요!';};
window.showVersionInfo=function(){if(confirm('가계부 v2.2.1\n빌드: 2026.03.28 09:25:13 (KST)\n\n캐시·쿠키를 초기화하시겠어요?')) clearCache();};
window.clearCache=async function(){try{if('serviceWorker' in navigator){const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();}if('caches' in window){const k=await caches.keys();for(const x of k)await caches.delete(x);}alert('✅ 캐시가 초기화되었어요!\n앱이 새로고침됩니다.');const sp=document.getElementById('splash')||document.createElement('div');
    if(!document.getElementById('splash')){sp.id='splash';sp.innerHTML='<div class="s-logo">💰</div><div class="s-title">가계부</div>';document.body.appendChild(sp);}
    sp.style.cssText='position:fixed;inset:0;background:#1D9E75;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:9999;opacity:1';setTimeout(()=>window.location.reload(true),300);}catch(e){alert('오류: '+e.message);}};

function refresh(){updateSummary();renderList();renderAssets();}


// ── 카카오톡 공유 수신 & 파싱 ──

window.pasteFromClipboard = async function() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) { alert('클립보드가 비어있어요.\n카카오뱅크 알림 메시지를 먼저 복사해주세요.'); return; }
    handleSharedText(text);
  } catch(e) {
    // 권한 거부 또는 실패시 수동 입력 안내
    const text = prompt('카카오뱅크 알림 메시지를 붙여넣어 주세요:');
    if (text) handleSharedText(text);
  }
};

function parseKakaoBank(text) {
  const result = {};
  const amtMatch = text.match(/([\d,]+)원 승인/);
  if (amtMatch) result.amount = parseInt(amtMatch[1].replace(/,/g, ''));
  const merchantMatch = text.match(/^(.+?)\s+[\d,]+원 승인/);
  if (merchantMatch) result.merchant = merchantMatch[1].trim();
  const dateMatch = text.match(/(\d{2})\/(\d{2})\s+\d{2}:\d{2}/);
  if (dateMatch) {
    const year = new Date().getFullYear();
    result.date = year + '-' + dateMatch[1] + '-' + dateMatch[2];
  }
  return result;
}

function handleSharedText(text) {
  if (!text) return;
  const parsed = parseKakaoBank(text);
  if (!parsed.amount) { alert('금액을 파싱할 수 없었어요.\n직접 입력해주세요.'); return; }
  const recordBtn = document.getElementById('bt-record');
  if (recordBtn) switchTab('record', recordBtn);
  setTimeout(() => {
    if (document.getElementById('txAmt')) document.getElementById('txAmt').value = parsed.amount;
    if (parsed.merchant && document.getElementById('txNote')) document.getElementById('txNote').value = parsed.merchant;
    if (parsed.date && document.getElementById('txDate')) document.getElementById('txDate').value = parsed.date;
    setType('expense');
    alert('📋 공유 내역 자동 입력!\n\n가맹점: ' + (parsed.merchant||'-') + '\n금액: ₩' + (parsed.amount||0).toLocaleString() + '\n날짜: ' + (parsed.date||'-') + '\n\n확인 후 추가하기를 눌러주세요.');
  }, 300);
}

function checkSharedContent() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get('shared_text');
  if (!sharedText) return;
  const url = new URL(window.location);
  url.searchParams.delete('shared_text');
  window.history.replaceState({}, '', url);
  if (currentUser) { handleSharedText(sharedText); }
  else { window._pendingSharedText = sharedText; }
}

function init(){


  document.getElementById('txDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('transferDate').value=new Date().toISOString().split('T')[0];if(localStorage.getItem('gaebub_key'))document.getElementById('keyStatus').textContent='✅ API 키가 설정되어 있어요.';refresh();}
document.getElementById('authPw').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth();});
