var CACHE='daftar-v7';
var FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png'];

self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(FILES.map(function(f){return c.add(f).catch(function(){})}));
  }));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});

/* يعرض المخزن أولاً ويحدّث بالخلفية */
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET')return;
  var u=new URL(r.url);
  var ok=u.origin===location.origin||u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com';
  if(!ok)return;
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
    var net=fetch(r).then(function(res){
      if(res&&(res.ok||res.type==='opaque')){var cp=res.clone();caches.open(CACHE).then(function(c){c.put(r,cp)})}
      return res;
    }).catch(function(){return hit||caches.match('index.html')});
    return hit||net;
  }));
});

/* ---------- تنبيه موعد السداد بالخلفية (Periodic Background Sync) ---------- */
function openDB(){return new Promise(function(res,rej){
  var r=indexedDB.open('daftar',1);
  r.onupgradeneeded=function(){r.result.createObjectStore('kv')};
  r.onsuccess=function(){res(r.result)};
  r.onerror=function(){rej()};
})}
function getKV(db,k){return new Promise(function(res){
  try{var g=db.transaction('kv').objectStore('kv').get(k);g.onsuccess=function(){res(g.result)};g.onerror=function(){res()}}catch(e){res()}
})}
function putKV(db,k,v){return new Promise(function(res){
  try{var t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=function(){res()};t.onerror=function(){res()}}catch(e){res()}
})}

async function dueCheck(){
  var db=await openDB(),d=await getKV(db,'data');
  if(!d||!d.customers)return;
  var sent=(await getKV(db,'sentdue'))||{},now=Date.now(),L=[];
  d.customers.forEach(function(c){
    if(!c.due||now<c.due-12*36e5)return;
    var b={};
    (c.tx||[]).forEach(function(t){var k=t.cu||c.cu||d.cur||'ل.س';b[k]=(b[k]||0)+(t.type==='debt'?t.amt:-t.amt)});
    var owed=Object.keys(b).some(function(k){return b[k]>0.0001});
    if(owed&&sent[c.id]!==c.due&&c.dueSeen!==c.due){L.push(c);sent[c.id]=c.due}
  });
  if(!L.length)return;
  await putKV(db,'sentdue',sent);
  var body=L.slice(0,5).map(function(c){return c.name}).join('، ')+(L.length>5?' …':'');
  return self.registration.showNotification('حان موعد السداد',{body:body,icon:'icon-192.png',badge:'icon-192.png',tag:'daftar-due',dir:'rtl',lang:'ar'});
}

self.addEventListener('periodicsync',function(e){
  if(e.tag==='daftar-due')e.waitUntil(dueCheck().catch(function(){}));
});

self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){
    if(l.length)return l[0].focus();
    return clients.openWindow('./');
  }));
});
