// CodeLens Pro — main app script (single-file client-side)
// Features: upload/paste files, parse JS with Esprima, build Cytoscape graph,
// highlight complex functions, code viewer, dark mode, search, export JSON & PNG, complexity pie chart.

let cy; // cytoscape instance
let allFiles = []; // {name, text, lang}
let analyzedFiles = []; // analysis results
let deleteMode = false;
let deletedNodes = [];
const deleteBtn = document.getElementById('deleteBtn');
const restoreBtn = document.getElementById('restoreBtn');
const supportedJS = ['js','jsx','ts','tsx'];
deleteBtn.addEventListener('click', () => {
  deleteMode = !deleteMode;
  deleteBtn.textContent = deleteMode ? "❌ Click Node to Delete" : "🗑 Delete Node Mode";
});
restoreBtn.addEventListener('click', restoreDeletedNodes);

// DOM refs
const fileInput = document.getElementById('fileInput');
const pasteBtn = document.getElementById('pasteBtn');
const pasteModal = document.getElementById('pasteModal');
const pasteAdd = document.getElementById('pasteAdd');
const pasteCancel = document.getElementById('pasteCancel');
const pasteFilename = document.getElementById('pasteFilename');
const pasteText = document.getElementById('pasteText');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const exportJsonBtn = document.getElementById('exportJson');
const exportPNGBtn = document.getElementById('exportPNG');
const locThresholdInput = document.getElementById('locThreshold');
const depthThresholdInput = document.getElementById('depthThreshold');
const detailsBox = document.getElementById('details');
const fileSelect = document.getElementById('fileSelect');
const codeViewer = document.getElementById('codeViewer');
const downloadCodeBtn = document.getElementById('downloadCode');
const copyCodeBtn = document.getElementById('copyCode');
const filesCount = document.getElementById('filesCount');
const functionsCount = document.getElementById('functionsCount');
const avgComplexity = document.getElementById('avgComplexity');
const searchInput = document.getElementById('searchInput');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const themeToggle = document.getElementById('themeToggle');
const pieCtx = document.getElementById('pieChart').getContext('2d');

let pieChart = null;

// init 
(function init() {
  // theme
  const theme = localStorage.getItem('codelens:theme') || 'dark';
  if (theme === 'light') document.body.classList.add('light-theme'), themeToggle.checked = true;
  themeToggle.addEventListener('change', toggleTheme);

  // file input
  fileInput.addEventListener('change', handleFileUpload);
  pasteBtn.addEventListener('click', () => pasteModal.style.display = 'flex');
  pasteCancel.addEventListener('click', () => pasteModal.style.display = 'none');
  pasteAdd.addEventListener('click', addPasted);
  analyzeBtn.addEventListener('click', analyzeAndRender);
  clearBtn.addEventListener('click', clearAll);
  exportJsonBtn.addEventListener('click', exportJSON);
  exportPNGBtn.addEventListener('click', exportPNG);
  fileSelect.addEventListener('change', selectFileToView);
  downloadCodeBtn.addEventListener('click', downloadCurrentCode);
  copyCodeBtn.addEventListener('click', copyCurrentCode);
  searchInput.addEventListener('input', applySearchFilter);

  // initial cytoscape container skeleton
  renderEmptyGraph();
  updateStats();
})();

// ---------- file handling ----------
function handleFileUpload(e){
  const files = Array.from(e.target.files);
  const reads = files.map(f => readFileAsync(f));
  Promise.all(reads).then(arr => {
    allFiles.push(...arr);
    titleEl.textContent = `Project: ${allFiles.length} file(s)`;
    subtitleEl.textContent = `Ready to analyze — ${allFiles.length} file(s) loaded`;
    populateFileSelect();
    updateStats();
    analyzeAndRender();
  });
  fileInput.value = '';
}

function readFileAsync(file){
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => {
      const name = file.name;
      const ext = (name.split('.').pop()||'').toLowerCase();
      res({ name, text: r.result, lang: ext });
    };
    r.readAsText(file);
  });
}

function addPasted(){
  const name = (pasteFilename.value||'pasted.js').trim();
  const text = pasteText.value || '';
  if (!text.trim()) { alert('Paste some code'); return; }
  const ext = (name.split('.').pop()||'js').toLowerCase();
  allFiles.push({ name, text, lang: ext });
  pasteFilename.value = ''; pasteText.value = ''; pasteModal.style.display = 'none';
  populateFileSelect();
  updateStats();
  analyzeAndRender();
}

// ---------- analysis ----------
function analyzeAndRender(){
  const locThreshold = parseInt(locThresholdInput.value)||40;
  const depthThreshold = parseInt(depthThresholdInput.value)||3;

  analyzedFiles = allFiles.map(f => analyzeFile(f));
  // build graph
  const graph = buildGraph(analyzedFiles, locThreshold, depthThreshold);
  renderGraph(graph);
  updateStatsAndUI(analyzedFiles);
  updatePieChart(analyzedFiles);
}

function analyzeFile(file){
  const ext = file.lang;
  if (supportedJS.includes(ext)){
    return analyzeJS(file.name, file.text);
  } else {
    // fallback simple analysis
    const loc = file.text.split('\n').filter(l=>l.trim()).length;
    return { name: file.name, imports: [], calls: [], functions: [{name:'<file>', loc, depth:0, range:[0, file.text.length]}], raw:file.text };
  }
}

// JS analysis (Esprima)
function analyzeJS(name, text){
  try {
    const ast = esprima.parseModule(text, { range: true, tolerant: true });
    const imports = [];
    const calls = [];
    const functions = [];

    // simple traverse
    (function traverse(node, parent){
      if (!node) return;
      if (node.type === 'ImportDeclaration' && node.source && node.source.value) imports.push(node.source.value);
      if (node.type === 'CallExpression'){
        if (node.callee){
          if (node.callee.name) calls.push(node.callee.name);
          if (node.callee.type === 'MemberExpression' && node.callee.property && node.callee.property.name) calls.push(node.callee.property.name);
        }
      }
      if (['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','MethodDefinition'].includes(node.type)){
        // name
        let fname = 'anonymous';
        if (node.id && node.id.name) fname = node.id.name;
        else if (node.type === 'MethodDefinition' && node.key && node.key.name) fname = node.key.name;
        // LOC
        const range = node.range || [0,0];
        const snippet = text.slice(range[0], range[1]||range[1]);
        const loc = snippet.split('\n').filter(l => l.trim()).length;
        // depth
        const depth = computeNestingDepth(node);
        functions.push({ name: fname, loc, depth, range });
      }

      for (const k in node){
        const child = node[k];
        if (Array.isArray(child)) child.forEach(c => { if (c && typeof c.type === 'string') traverse(c, node); });
        else if (child && typeof child.type === 'string') traverse(child, node);
      }
    })(ast, null);

    return { name, imports, calls, functions, raw:text };
  } catch (err) {
    console.error("Error parsing file:", name, err);
    // parsing failed -> fallback
    const loc = text.split('\n').filter(l=>l.trim()).length;
    return { name, imports: [], calls: [], functions: [{name:'<file>', loc, depth:0, range:[0,text.length]}], raw:text };
  }
}

// compute nesting depth heuristically
function computeNestingDepth(node){
  let maxDepth = 0;
  function walker(n, depth){
    if (!n || typeof n !== 'object') return;
    if (['IfStatement','ForStatement','WhileStatement','SwitchStatement','ForInStatement','ForOfStatement','DoWhileStatement'].includes(n.type)){
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
    for (const k in n){
      const child = n[k];
      if (Array.isArray(child)) child.forEach(c => walker(c, depth));
      else if (child && typeof child === 'object') walker(child, depth);
    }
  }
  walker(node, 0);
  return maxDepth;
}

// ---------- graph builder ----------
function buildGraph(files, locThreshold, depthThreshold){
  const nodes = [];
  const edges = [];
  const fileMap = {};
  files.forEach(f => fileMap[f.name] = f);

  // file nodes
  files.forEach((f, fi) => {
    nodes.push({ data:{ id:`file:${f.name}`, label:f.name, type:'file' }});
    f.functions.forEach((fn, i) => {
      const id = `fn:${f.name}:${i}`;
      const complexityScore = fn.loc * (fn.depth + 1);
      const isComplex = fn.loc >= locThreshold || fn.depth >= depthThreshold;
      const color = isComplex ? '#ef4444' : (fn.loc >= (locThreshold*0.75) ? '#f59e0b' : '#10b981');
      nodes.push({ data:{ id, label:`${fn.name}\n(LOC:${fn.loc},D:${fn.depth})`, file:f.name, fnIndex:i, color, complexityScore, type:'function' }});
      edges.push({ data:{ id:`edge:${f.name}:${id}`, source:`file:${f.name}`, target:id }});
    });
  });

  // import edges (file->file)
  files.forEach(f => {
    (f.imports||[]).forEach(im => {
      // try match by file name ending or exact
      const target = Object.keys(fileMap).find(k => k === im || k.endsWith(im) || k.includes(im));
      if (target) edges.push({ data:{ id:`imp:${f.name}:${target}`, source:`file:${f.name}`, target:`file:${target}` }});
    });
  });

  // call edges (best-effort: match by function name)
  const nameToFnNodes = {};
  nodes.forEach(n => {
    if (n.data.type === 'function'){
      const shortName = n.data.label.split('\n')[0];
      if (!nameToFnNodes[shortName]) nameToFnNodes[shortName]=[];
      nameToFnNodes[shortName].push(n.data.id);
    }
  });

  files.forEach(f => {
    (f.calls||[]).forEach(callName => {
      const targets = nameToFnNodes[callName]||[];
      targets.forEach(tid => edges.push({ data:{ id:`call:${f.name}:${tid}`, source:`file:${f.name}`, target:tid } }));
    });
  });

  return { nodes, edges };
}

// ---------- render cytoscape ----------
function renderEmptyGraph(){
  if (cy) cy.destroy();
  cy = cytoscape({
    container: document.getElementById('graph-container'),
    elements: [],
    style: [
      { selector:'node', style:{ 'label':'data(label)', 'text-wrap':'wrap', 'text-valign':'center','text-halign':'center','background-color':'#334155','color':'#fff','font-size':10,'width': 'data(size)','height':'data(size)'}},
      { selector:'edge', style:{ 'width':2,'line-color':'#94a3b8','target-arrow-shape':'triangle','target-arrow-color':'#94a3b8','curve-style':'bezier' }}
    ],
    layout:{ name:'grid' }
  });
  cy.on('tap','node', onNodeClick);
}

function renderGraph(graph){
  if (cy) cy.destroy();
  cy = cytoscape({
    container: document.getElementById('graph-container'),
    elements: [...graph.nodes.map(n=>({group:'nodes', data:n.data})), ...graph.edges.map(e=>({group:'edges', data:e.data}))],
    style: [
      { selector:'node[type="file"]', style:{ 'background-color':'#2563eb','label':'data(label)','shape':'roundrectangle','width':150,'height':50,'text-wrap':'ellipsis','font-size':11,'color':'#fff' } },
      { selector:'node[type="function"]', style:{ 'background-color':'data(color)','label':'data(label)','shape':'ellipse','width':80,'height':40,'font-size':10,'color':'#fff', 'text-wrap': 'wrap', 'text-valign': 'center' } },
      { selector:'edge', style:{ 'width':2,'line-color':'#94a3b8','target-arrow-shape':'triangle','target-arrow-color':'#94a3b8','curve-style':'bezier' } }
    ],
    layout:{ name:'cose', animate:true, idealEdgeLength:100, nodeOverlap:20 }
  });
  cy.on('tap','node', onNodeClick);
  cy.on('cxttap', (evt)=>{ evt.preventDefault(); });
  // enable panning & zoom
  cy.userPanningEnabled(true);
  cy.userZoomingEnabled(true);
}

// node click behavior
function onNodeClick(evt){
  const node = evt.target;
  const d = node.data();
  if (!d) return;

  if (deleteMode) {
    const edges = node.connectedEdges();
    deletedNodes.push(...edges.jsons());
    deletedNodes.push(node.json());
    cy.remove(node);
    updateDeletedList();
    return;
  }

  if (d.type === 'file'){
    const file = analyzedFiles.find(f=>f.name === d.label || `file:${f.name}` === evt.target.id());
    showFileDetails(file || analyzedFiles.find(f=>`file:${f.name}`===evt.target.id()));
  } else if (d.type === 'function'){
    const file = analyzedFiles.find(f=>f.name === d.file);
    const fn = file && file.functions[d.fnIndex];
    showFunctionDetails(file, fn, d);
  } else {
    detailsBox.textContent = JSON.stringify(d, null, 2);
  }
}

// ---------- UI details ----------
function showFileDetails(file){
  if (!file) { detailsBox.textContent = 'File not found'; return; }
  detailsBox.textContent = `File: ${file.name}\nFunctions: ${file.functions.length}\nImports: ${(file.imports||[]).join(', ') || '-'}\n\nFunctions:\n` +
    file.functions.map((fn,i)=>`  ${i}. ${fn.name} — LOC:${fn.loc}, Depth:${fn.depth}`).join('\n');
  selectFileInViewer(file.name);
}

function showFunctionDetails(file, fn, d){
  detailsBox.textContent = `File: ${file.name}\nFunction: ${fn.name}\nLOC: ${fn.loc}\nDepth: ${fn.depth}\nComplexityScore: ${d.complexityScore || (fn.loc*(fn.depth+1))}`;
  selectFileInViewer(file.name, fn.range);
}

// ---------- file viewer ----------
function populateFileSelect(){
  fileSelect.innerHTML = '';
  allFiles.forEach(f => {
    const opt = document.createElement('option'); opt.value = f.name; opt.textContent = f.name;
    fileSelect.appendChild(opt);
  });
  if (allFiles.length) {
    fileSelect.value = allFiles[0].name;
    selectFileToView();
  } else {
    codeViewer.textContent = 'No file selected';
  }
}

function selectFileToView(){
  const name = fileSelect.value;
  selectFileInViewer(name);
}

function selectFileInViewer(name, range){
  const f = allFiles.find(x=>x.name===name);
  if (!f) { codeViewer.textContent = 'File not found'; return; }
  codeViewer.textContent = f.text;
  // scroll to range if provided
  if (range && range[0] !== undefined){
    // naive: find start snippet line index
    const prefix = f.text.slice(0, range[0]);
    const startLine = prefix.split('\n').length - 1;
    // attempt to scroll the pre element
    const lines = codeViewer.textContent.split('\n');
    const snippet = lines.slice(Math.max(0,startLine-2), startLine+10).join('\n');
    codeViewer.textContent = f.text; // keep full
    // Can't programmatically set scrollTop by line reliably without rendering; set selection
    // We'll set a visible marker by selecting the snippet
    // For simplicity, set selection range using browser APIs:
    try {
      const rangeSel = document.createRange();
      const pre = codeViewer;
      rangeSel.selectNodeContents(pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rangeSel);
      // then collapse to start (so user's attention in viewer)
      sel.collapseToStart();
    } catch(e){}
  }
}

// download/copy code
function downloadCurrentCode(){
  const name = fileSelect.value;
  const f = allFiles.find(x=>x.name===name);
  if (!f) return alert('No file selected');
  const blob = new Blob([f.text], {type:'text/plain;charset=utf-8'});
  saveAs(blob, f.name);
}
function copyCurrentCode(){
  const text = codeViewer.textContent;
  navigator.clipboard.writeText(text).then(()=>alert('Copied to clipboard'));
}

// ---------- stats, chart, export ----------
function updateStatsAndUI(files){
  const totalFiles = files.length;
  const totalFns = files.reduce((s,f)=>s + (f.functions?f.functions.length:0), 0);
  const avgComplex = files.reduce((s,f)=> s + (f.functions? f.functions.reduce((a,fn)=>a + (fn.depth + fn.loc/100),0):0), 0) / (totalFns || 1);
  filesCount.textContent = totalFiles;
  functionsCount.textContent = totalFns;
  avgComplexity.textContent = avgComplex.toFixed(2);
  subtitleEl.textContent = `Analyzed ${totalFiles} file(s), ${totalFns} function(s)`;
  populateFileSelect();
}

function updateStats(){ updateStatsAndUI(analyzedFiles); }

function updatePieChart(files){
  // classify functions by complexity
  let simple=0, medium=0, complex=0;
  const locT = parseInt(locThresholdInput.value)||40;
  const depthT = parseInt(depthThresholdInput.value)||3;
  files.forEach(f => {
    (f.functions||[]).forEach(fn => {
      if (fn.loc >= locT || fn.depth >= depthT) complex++;
      else if (fn.loc >= Math.max(10, Math.floor(locT*0.6)) || fn.depth >= Math.max(1, Math.floor(depthT*0.6))) medium++;
      else simple++;
    });
  });

  const data = [simple, medium, complex];
  if (!pieChart){
    pieChart = new Chart(pieCtx, {
      type:'pie',
      data:{
        labels:['Simple','Medium','Complex'],
        datasets:[{ data, backgroundColor:['#10b981','#f59e0b','#ef4444'] }]
      },
      options:{ plugins:{ legend:{ position:'bottom'} } }
    });
  } else {
    pieChart.data.datasets[0].data = data;
    pieChart.update();
  }
}

function exportJSON(){
  const out = { files: analyzedFiles, meta:{ generatedAt: new Date().toISOString() } };
  const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json;charset=utf-8'});
  saveAs(blob, 'codelens-analysis.json');
}

function exportPNG(){
  if (!cy) return alert('Graph not ready');
  const png64 = cy.png({ full: true, scale: 2 });
  // convert dataURL to blob
  fetch(png64).then(res=>res.blob()).then(blob => saveAs(blob, 'graph.png'));
}

// ---------- utility: clear ----------
function clearAll(){
  allFiles = []; analyzedFiles = [];
  renderEmptyGraph();
  populateFileSelect();
  updateStatsAndUI(analyzedFiles);
  detailsBox.textContent = 'Cleared';
  if (pieChart){ pieChart.destroy(); pieChart = null; }
  titleEl.textContent = 'Project: —';
  subtitleEl.textContent = 'Upload files to begin analysis';
}

function restoreDeletedNodes() {
  if (!cy || deletedNodes.length === 0) {
    alert("No nodes to restore.");
    return;
  }
  cy.add(deletedNodes);
  deletedNodes = [];
  updateDeletedList();
}

function updateDeletedList() {
  const deletedList = document.getElementById('deletedList');
  deletedList.innerHTML = '';
  const nodeNames = deletedNodes.filter(n => n.group === 'nodes').map(n => n.data.label.split('\n')[0]);
  nodeNames.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    deletedList.appendChild(li);
  });
}

// ---------- search filter ----------
function applySearchFilter(){
  const q = (searchInput.value||'').toLowerCase().trim();
  if (!cy) return;
  cy.nodes().filter(n => {
    const lab = (n.data('label')||'').toString().toLowerCase();
    const keep = !q || lab.includes(q);
    n.style('display', keep ? 'element' : 'none');
    return keep;
  });
  cy.edges().forEach(e => {
    const sVis = e.source().visible() && e.target().visible();
    e.style('display', sVis ? 'element' : 'none');
  });
}

// ---------- theme ----------
function toggleTheme(){
  if (themeToggle.checked){
    document.body.classList.add('light-theme');
    localStorage.setItem('codelens:theme','light');
  } else {
    document.body.classList.remove('light-theme');
    localStorage.setItem('codelens:theme','dark');
  }
}
