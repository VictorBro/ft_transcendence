/* Live issue state for the docs pages, from the public GitHub API.
   window.ghStatus resolves to {number: {s, a, t, pr, b}}:
     s  issue state, "open" or "closed"
     a  assignee logins
     t  issue title
     pr [number, author, "merged" | "open" | "closed"] of the PR that closes the issue
        (merged first, then open, then the newest), or null
     b  open issues blocking it (GitHub's issue dependencies), null if unknown
   A PR counts as linked when its body says "closes #N", "fixes #N" or "resolves #N",
   the same keywords GitHub uses for the Development panel.
   Unauthenticated calls are limited to 60 an hour, so the result is cached for
   five minutes and shared by all pages. It rejects when the API fails; pages
   then keep the snapshot they ship with. */
(function(){
  var REPO='VictorBro/ft_transcendence',API='https://api.github.com/repos/'+REPO;
  var KEY='ftt-gh-status-v2',TTL=5*60*1000;
  var CLOSES=/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;
  var RANK={merged:0,open:1,closed:2};

  async function getAll(path){
    var out=[];
    for(var page=1;page<=5;page++){
      var r=await fetch(API+path+'&per_page=100&page='+page,{headers:{accept:'application/vnd.github+json'}});
      if(!r.ok)throw new Error('GitHub API '+r.status);
      var d=await r.json();
      out=out.concat(d);
      if(d.length<100)break;
    }
    return out;
  }

  async function load(){
    try{
      var c=JSON.parse(localStorage.getItem(KEY));
      if(c&&Date.now()-c.t<TTL)return c.d;
    }catch(e){}
    var res=await Promise.all([getAll('/issues?state=all'),getAll('/pulls?state=all')]);
    var d={};
    res[0].forEach(function(g){
      if(g.pull_request)return;
      var dep=g.issue_dependencies_summary;
      d[g.number]={s:g.state,a:(g.assignees||[]).map(function(u){return u.login;}),t:g.title,pr:null,b:dep?dep.blocked_by:null};
    });
    res[1].forEach(function(p){
      var pr=[p.number,p.user?p.user.login:null,p.merged_at?'merged':p.state],seen={},m;
      CLOSES.lastIndex=0;
      while((m=CLOSES.exec(p.body||''))){
        var i=d[m[1]];
        if(!i||seen[m[1]])continue;
        seen[m[1]]=1;
        if(!i.pr||RANK[pr[2]]<RANK[i.pr[2]]||(RANK[pr[2]]===RANK[i.pr[2]]&&pr[0]>i.pr[0]))i.pr=pr;
      }
    });
    try{localStorage.setItem(KEY,JSON.stringify({t:Date.now(),d:d}));}catch(e){}
    return d;
  }

  window.ghStatus=load();
  window.ghStatus.catch(function(){});
})();
