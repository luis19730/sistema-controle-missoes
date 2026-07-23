// ============ FIREBASE SYNC ============

let firebaseApp = null;
let firebaseDb = null;
let syncStatus = 'idle';
let syncLastSave = null;
let syncError = '';
let firebaseConfig = null;
let listenersAttached = false;

function syncLog(msg, isError) {
    var el = document.getElementById('syncLog');
    if (el) {
        el.style.display = isError ? 'block' : el.style.display;
        if (isError) {
            el.style.display = 'block';
            var line = document.createElement('div');
            line.style.color = '#f44';
            line.textContent = new Date().toLocaleTimeString('pt-BR') + ' - ' + msg;
            el.appendChild(line);
            el.scrollTop = el.scrollHeight;
            while (el.children.length > 10) el.removeChild(el.firstChild);
            setTimeout(function() { el.style.display = 'none'; }, 15000);
        }
    }
    if (isError) console.error('[SYNC] ' + msg); else console.log('[SYNC] ' + msg);
}

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyB2FGHNE4uMZncqIQpKmrwnGeWcRgGPdGU",
    authDomain: "bda-controle-missoes.firebaseapp.com",
    databaseURL: "https://bda-controle-missoes-default-rtdb.firebaseio.com",
    projectId: "bda-controle-missoes",
    storageBucket: "bda-controle-missoes.firebasestorage.app",
    messagingSenderId: "968392432514",
    appId: "1:968392432514:web:ca0aeb30739c085e994d9b"
};

function loadFirebaseConfig() {
    try {
        const raw = localStorage.getItem('firebase_config');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.projectId) return parsed;
        }
    } catch (e) {}
    return DEFAULT_FIREBASE_CONFIG;
}

function saveFirebaseConfig(config) {
    localStorage.setItem('firebase_config', JSON.stringify(config));
}

function clearFirebaseConfig() {
    localStorage.removeItem('firebase_config');
    firebaseApp = null;
    firebaseDb = null;
    listenersAttached = false;
}

function initFirebase() {
    firebaseConfig = loadFirebaseConfig();
    if (!firebaseConfig || !firebaseConfig.projectId) {
        firebaseConfig = DEFAULT_FIREBASE_CONFIG;
    }
    try {
        if (!firebaseApp) {
            syncLog('Init Firebase: ' + firebaseConfig.projectId + ' / ' + firebaseConfig.databaseURL);
            firebaseApp = firebase.initializeApp(firebaseConfig);
        }
        firebaseDb = firebase.database();
        syncLog('Firebase DB ready, ref: ' + firebaseDb.ref().toString());
        return true;
    } catch (e) {
        syncLog('initFirebase FAILED: ' + e.message, true);
        syncStatus = 'error';
        syncError = e.message;
        updateSyncUI();
        return false;
    }
}

function updateSyncUI() {
    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    const cfgBtn = document.getElementById('btnSyncConfig');
    if (!dot || !label) return;

    dot.className = 'sync-dot';
    if (!firebaseConfig || !firebaseConfig.projectId) {
        dot.classList.add('sync-off');
        label.textContent = 'Sync: não configurado';
        if (cfgBtn) cfgBtn.style.display = '';
        return;
    }

    if (cfgBtn) cfgBtn.style.display = 'none';

    switch (syncStatus) {
        case 'idle':
            dot.classList.add('sync-ok');
            label.textContent = syncLastSave ? 'Sync: ok (' + syncLastSave + ')' : 'Sync: conectado';
            label.title = syncError || '';
            break;
        case 'loading':
            dot.classList.add('sync-loading');
            label.textContent = 'Sync: carregando...';
            break;
        case 'saving':
            dot.classList.add('sync-loading');
            label.textContent = 'Sync: salvando...';
            break;
        case 'error':
            dot.classList.add('sync-error');
            label.textContent = 'Sync: erro - ' + (syncError || 'verifique a config');
            label.title = syncError || '';
            break;
    }
}

var REST_URL = 'https://bda-controle-missoes-default-rtdb.firebaseio.com/bda_data.json';

function syncSave(payload) {
    if (!firebaseDb) {
        initFirebase();
    }
    syncStatus = 'saving';
    updateSyncUI();
    if (firebaseDb) {
        try {
            var ref = firebaseDb.ref('bda_data');
            ref.set(payload).then(function() {
                syncLastSave = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                syncStatus = 'idle';
                syncError = '';
                updateSyncUI();
            }).catch(function(e) {
                syncLog('SDK save failed, trying REST: ' + e.message, true);
                fetch(REST_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                    .then(function() { syncStatus = 'idle'; syncError = ''; updateSyncUI(); })
                    .catch(function(e2) { syncStatus = 'error'; syncError = e2.message; updateSyncUI(); });
            });
        } catch(e) {
            syncStatus = 'error';
            syncError = e.message;
            updateSyncUI();
        }
    } else {
        fetch(REST_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function() { syncStatus = 'idle'; syncError = ''; updateSyncUI(); })
            .catch(function(e) { syncStatus = 'error'; syncError = e.message; updateSyncUI(); });
    }
}

function syncLoad() {
    if (!firebaseDb) return Promise.resolve(null);
    syncStatus = 'loading';
    updateSyncUI();
    return firebaseDb.ref('bda_data').once('value').then(function(snap) {
        syncStatus = 'idle';
        syncError = '';
        updateSyncUI();
        var val = snap.val();
        syncLog('Load OK, missions: ' + (val && val.missions ? val.missions.length : 0));
        return val;
    }).catch(function(e) {
        syncLog('Load FAILED: ' + e.message, true);
        syncStatus = 'error';
        syncError = e.message;
        updateSyncUI();
        return null;
    });
}

function syncListen(callback) {
    if (!firebaseDb) return;
    syncLog('Attaching listener...');
    firebaseDb.ref('bda_data').on('value', function(snap) {
        var data = snap.val();
        syncLog('Listener fired, hasData: ' + !!data + ', missions: ' + (data && data.missions ? data.missions.length : 0));
        if (data) {
            callback(data);
        }
    }, function(error) {
        syncLog('Listener ERROR: ' + error.message, true);
        syncStatus = 'error';
        syncError = error.message;
        listenersAttached = false;
        updateSyncUI();
    });
    listenersAttached = true;
}

function openSyncConfig() {
    const cfg = loadFirebaseConfig();
    document.getElementById('fbApiKey').value = cfg ? cfg.apiKey || '' : '';
    document.getElementById('fbProjectId').value = cfg ? cfg.projectId || '' : '';
    document.getElementById('fbDatabaseUrl').value = cfg ? cfg.databaseURL || '' : '';
    document.getElementById('modalSyncOverlay').classList.add('active');
}

function closeSyncConfig() {
    document.getElementById('modalSyncOverlay').classList.remove('active');
}

function saveSyncConfig() {
    const config = {
        apiKey: document.getElementById('fbApiKey').value.trim(),
        projectId: document.getElementById('fbProjectId').value.trim(),
        databaseURL: document.getElementById('fbDatabaseUrl').value.trim(),
        authDomain: document.getElementById('fbProjectId').value.trim() + '.firebaseapp.com',
        storageBucket: document.getElementById('fbProjectId').value.trim() + '.appspot.com'
    };
    if (!config.apiKey || !config.projectId || !config.databaseURL) {
        alert('Preencha todos os campos.');
        return;
    }
    saveFirebaseConfig(config);
    closeSyncConfig();
    clearFirebaseConfig();
    if (initFirebase()) {
        syncLoad().then(remote => {
            if (remote && remote.missions) {
                if (confirm('Dados encontrados no Firebase. Deseja carregá-los (substitui dados locais)?')) {
                    missions = remote.missions;
                    docs = remote.docs || [];
                    if (remote.contatos && remote.contatos.length) {
                        contatos = remote.contatos;
                        localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos));
                    }
                    localStorage.setItem('bdaMissions', JSON.stringify(missions));
                    localStorage.setItem('bdaDocs', JSON.stringify(docs));
                    render();
                    renderDocs();
                }
            }
            syncListen(onRemoteUpdate);
        });
    }
    updateSyncUI();
}

function onRemoteUpdate(data) {
    if (!data || !data.missions) {
        syncLog('onRemoteUpdate: no data or no missions, skipping');
        return;
    }
    missions = data.missions;
    docs = data.docs || [];
    if (data.contatos && data.contatos.length) {
        contatos = data.contatos;
        localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos));
    }
    localStorage.setItem('bdaMissions', JSON.stringify(missions));
    localStorage.setItem('bdaDocs', JSON.stringify(docs));
    if (data.savedAt) localStorage.setItem('bdaMissions_savedAt', JSON.stringify(data.savedAt));
    render();
    renderDocs();
    if (typeof renderDashboard === 'function') renderDashboard();
    refreshWhatsApp();
}

function disableSync() {
    clearFirebaseConfig();
    updateSyncUI();
}

function normalizarData(str) {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T00:00:00');
    const meses = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
    const m = str.match(/(\d{1,2})\s*([a-z]{3})\.?\s*(\d{2,4})/i);
    if (m) {
        const dia = parseInt(m[1]);
        const mes = meses[m[2].toLowerCase()];
        let ano = parseInt(m[3]);
        if (ano < 100) ano += 2000;
        if (mes !== undefined) return new Date(ano, mes, dia);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

// MISSIONS_DATA will be loaded from missions_data.js if available
let INITIAL_DATA = [
    { id: "8891-E-4/EMG/Cmdo Bda Inf Amv", event: "Andamento dos Subprojetos da 4ª Seção - Brigada de Infantaria Amv 2040", deadline: "2025-10-31", responsible: "Maj Filipe", status: "ACOMPANHAR", class: "-", lastUpdate: "", notes: "1. apresentação com 01 (um) slide que resuma as principais ações de suas respectivas equipes em prol do desenvolvimento dos subprojetos demateriais e logística da Bda Inf Amv", omds: "", escSup: "" },
    { id: "25540-Escalão Logístico/2ªRM", event: "Classe II: retificação da nomenclatura da 'Mochila de Assalto' (Especificação Técnic nº62/2020) para 'Bornal de Assalto' - 2ª RM", deadline: "2025-12-22", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl II", lastUpdate: "", notes: "2. Doc saiu para TODAS OMDS. Não precisava!!", omds: "11352-E-4/EMG/Cmdo Bda Inf Amv (22 Dez)", escSup: "-" },
    { id: "24794-Escalão Logístico/2ªRM", event: "Classe VIII - Saúde: regularização do estoque (SISCOFIS)", deadline: "2026-01-10", responsible: "ST Valter", status: "RESOLVIDO", class: "Cl VIII - Sau", lastUpdate: "", notes: "CONTROLE:\n- Ba Adm - FALTA\n- 2º BI Amv - FALTA\n- 5º BI Amv - 137-S4/5º BIL\n- 6º BI Amv - Não possui estoque - Base Adm\n- 20º GAC Amv\n- 22º B Log Amv\n- 1º Esqd C Amv\n- 5ª Bia AAAe Amv\n- 2ª Cia Prec\n- 12ª Cia Com Amv\n- 12ª Cia Eng\n- 12º Pel PE", omds: "10935-E-4/EMG/Cmdo Bda Inf Amv", escSup: "333-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "25-COL/22º B Log Amv", event: "Classe I - Rç Op recebida com data de validade próxima", deadline: "2026-01-14", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. 22º B Log Distr todas as Rç por ocasião do APRONAL I.", omds: "-", escSup: "-" },
    { id: "878-Escalão Logístico/2ªRM", event: "Classe III - Inclusão e atualização de perfil de usuários do SCA (013-26)", deadline: "2026-01-16", responsible: "ST Richardson", status: "ACOMPANHAR", class: "Cl III - Comb", lastUpdate: "", notes: "1. Confeccionar Doc às OM\n2. Aguardando novos integrantes da 4ª Seção para Pub em BI", omds: "334-E-4/EMG/Cmdo Bda Inf Amv", escSup: "" },
    { id: "54-S/4/CMDO", event: "necessidade de combustível para a realização do Estágio de Motorista Militar", deadline: "2026-01-22", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. A OMDS deverá consumir sua Cota de Comb Adm.", omds: "-", escSup: "-" },
    { id: "202-E4/2ª DE", event: "classe II: orientações a respeito da distribuição de capacetes modelo ACH", deadline: "2026-01-22", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl II", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "705-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "-", event: "DIEx sobre necessidade de Cl II (colchão, beliche e armário)", deadline: "2026-01-22", responsible: "ST Richardson", status: "ACOMPANHAR", class: "Cl II", lastUpdate: "", notes: "Consolidar as demandas em DIEx e encaminhar à 2ª RM", omds: "", escSup: "" },
    { id: "317-Fin/CCOp/Cmdo CMO", event: "recursos necessários para Op PERSEU 2026", deadline: "2026-01-23", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Verificado necessidade de HV para Op Perseu - E3 e E5.", omds: "-", escSup: "565-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "-", event: "Sol 800 l OD para 5º BI Amv (Ambulância) e remanejamento de cota UU", deadline: "2026-01-25", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Sol remanejamento de Comb ao 5º BI Amv.", omds: "-", escSup: "520-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "308-S2/6° BI Amv", event: "Início do pedido de cadastramento de veículos para estacionamento no Forte Ipiranga 2026", deadline: "2026-01-25", responsible: "", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "", omds: "-", escSup: "-" },
    { id: "197-Escalão Logístico/2ªRM", event: "capacidade de fabricação e/ou manutenção de materiais Cl II pelas OM logísticas", deadline: "2026-01-25", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl II", lastUpdate: "", notes: "capacidade de fabricação e/ou manutenção de materiais Cl II pelas OM logísticas\n- Doc já direcionado ao 22º B Log", omds: "-", escSup: "-" },
    { id: "107-SGT/Div Op/3º CTA", event: "Visita de Orientação Técnica (VOT) Emergencial às OM da 12ª Bda Inf Amv", deadline: "2026-01-27", responsible: "Maj Filipe", status: "RESOLVIDO", class: "VISITAS", lastUpdate: "", notes: "1. Verificar com a Cia Cmdo sobre o Alojamento - OK.\n2. Doc de resposta Confeccionado.", omds: "459-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "MISSÃO Cmt Bda", event: "Verificar situação de mobiliario doado pela Receita federal", deadline: "2026-01-27", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Patrimônio", lastUpdate: "", notes: "1. As Info estão no DIEx nº 7730-Fisc Adm/Div Adm/Base Adm Amv.\n2. Verificar com o Fiscal como está essa situação - OK\n3. Missão ficou com a Base Adm.", omds: "-", escSup: "3. Missão ficou com a Base Adm." },
    { id: "386-S4/6° BI Amv", event: "alterações do recebimento de material classe II - Fardamento (INFORMAÇÃO)", deadline: "2026-01-27", responsible: "ST Valter", status: "ACOMPANHAR", class: "Cl II", lastUpdate: "", notes: "", omds: "", escSup: "" },
    { id: "1383-Escalão Logístico/2ªRM", event: "apoio para estacionamento, alojamento e alimentação Op Log Trnp Eixo Amazônico 1º semestre", deadline: "2026-01-28", responsible: "ST Valter", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. O 22º B Log Amv irá Ap.", omds: "563-E-4/EMG/Cmdo Bda Inf Amv", escSup: "563-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "-", event: "PASSAGEM DE CMDO AMAN", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. Sol uma Van para Dslc de pessoal do QG.", omds: "296-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "-", event: "Verificar com a 5ª Bia AAAe o que a falta do radar implica na operacionalidade", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "MEM", lastUpdate: "", notes: "1. Radar em Mnt na EMBRAER.", omds: "-", escSup: "-" },
    { id: "-", event: "Verificar com as OMDS MEM que afetam a operacionalidade", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "MEM", lastUpdate: "", notes: "1. Consolidado de forma parcial na apresentação ao Cmt 2ª DE.", omds: "-", escSup: "-" },
    { id: "246-E4/2ª DE", event: "Necessidade de munição de salva para o ano de 2026", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl V", lastUpdate: "", notes: "1. Verificado com o 20º GAC Amv apenas 2 eventos.", omds: "-", escSup: "652-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "655-Escalão Logístico/2ªRM", event: "PASA - Dados de aprovisionadores e auditores", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Enviem os dados dos auditores PASA e aprovisionadores.\n2. Confeccionado Doc para as OMDS.", omds: "260-E-4/EMG/Cmdo Bda Inf Amv", escSup: "650-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "501-E-4/EMG/Cmdo Bda Inf Amv", event: "Contato no COTER para ver recursos e Comb do APRONAL I e FT Jacaré", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Cel Giuvenduto conseguiu contato no COTER e CMSE.\n2. Aguardando a 2ª DE enviar Doc para CMSE\n3. Recebido o Comb.", omds: "501-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1669-Escalão Logístico/2ªRM" },
    { id: "1900-Escalão Logístico/2ªRM", event: "Obter Foto do Pav Mnt Cia Cmdo para fazer o photoshop", deadline: "2026-01-28", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Patrimônio", lastUpdate: "", notes: "-", omds: "-", escSup: "-" },
    { id: "112-Cmdo Bda Inf Amv/Bda Inf Amv", event: "Pronto das apresentações para a 1ª Reunião de Comando da Bda Inf Amv 2026 (25 Min)", deadline: "2026-01-29", responsible: "Maj Filipe", status: "RESOLVIDO", class: "PREPARO F TER", lastUpdate: "", notes: "-", omds: "-", escSup: "-" },
    { id: "306-S4/EM/20º GAC Amv", event: "Solicitação de prancha para transporte de obuseiros - APRONAL 1", deadline: "2026-01-29", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. Doc encaminhado à 2ª RM.", omds: "-", escSup: "648-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "1412-Escalão Logístico/2ªRM", event: "situação de disponibilidade de SMEM - apoio do DCT", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Mnt", lastUpdate: "", notes: "1. Confeccionar Doc às OMDS Sol a resposta da documentação.\n2. Aguardando resposta das OMDS na planilha on line - OK", omds: "570-E-4/EMG/Cmdo Bda Inf Amv", escSup: "706-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "434-E-4/EMG/Cmdo Bda Inf Amv", event: "Prazo de Sol arranchamento/alojamento EPAM", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Info às OMDS a Distr Alojamento.", omds: "-", escSup: "-" },
    { id: "130-S/4 - FAdm/SCmt/Cmt 2º BI AMV", event: "solicitação de cota extra combustível ÓLEO DIESEL (ADMINISTRATIVA) 2º BI Amv", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Confeccionar Doc às OMDS sobre Sit Comb.\n2. Doc confeccionado.", omds: "-", escSup: "707-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "1681-Escalão Logístico/2ªRM", event: "Classe III - Situação de combustível automotivo na ART/2ªRM (026-26)", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "707-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "265-E4/2ª DE", event: "distribuição de rações operacionais Tipo R/2 para o primeiro semestre/2026", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "708-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "1726-Escalão Logístico/2ªRM", event: "Classe III - Consumo de combustível automotivo (027-26)", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "707-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "437-6° BI Amv", event: "Relatório do Paiol 6º BI Amv", deadline: "2026-01-30", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl V", lastUpdate: "", notes: "1. Confeccionar Doc ao Esc Sp e Sol recursos para Mnt cercamento.\n2. O 6º BI já lançou no SIGPIMA.\n3. Missão ficou com a Infraestrutura.", omds: "-", escSup: "-" },
    { id: "112-Cmdo Bda Inf Amv/Bda Inf Amv", event: "1ª Reunião de Comando da Bda Inf Amv 2026", deadline: "2026-02-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "PREPARO F TER", lastUpdate: "", notes: "-", omds: "-", escSup: "-" },
    { id: "1819-Escalão Logístico/2ªRM", event: "Classe I - eixo mensal de suprimento Cl I (FEV/26) - Circular", deadline: "2026-02-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS interessadas.", omds: "696-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "1855-Escalão Logístico/2ªRM", event: "Classe III - Solicitação de envio de valor patrimonial de carga líquida recebido em 2025", deadline: "2026-02-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Apenas para conhecimento.", omds: "-", escSup: "-" },
    { id: "247-E4/2ª DE", event: "Vtr Blindada Leve Sobre Rodas GUAICURU (IVECO) - 2ª Cia Prec - resposta", deadline: "2026-02-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl IX", lastUpdate: "", notes: "1. Confeccionado Doc Info à 2ª Cia Prec.", omds: "704-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "502-E-4/EMG/Cmdo Bda Inf Amv", event: "Classe I - remessa de ordem de fornecimento de Ração Operacional Tipo R2 - Cmdo BdaInf Amv", deadline: "2026-02-04", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS para apanha das Rç.", omds: "762-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "1617-Escalão Logístico/2ªRM", event: "Entrega de certificados de excelência e capacitação de auditores PASA/2026", deadline: "2026-02-04", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Informado no grupo de Wpp, devido ao prazo.\n2. Confeccionado Doc às OMDS.", omds: "763-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "25-Seç Dout/EMG/Cmdo Bda Inf Amv", event: "Início dos Trabalhos de Revisão do Manual de Campanha (MC) Bda L Inf_Bda Inf Amv", deadline: "2026-02-04", responsible: "Maj Filipe", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "1. Realizem a capacitação a distância, disponível no Portal de Educação do Exército.", omds: "-", escSup: "-" },
    { id: "2128-Escalão Logístico/2ªRM", event: "Classe III - Determinação de taxa de evaporação em PCA (CL.III 162-25)", deadline: "2026-02-06", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Respondido pelo 6º BIL, 1º Esqd e 5º BI Amv.\n2. Falta o 2º BI Amv.", omds: "-", escSup: "-" },
    { id: "417-E-3/EMG/Cmdo Bda Inf Amv", event: "OMDS do EPAM devem Info à 4º Seção da Bda, até dois dias úteis após o EPAM 2026, os gastos com combustível", deadline: "2026-02-09", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Não há necessidade", omds: "-", escSup: "-" },
    { id: "125-E4/2ª DE", event: "Relatório de Prestação de Contas - Op MARAJOARA", deadline: "2026-02-09", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Verificar quais OMDS receberam recurso.\n2. Confeccionar DIEx para as OMDS cobrando o RPC.", omds: "-", escSup: "962-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "128-E4/2ª DE", event: "Relatório de Prestação de Contas - Op VULCANO", deadline: "2026-02-09", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Verificar quais OMDS receberam recurso.\n2. Confeccionado DIEx 868-E-4/EMG/Cmdo Bda Inf Amv.", omds: "-", escSup: "868-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "126-E4/2ª DE", event: "Relatório de Prestação de Contas - Op CORE 2025", deadline: "2026-02-09", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Verificar quais OMDS receberam recurso.\n2. Confeccionar DIEx para as OMDS.", omds: "-", escSup: "962-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "173-E4/2ª DE", event: "Relatório de Prestação de Contas - Op REDENTOR", deadline: "2026-02-09", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Verificar quais OMDS receberam recurso.\n2. Confeccionar DIEx para as OMDS.", omds: "-", escSup: "962-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "372-E3 EMG/EMG ESA", event: "apoio de pessoal para a Solenidade de Entrega do Sabre 2026", deadline: "2026-02-10", responsible: "ST Valter", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. Verificar situação do ônibus para a ESA.\n2. Verificar com o E1 quais OMDS irão ceder efetivo.\n3. Confeccionar Doc às OMDS.", omds: "957-E-1/EMG/Cmdo Bda Inf Amv", escSup: "961-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "112-E4/2ª DE", event: "Diretriz de Prontidão Logística 2026", deadline: "2026-02-11", responsible: "Maj Filipe", status: "RESOLVIDO", class: "PREPARO F TER", lastUpdate: "", notes: "1. Encaminhar a Diretriz de Prontidão Logística 2026 às OMDS", omds: "1005-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "459-E4/2ª DE", event: "emissão de ODF", deadline: "2026-02-11", responsible: "Maj Filipe", status: "RESOLVIDO", class: "NOVOS MEM", lastUpdate: "", notes: "1. Confeccionado Doc para o 22º B Log para retirada de MEM Cl VI no 2º BCmb.", omds: "1002-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "466-E10/2ª DE", event: "Almoxarifado Virtual Nacional (AVN) 2026 - Orientações Iniciais", deadline: "2026-02-11", responsible: "Maj Filipe", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "1. Confeccionado Doc para as OMDS que possuem autonomia Adm.\n2. Doc encaminhado ao E10.", omds: "", escSup: "1004-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "29-Seç Asse Ensino/EMG/Cmdo Bda Inf Amv", event: "OSv nº 001 Asse Ensino/Bda Inf Amv - Distribuição de Responsabilidades de Preparação de Instruções e Exercícios no Terreno", deadline: "2026-02-11", responsible: "Maj Filipe", status: "ACOMPANHAR", class: "PREPARO F TER", lastUpdate: "", notes: "- Verificar as responsabilidades da Seção", omds: "", escSup: "" },
    { id: "-", event: "Apoio ao CFC Aux Prec", deadline: "2026-02-12", responsible: "ST Valter", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. Sol a van e Motorista para a Atv de ida.\n2. Falta DIEx da volta - Ok", omds: "997-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "2123-Escalão Logístico/2ªRM", event: "Classe I - Orientações sobre o consumo de café - Circular", deadline: "2026-02-12", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "2. Confeccionado Doc às OMDS.", omds: "1139-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "197-S/4 - FAdm/SCmt/Cmt 2º BI AMV", event: "solicitação de cota extra combustível ÓLEO DIESEL (OPERACIONAL) 2º BI Amv", deadline: "2026-02-12", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "Respondido no DIEx sobre a Irrigação 2", omds: "1312-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1272-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "185-E4/2ª DE", event: "níveis de estoque de rações operacionais", deadline: "2026-02-12", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. DIEX não tinha sido Rcb pela 4ª Seç.\n2. Confeccionado Doc de resposta.", omds: "-", escSup: "1074-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "512-E4/2ª DE", event: "camisa bege meia manga - 8º Uniforme - CIRCULAR", deadline: "2026-02-12", responsible: "Maj Filipe", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "1. Divulgado às OMDS.\n2. Não comprar o novo tecido.", omds: "1067-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "463-E4/2ª DE", event: "Classe III - Distribuição de comb auto para IIB/26 (038-26)", deadline: "2026-02-12", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Doc confecionado para as OMDS.", omds: "994-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "320-E4/2ª DE", event: "Classe V - Minuta de Diretriz de Consumo de Munição de Preparo da F Ter 2026", deadline: "2026-02-12", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl V", lastUpdate: "", notes: "1. Doc confecionado para as OMDS.\n2. Dtz entregue pelo E2.", omds: "1035-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "514-E4/2ª DE", event: "Plano para o gerenciamento de material Classe VIII - Saúde", deadline: "2026-02-12", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl VIII - Sau", lastUpdate: "", notes: "1. Doc confecionado para as OMDS.", omds: "1068-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "490-E4/2ª DE", event: "Orientações para cadastramento de usuários no SCA e para atribuição de perfis no SIGELOG", deadline: "2026-02-19", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Doc confecionado para as OMDS.", omds: "1131-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "420-E4/2ª DE", event: "Classe II - levantamento da necessidade de colete e capacete balístico", deadline: "2026-02-19", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl II", lastUpdate: "", notes: "1. Levantar UU as necessidades de colete e capacete balístico - OK", omds: "1140-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1187-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "493-E3/E5/2ª DE", event: "Cl VI - Estágios Setoriais sobre Manutenção de Material de Engenharia no CI Eng/2º B Fv/2026", deadline: "2026-02-19", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl VI", lastUpdate: "", notes: "1. Estágio de Manutenção de Geradores (EMGE).\n2. Estágio de Manutenção e Operação de Motor de Popa.\n3. Estágio de Manutenção de Equipamento de Mergulho.\n4. Verificar Voluntários com as OMDS - OK\n5. Confeccionado Doc de resposta.", omds: "1132-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1157-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "461-E4/2ª DE", event: "necessidade de recursos para aquisição de aeronave remotamente pilotada - DRONE", deadline: "2026-02-19", responsible: "Maj Filipe", status: "RESOLVIDO", class: "MEM", lastUpdate: "", notes: "- Confeccionado DIEx 1003-E-4/EMG/Cmdo Bda Inf Amv\n- 6º BI Amv não tem interesse\n- Cia Prec tem interesse em 1\n- 1º Esqd C Amv\n- 20º GAC Amv", omds: "-", escSup: "-" },
    { id: "111-S/3/CMDO", event: "Atividade Alusiva à Tomada de Monte Castelo e Tomada de Montese", deadline: "2026-02-20", responsible: "Ten Glauco", status: "RESOLVIDO", class: "PREPARO F TER", lastUpdate: "", notes: "1. DIEx confeccionado aguardando análise do E4 e despacho junto ao CHEM.\n2. Foi anexado um planejamento do Trnsp Pes da missão.", omds: "1357-E-3/EMG/Cmdo Bda Inf Amv", escSup: "1437-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "2043-S/4/CMDO", event: "apropriação de valor patrimonial no siafi em trânsito a mais de 90 dias - paintball e airsoft", deadline: "2026-02-20", responsible: "Ten Glauco", status: "RESOLVIDO", class: "Patrimônio", lastUpdate: "", notes: "1. Verificar se o CIOU/11ª Bda Inf Mec Rlz a apropriação dos valores patrimoniais", omds: "-", escSup: "1917-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "467-E4/2ª DE", event: "Classe I - orientações referentes à Gestão de Subsistência", deadline: "2026-02-20", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl I", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.\n2. necessidade de envio das informações do QDAA", omds: "1133-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "578-E4/2ª DE", event: "Classe II: orientações para a solicitação de crédito extraordinário (Extra PDR Log)", deadline: "2026-02-20", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Confeccionar Doc para as OMDS - OK", omds: "1242-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "6512-S4/6° BI Amv", event: "Ap SJC 24 BARRACAS", deadline: "2026-02-20", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. Info sobre OD já enviada à 2ª DE (406 L OD)\n- 6º BI Amv já possui 8 barracas.\n- Serão cauteladas 12 no 5º BI Amv e 4 na Cia C Bda Amv", omds: "11446-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "25-Seç Dout/EMG/Cmdo Bda Inf Amv", event: "Curso sobre Doutrina", deadline: "2026-02-19", responsible: "Maj Filipe", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "1. Não achei o curso no EB Aula.\n2. Verifiquei com o Cel Ribeiro Neto e está realmente com problema.", omds: "-", escSup: "-" },
    { id: "411-E3/E5/2ª DE", event: "Videoconferência (VC) para execução da RDC do Exc Conjunto PERSEU 2026 - adiamento", deadline: "2026-02-24", responsible: "Maj Filipe", status: "RESOLVIDO", class: "PREPARO F TER", lastUpdate: "", notes: "VC preparatória para a RDC no dia 19 de fevereiro", omds: "-", escSup: "-" },
    { id: "588-E4/2ª DE", event: "Classe III - Emprego de combustível reserva (cota irrigação) - 2ª DE -retificação/ratificação de distribuição", deadline: "2026-02-25", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Ratifique ou retifique até 25 FEV 26 a distribuição de créditos de combustível - OK\n2. Confeccionar Doc para as OMDS.", omds: "1312-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1272-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "566-E4/2ª DE", event: "Cl V (A) - Levantamento da necessidade do novos Mrt Me Acg 81mm", deadline: "2026-02-25", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl V", lastUpdate: "", notes: "1. Confeccionar Doc às OMDS - OK\n2. Aguardando resposta das OMDS para confecção do Doc Resposta.\n3. A 2ª DE Info que não serão repassados novos Mrt 81", omds: "1190-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1508-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "2420-Escalão Logístico/2ªRM", event: "Classe III - Retificação de informação de tancagem de PCA do 1° Esq C Amv (037-26)", deadline: "2026-02-25", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "- DIEx nº 110-S/4/CMDO do 1º Esqd está incorreto.\n- Sol retificação", omds: "1249-E-4/EMG/Cmdo Bda Inf Amv", escSup: "1555-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "1072-E-3/EMG/Cmdo Bda Inf Amv", event: "Ordem Operações Nr 01/2026 - Operação Tataúba - P Trab", deadline: "2026-02-25", responsible: "Maj Filipe", status: "PRAZO DE RESPOSTA", class: "Orçamentário", lastUpdate: "", notes: "- Sol P Trab ao 6º BI Amv e 12ª Cia Eng Cmb Amv", omds: "-", escSup: "-" },
    { id: "422-E4/2ª DE", event: "Classe V - munição - calendário de obrigações", deadline: "2026-02-26", responsible: "Ten Glauco", status: "RESOLVIDO", class: "Cl V", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS, aguardando resposta", omds: "1089-E-4/EMG/Cmdo Bda Inf Amv", escSup: "" },
    { id: "1000-E4.3/E4/1ªDE", event: "remanejamento de combustível (Cmdo 1ª DE) (SOLICITA)", deadline: "2026-02-26", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "Sol 40 L Gas para a AD1 abastecer em Caçapava. Rlz o abastecimento de 35 l gas", omds: "-", escSup: "-" },
    { id: "701-E10/2ª DE", event: "descentralização de recursos para o APRONAL I e ADESTRAMENTO da FT JACARÉ", deadline: "2026-02-26", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Confeccionado DIEx às OMDS.", omds: "1438-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "1410-E-4/EMG/Cmdo Bda Inf Amv", event: "gestões para transferência de cota de combustível", deadline: "2026-02-26", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "1. Retificar o Doc com 475 l OD.", omds: "-", escSup: "1437-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "807-S4/6° BI Amv", event: "Informação do PCA", deadline: "2026-02-26", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "solicito que seja atribuída prioridade máxima à Guarnição de Caçapava no planejamento e execução da construção de um Posto Central de Abastecimento definitivo", omds: "-", escSup: "-" },
    { id: "688-Div Sau/Base Adm Amv", event: "Avaliação odontológica de Pré-TAF e SIRSAU", deadline: "2026-02-26", responsible: "", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "-", omds: "-", escSup: "-" },
    { id: "726-Asse Gestão/Cmdo Bda Inf Amv", event: "Atualização dos Proprietários de Riscos e Equipes de Gestão de Riscos", deadline: "2026-02-27", responsible: "ST Valter", status: "RESOLVIDO", class: "-", lastUpdate: "", notes: "1. Confeccionar Doc de resposta com os dados do Proprietários de Riscos", omds: "-", escSup: "72-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "964-Escalão Logístico/2ªRM", event: "Necessidade de atualização de OS no SisLogMnt (CIRCULAR)", deadline: "2026-02-27", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Mnt", lastUpdate: "", notes: "Doc confeccionado às OMDS", omds: "358-E-4/EMG/Cmdo Bda Inf Amv", escSup: "358-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "372-E3 EMG/EMG ESA", event: "apoio de pessoal para a Solenidade de Entrega do Sabre 2026 - INICIO", deadline: "2026-03-01", responsible: "Ten Glauco", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. DIEx de planejamento do Trnsp Pes para as OMDS envolvidas elaborado e pronto para despacho.", omds: "957-E-1/EMG/Cmdo Bda Inf Amv", escSup: "961-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "594-E4/EM Geral/ChEM", event: "Empréstimo de material de emprego militar da 5ª Bia AAAe Amv", deadline: "2026-03-02", responsible: "Ten Glauco", status: "RESOLVIDO", class: "Cl VI", lastUpdate: "", notes: "1. 01 Radar SABER M-60 da 5ª Bia AAAe Amv foi emprestado ao 2º GAAAe dia 25 Fev 26.", omds: "-", escSup: "-" },
    { id: "293-COL/22º B Log Am", event: "Ordem de Operações e Cronograma da Inspeção Técnica e Apoio Direto - 2026", deadline: "2026-03-02", responsible: "ST Valter", status: "RESOLVIDO", class: "Mnt", lastUpdate: "", notes: "- Ap Dto 22º B Log Amv ao 22º B Log Amv", omds: "-", escSup: "-" },
    { id: "730-E4/2ª DE", event: "Classe II - Agendamento para retirada de Coletes", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl II", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "1444-E-4/EMG/Cmdo Bda Inf Amv", escSup: "4818-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "706-E10/2ª DE", event: "solicitações extraordinárias de recursos direcionadas à Chefia de Suprimento - orientações", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "1500-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "743-E4/2ª DE", event: "Execução do Transporte Regional Logístico na Área de Responsabilidade da 2ª RM", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Trnp", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "1502-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "742-E4/2ª DE", event: "descarga de material permanente Cl VIII - Saúde", deadline: "2026-03-02", responsible: "Cap Luis Augusto", status: "RESOLVIDO", class: "Desfazimento", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "1493-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "718-E4/2ª DE", event: "Classe VIII - controle de medicamento (orientações)", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl VIII - Sau", lastUpdate: "", notes: "1. Confeccionado Doc às OMDS.", omds: "1501-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "655-FS/CCAp/2º BE Cmb", event: "Empréstimo de centrífuga", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl VIII - Sau", lastUpdate: "", notes: "O 2º BE Cmb possui uma centrífuga disponível, com voltagem 220v, para empréstimo temporário", omds: "1491-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "1205-Fin/CCOp/Cmdo CMO", event: "Reunião Inicial de Planejamento (RIP) - Exc Cj PERSEU 2026", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Orçamentário", lastUpdate: "", notes: "- Confeccionar P Trab para a RIP de 1 Of Sp", omds: "-", escSup: "1340-Seç Plj/EMG/Cmdo Bda Inf Amv" },
    { id: "769-E4/2ª DE", event: "empréstimo de kits reduzidos do Projeto COBRA para prospecção técnica", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Patrimônio", lastUpdate: "", notes: "1. Verificar com o E3 o impacto desse empréstimo", omds: "-", escSup: "2225-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "448-Escalão Logístico/2ªRM", event: "Inspeção Anual de Armamento do Exército (IA2EX/2026)", deadline: "2026-03-02", responsible: "Maj Filipe", status: "RESOLVIDO", class: "Cl V", lastUpdate: "", notes: "1. Confeccionar novo DIEx, cobrando os relatórios", omds: "262-E-4/EMG/Cmdo Bda Inf Amv", escSup: "2471-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "1780-E4/2ª DE", event: "Cl VI - Demandas para itens de aquisição regional (bússola, colete salva-vidas e GPS)", deadline: "2026-03-02", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl VI", lastUpdate: "", notes: "a Diretoria de Material de Engenharia pretende descentralizar notas de crédito GND 4 destinadas à aquisição de material permanente", omds: "3566-E-4/EMG/Cmdo Bda Inf Amv", escSup: "-" },
    { id: "1770-E-4/EMG/Cmdo Bda Inf Amv", event: "créditos para manutenção de viaturas deste Cmdo", deadline: "2026-03-09", responsible: "ST Valter", status: "RESOLVIDO", class: "Mnt", lastUpdate: "", notes: "1. Confeccionar Doc à Cia Cmdo para preparar Proc Adm para Sol recursos Mnt Vtr", omds: "-", escSup: "2182-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "491-Pel Mnt/Cia C Bda Inf Amv", event: "Crédito para manutenção de viatura - Mitsubishi L200 (solicitação)", deadline: "2026-04-30", responsible: "ST Valter", status: "RESOLVIDO", class: "Cl IX", lastUpdate: "", notes: "1. Solicitado diretamente à C Mat\n2. Recurso já chegou e foi empenhado", omds: "-", escSup: "2182-E-4/EMG/Cmdo Bda Inf Amv" },
    { id: "688-S/4/CMDO", event: "Solicitação de complementação de cota de combustível - Estágio de Motociclista", deadline: "2026-07-08", responsible: "ST Richardson", status: "RESOLVIDO", class: "Cl III - Comb", lastUpdate: "", notes: "Sol recompletamento do combustível previsto no PTrab\nA OM Rcb a cota de 165 l OD e 100 l Gas", omds: "-", escSup: "-" },
    { id: "6320-E-3/EMG/Cmdo Bda Inf Amv", event: "OI Nº 26/E3 - Exercício de Adestramento Falcão - Selva - 2026", deadline: "2026-08-09", responsible: "Maj Filipe", status: "EVENTO", class: "O Sv", lastUpdate: "", notes: "Capacitar militares da Brigada Aeromóvel a operar em Ambiente Operacional de Selva.\nLocal: 50º BIS, Imperatriz/MA.\nParticipantes:\n- 6º BI Amv: 117 militares\n- 2ª Cia Prec: 12 militares\n- Cmdo Bda Inf Amv: 01 militar.", omds: "", escSup: "" }
];

const INITIAL_DOCS = [
    { date: "", diex: "2295-E4/2ª DE", subject: "distribuição de munição pesada e específica - 2ª DE 2026", docStatus: "AGENDAR", notes: "Sol feita pelo ChEM" },
    { date: "", diex: "-", subject: "Trnp pacientes do HMASP pelo 2º BI Amv", docStatus: "AGENDAR", notes: "Sol que o 2º BI Amv confeccione DIEx para ser encaminhado à 2ª RM" },
    { date: "", diex: "1035-S4/5º BIL", subject: "Boina do 5º BI Amv", docStatus: "RESOLVIDO", notes: "- Assunto já tratado com o Cmt.\n- S4/5º BI Amv sinalizou que está em vias de resolver problema com o 2º B Sup" },
    { date: "", diex: "3689-E4.5/4ª Seç/CMSE", subject: "MEM Cl IX (Moto) - solicitação de transferência de VTNE 5t para a ESA (encaminho)", docStatus: "AGENDAR", notes: "Passar 1 VTNE 5 Ton para a ESA" },
    { date: "", diex: "820-S/4/CMDO", subject: "Levantamento de necessidade de manutenção para Motocicleta (CL - IX) - RESPOSTA", docStatus: "AGENDAR", notes: "Sol o recurso de R$ 16.648,00 para Mnt das 11 Motos do Esqd\nInfo que estão sendo descarregadas 17 motos" },
    { date: "", diex: "-", subject: "Verificar com a Aeronáutica a documentação necessária para alterar a posse da Anv Super Puma do 6º BI Amv para um dono de acervo e museu histórico", docStatus: "AGENDAR", notes: "Solicitação do Cmt da Bda na reunião de Consciência Situacional do dia 15 de junho 2026" },
    { date: "", diex: "-", subject: "Providenciar a avaliação dos Pólos de Mnt do Forte Ipiranga", docStatus: "AGENDAR", notes: "Solicitação do Cmt da Bda na reunião de Consciência Situacional do dia 15 de junho 2026" },
    { date: "", diex: "-", subject: "Mnt Vtr Marrua", docStatus: "", notes: "" },
    { date: "", diex: "-", subject: "Distr Motocicletas", docStatus: "", notes: "" },
    { date: "", diex: "-", subject: "DIEx sobre Plano de Mnt Vtr Marruá", docStatus: "", notes: "- Peças para Mnt parte da frota - aumento rápido da Dspn\n- Sol Ap mnt 3º Esc\n- Recurso para o COLOG para o restante das Vtr" },
    { date: "", diex: "-", subject: "Sol Mochila GC", docStatus: "", notes: "" },
    { date: "", diex: "-", subject: "Sol OVN", docStatus: "", notes: "" }
];

// Use MISSIONS_DATA from missions_data.js if available
if (typeof MISSIONS_DATA !== 'undefined' && MISSIONS_DATA.length > 0) {
    INITIAL_DATA = MISSIONS_DATA;
}

let missions = [];
let docs = [];
let currentPage = 1;
let currentDocPage = 1;
const perPage = 25;
let sortCol = 'deadline';
let sortDir = 'asc';
let docSortCol = 'date';
let docSortDir = 'desc';
let deleteTargetIdx = null;
let deleteDocTargetIdx = null;
let quickFilter = null;

function init() {
    const saved = localStorage.getItem('bdaMissions');
    missions = saved ? JSON.parse(saved) : [...INITIAL_DATA];
    const savedDocs = localStorage.getItem('bdaDocs');
    docs = savedDocs ? JSON.parse(savedDocs) : [...INITIAL_DOCS];

    if (initFirebase()) {
        syncLoad().then(remote => {
            if (remote && remote.missions) {
                missions = remote.missions;
                docs = remote.docs || [];
                if (remote.contatos && remote.contatos.length) {
                    contatos = remote.contatos;
                    localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos));
                }
                localStorage.setItem('bdaMissions', JSON.stringify(missions));
                localStorage.setItem('bdaDocs', JSON.stringify(docs));
                if (remote.savedAt) localStorage.setItem('bdaMissions_savedAt', JSON.stringify(remote.savedAt));
                render();
                renderDocs();
            } else {
                syncSave({ missions: missions, docs: docs, contatos: contatos, savedAt: new Date().toISOString() });
            }
            syncListen(onRemoteUpdate);
        }).catch(() => {
            syncSave({ missions: missions, docs: docs, contatos: contatos, savedAt: new Date().toISOString() });
            syncListen(onRemoteUpdate);
        });
    }
    updateSyncUI();

    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    renderProximasMissoes();

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    // Missões
    document.getElementById('btnNew').addEventListener('click', openNewModal);
    document.getElementById('btnExport').addEventListener('click', exportCSV);
    document.getElementById('btnClose').addEventListener('click', closeModal);
    document.getElementById('btnCancel').addEventListener('click', closeModal);
    document.getElementById('btnSave').addEventListener('click', saveMission);
    document.getElementById('btnCloseDelete').addEventListener('click', closeDeleteModal);
    document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
    document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);
    document.getElementById('btnCloseView').addEventListener('click', closeViewModal);
    document.getElementById('btnCloseViewFooter').addEventListener('click', closeViewModal);
    document.getElementById('btnPrintView').addEventListener('click', printViewMission);
    document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; render(); });
    document.getElementById('searchDiex').addEventListener('input', () => { currentPage = 1; render(); });
    document.getElementById('filterStatus').addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('filterClass').addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('filterResponsible').addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('filterDateStart').addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('filterDateEnd').addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('btnClearDate').addEventListener('click', () => {
        document.getElementById('filterDateStart').value = '';
        document.getElementById('filterDateEnd').value = '';
        currentPage = 1;
        render();
    });
    document.getElementById('btnAtrasados').addEventListener('click', () => {
        quickFilter = quickFilter === 'overdue' ? null : 'overdue';
        currentPage = 1;
        render();
    });
    document.getElementById('btnPrazoResposta').addEventListener('click', () => {
        quickFilter = quickFilter === 'deadline' ? null : 'deadline';
        currentPage = 1;
        render();
    });
    document.querySelectorAll('#tab-missions th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortCol = col; sortDir = 'asc'; }
            render();
        });
    });
    document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    document.getElementById('deleteOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteModal(); });

    // Documentos
    document.getElementById('btnNewDoc').addEventListener('click', openNewDocModal);
    document.getElementById('btnExportDoc').addEventListener('click', exportDocCSV);
    document.getElementById('btnRestoreDocs').addEventListener('click', restoreDocs);
    document.getElementById('btnCloseDoc').addEventListener('click', closeDocModal);
    document.getElementById('btnCancelDoc').addEventListener('click', closeDocModal);
    document.getElementById('btnSaveDoc').addEventListener('click', saveDoc);
    document.getElementById('btnCloseDeleteDoc').addEventListener('click', closeDeleteDocModal);
    document.getElementById('btnCancelDeleteDoc').addEventListener('click', closeDeleteDocModal);
    document.getElementById('btnConfirmDeleteDoc').addEventListener('click', confirmDeleteDoc);
    document.getElementById('searchDocInput').addEventListener('input', () => { currentDocPage = 1; renderDocs(); });
    document.getElementById('searchDocDiex').addEventListener('input', () => { currentDocPage = 1; renderDocs(); });
    document.getElementById('filterDocStatus').addEventListener('change', () => { currentDocPage = 1; renderDocs(); });
    document.querySelectorAll('#tab-documents th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (docSortCol === col) docSortDir = docSortDir === 'asc' ? 'desc' : 'asc';
            else { docSortCol = col; docSortDir = 'asc'; }
            renderDocs();
        });
    });
    document.getElementById('modalDocOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDocModal(); });
    document.getElementById('deleteDocOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteDocModal(); });

    // PDF Import
    document.getElementById('fileImportMissao').addEventListener('change', e => handlePDFImport(e, 'missions'));
    document.getElementById('fileImportDoc').addEventListener('change', e => handlePDFImport(e, 'documents'));

    // Restore Missions
    document.getElementById('btnRestoreMissions').addEventListener('click', restoreMissions);

    // Dashboard
    document.getElementById('btnRefreshDashboard').addEventListener('click', renderDashboard);
    document.querySelectorAll('.tab').forEach(tab => {
        if (tab.dataset.tab === 'dashboard') {
            tab.addEventListener('click', () => setTimeout(renderDashboard, 100));
        }
    });

    render();
    renderDocs();
    initWhatsApp();

    setInterval(function() {
        if (!firebaseDb) {
            initFirebase();
        }
        if (firebaseDb && missions.length > 0) {
            syncSave({ missions: missions, docs: docs, contatos: contatos, savedAt: new Date().toISOString() });
        }
    }, 60000);

    function pollFirebase() {
        fetch(REST_URL).then(function(r) { return r.json(); }).then(function(remote) {
            if (!remote || !remote.missions) return;
            var remoteSavedAt = remote.savedAt || '';
            var localSavedAt = '';
            try { localSavedAt = JSON.parse(localStorage.getItem('bdaMissions_savedAt') || '""'); } catch(e) {}
            if (remoteSavedAt !== localSavedAt) {
                missions = remote.missions;
                docs = remote.docs || [];
                if (remote.contatos && remote.contatos.length) {
                    contatos = remote.contatos;
                    localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos));
                }
                localStorage.setItem('bdaMissions', JSON.stringify(missions));
                localStorage.setItem('bdaDocs', JSON.stringify(docs));
                localStorage.setItem('bdaMissions_savedAt', JSON.stringify(remoteSavedAt));
                render();
                renderDocs();
                if (typeof renderDashboard === 'function') renderDashboard();
                refreshWhatsApp();
            }
        }).catch(function() {
            if (firebaseDb) {
                firebaseDb.ref('bda_data').once('value').then(function(snap) {
                    var remote = snap.val();
                    if (!remote || !remote.missions) return;
                    var remoteSavedAt = remote.savedAt || '';
                    var localSavedAt = '';
                    try { localSavedAt = JSON.parse(localStorage.getItem('bdaMissions_savedAt') || '""'); } catch(e) {}
                    if (remoteSavedAt !== localSavedAt) {
                        missions = remote.missions;
                        docs = remote.docs || [];
                        if (remote.contatos && remote.contatos.length) {
                            contatos = remote.contatos;
                            localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos));
                        }
                        localStorage.setItem('bdaMissions', JSON.stringify(missions));
                        localStorage.setItem('bdaDocs', JSON.stringify(docs));
                        localStorage.setItem('bdaMissions_savedAt', JSON.stringify(remoteSavedAt));
                        render();
                        renderDocs();
                        if (typeof renderDashboard === 'function') renderDashboard();
                        refreshWhatsApp();
                    }
                }).catch(function() {});
            }
        });
    }

    setInterval(pollFirebase, 10000);

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            pollFirebase();
        }
    });
}

// ============ WhatsApp ============
let filtroDias = 7;

let filtroResponsavelWA = '';

let filtroTextoWA = '';

function missaoTextoMatch(m, texto) {
    if (!texto) return true;
    const t = texto.toLowerCase();
    const campos = [m.id, m.event, m.responsible, m.status, m.class, m.notes, m.omds, m.escSup].filter(Boolean);
    return campos.some(c => c.toLowerCase().includes(t));
}
let missoesVisiveis = [];
let selecionadas = new Set();
let contatos = [];
let contatoEditandoIdx = -1;

function carregarContatos() {
    if (contatos.length > 0) return;
    try { contatos = JSON.parse(localStorage.getItem('whatsapp_contatos') || '[]'); } catch (e) { contatos = []; }
    if (contatos.length === 0) {
        contatos = [{ nome: 'Comandante', telefone: '5512988843234' }];
        localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos));
    }
}

function salvarContatos() { localStorage.setItem('whatsapp_contatos', JSON.stringify(contatos)); syncSave({ missions: missions, docs: docs, contatos: contatos, savedAt: new Date().toISOString() }); }

function renderizarContatos() {
    const c = document.getElementById('listaContatos');
    let html = '';
    contatos.forEach((ct, i) => {
        html += '<label class="contato-chip"><input type="checkbox" class="check-contato" data-idx="' + i + '"' + (ct.selecionado !== false ? ' checked' : '') + '><span>' + ct.nome + '</span></label>';
    });
    if (!contatos.length) html = '<span style="color:#aaa;font-size:13px;">Nenhum contato cadastrado</span>';
    c.innerHTML = html;
    c.querySelectorAll('.check-contato').forEach(cb => {
        cb.addEventListener('change', function() {
            contatos[parseInt(this.dataset.idx)].selecionado = this.checked;
            salvarContatos();
            renderizarMensagemBruta();
        });
    });
    c.querySelectorAll('.contato-chip').forEach(chip => {
        chip.addEventListener('dblclick', function() {
            const idx = parseInt(this.dataset.idx);
            abrirModalContatos();
            document.getElementById('contatoNome').value = contatos[idx].nome;
            document.getElementById('contatoTelefone').value = contatos[idx].telefone;
            contatoEditandoIdx = idx;
            document.getElementById('btnSalvarContato').textContent = 'Atualizar';
        });
    });
}

function renderizarContatosModal() {
    const c = document.getElementById('listaContatosModal');
    if (!contatos.length) { c.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px;">Nenhum contato cadastrado</p>'; return; }
    let html = '<table><thead><tr><th>Nome</th><th>Telefone</th><th style="text-align:right;">Ações</th></tr></thead><tbody>';
    contatos.forEach((ct, i) => {
        html += '<tr><td>' + ct.nome + '</td><td style="color:var(--text-secondary);font-family:monospace;">' + ct.telefone + '</td><td style="text-align:right;"><button class="btn-editar-contato" data-idx="' + i + '" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px;margin-right:8px;">Editar</button><button class="btn-excluir-contato" data-idx="' + i + '" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px;">Excluir</button></td></tr>';
    });
    html += '</tbody></table>';
    c.innerHTML = html;
    c.querySelectorAll('.btn-editar-contato').forEach(btn => btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        document.getElementById('contatoNome').value = contatos[idx].nome;
        document.getElementById('contatoTelefone').value = contatos[idx].telefone;
        contatoEditandoIdx = idx;
        document.getElementById('btnSalvarContato').textContent = 'Atualizar';
    }));
    c.querySelectorAll('.btn-excluir-contato').forEach(btn => btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        if (confirm('Excluir "' + contatos[idx].nome + '"?')) { contatos.splice(idx, 1); salvarContatos(); renderizarContatos(); renderizarContatosModal(); }
    }));
}

function abrirModalContatos() {
    document.getElementById('modalContatos').style.display = 'flex';
    document.getElementById('contatoNome').value = '';
    document.getElementById('contatoTelefone').value = '';
    contatoEditandoIdx = -1;
    document.getElementById('btnSalvarContato').textContent = 'Salvar';
    renderizarContatosModal();
}
window.fecharModalContatos = function() { document.getElementById('modalContatos').style.display = 'none'; };

function salvarContatoForm() {
    const nome = document.getElementById('contatoNome').value.trim();
    const telefone = document.getElementById('contatoTelefone').value.replace(/\D/g, '').trim();
    if (!nome) { alert('Informe o nome do contato.'); return; }
    if (!telefone) { alert('Informe o telefone do contato.'); return; }
    if (contatoEditandoIdx >= 0) { contatos[contatoEditandoIdx].nome = nome; contatos[contatoEditandoIdx].telefone = telefone; }
    else contatos.push({ nome, telefone, selecionado: true });
    salvarContatos(); renderizarContatos(); renderizarContatosModal();
    document.getElementById('contatoNome').value = '';
    document.getElementById('contatoTelefone').value = '';
    contatoEditandoIdx = -1;
    document.getElementById('btnSalvarContato').textContent = 'Salvar';
}

function obterMissoesProximosDias() {
    if (typeof missions === 'undefined') return [];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje); limite.setDate(limite.getDate() + filtroDias);
    return missions.filter(m => {
        if (m.status === 'RESOLVIDO') return false;
        if (filtroResponsavelWA && m.responsible !== filtroResponsavelWA) return false;
        if (!missaoTextoMatch(m, filtroTextoWA)) return false;
        const d = normalizarData(m.deadline);
        if (!d) return false;
        return d >= hoje && d <= limite;
    }).map(m => {
        const d = normalizarData(m.deadline);
        const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
        let prazoLabel = diff === 0 ? 'HOJE' : diff === 1 ? 'AMANHÃ' : 'EM ' + diff + ' DIAS';
        return Object.assign({}, m, { prazoLabel, diasRestantes: diff });
    }).sort((a, b) => a.diasRestantes - b.diasRestantes);
}

function obterMissoesVencidas() {
    if (typeof missions === 'undefined') return [];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return missions.filter(m => {
        if (m.status === 'RESOLVIDO') return false;
        if (filtroResponsavelWA && m.responsible !== filtroResponsavelWA) return false;
        if (!missaoTextoMatch(m, filtroTextoWA)) return false;
        const d = normalizarData(m.deadline);
        if (!d) return false;
        return d < hoje;
    });
}

function chaveMissao(m) { return (m.id || '') + '|' + (m.deadline || '') + '|' + (m.event || ''); }

function toggleSelecionada(chave) {
    if (selecionadas.has(chave)) selecionadas.delete(chave); else selecionadas.add(chave);
    renderizarMensagemBruta();
}

function toggleTodas(tipo) {
    document.querySelectorAll('.check-missao').forEach(cb => {
        cb.checked = tipo === 'marcar';
        if (tipo === 'marcar') selecionadas.add(cb.dataset.chave); else selecionadas.delete(cb.dataset.chave);
    });
    renderizarMensagemBruta();
}

function formatarMensagemWhatsApp() {
    const sel = missoesVisiveis.filter(m => selecionadas.has(chaveMissao(m)));
    const vencidas = sel.filter(m => { const d = normalizarData(m.deadline); const h = new Date(); h.setHours(0,0,0,0); return d && d < h; });
    const proximas = sel.filter(m => { const d = normalizarData(m.deadline); const h = new Date(); h.setHours(0,0,0,0); return d && d >= h; }).sort((a, b) => a.diasRestantes - b.diasRestantes);
    const hoje = new Date();
    const dataStr = hoje.getDate() + '/' + (hoje.getMonth() + 1) + '/' + hoje.getFullYear();
    let msg = '🔔 *LEMBRETE DIÁRIO - BDA INF AMV*\n📅 ' + dataStr;
    if (filtroResponsavelWA) msg += '\n👤 *Responsável: ' + filtroResponsavelWA + '*';
    msg += '\n━━━━━━━━━━━━━━━━━━━━';
    if (vencidas.length) {
        msg += '\n\n⚠️ *MISSÕES VENCIDAS (' + vencidas.length + '):*';
        vencidas.forEach((m, i) => { msg += '\n\n' + (i+1) + '. ' + (m.event||'Sem descrição') + '\n   📋 DIEx: ' + (m.id||'N/I') + '\n   👤 Resp: ' + (m.responsible||'N/I') + '\n   ⏰ Prazo: ' + (m.deadline||'N/I') + ' (ATRASADO)'; });
    }
    if (proximas.length) {
        msg += '\n\n📅 *MISSÕES DOS PRÓXIMOS ' + filtroDias + ' DIAS (' + proximas.length + '):*';
        proximas.forEach((m, i) => { msg += '\n\n' + (i+1) + '. ' + (m.event||'Sem descrição') + '\n   📋 DIEx: ' + (m.id||'N/I') + '\n   👤 Resp: ' + (m.responsible||'N/I') + '\n   ⏰ Prazo: ' + (m.deadline||'N/I') + ' (' + m.prazoLabel + ')\n   📁 Classe: ' + (m.class||'N/I'); });
    }
    if (!sel.length) msg += '\n\n✅ Nenhuma missão selecionada.';
    msg += '\n\n━━━━━━━━━━━━━━━━━━━━\n💻 Sistema de Gerenciamento - Bda Inf Amv';
    return msg;
}

function enviarWhatsApp() {
    const sel = contatos.filter(c => c.selecionado !== false);
    if (!sel.length) { alert('Selecione pelo menos um contato.'); return; }
    const msg = encodeURIComponent(formatarMensagemWhatsApp());
    const url = 'https://wa.me/' + sel[0].telefone + '?text=' + msg;
    window.location.href = url;
}

function copiarMensagem() {
    navigator.clipboard.writeText(formatarMensagemWhatsApp()).then(() => {
        const btn = document.getElementById('btnCopiar');
        const orig = btn.textContent;
        btn.textContent = '✓ Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    });
}

function renderizarPreviewDiario() {
    const c = document.getElementById('previewContainer');
    const proximas = obterMissoesProximosDias();
    const vencidas = obterMissoesVencidas();
    missoesVisiveis = [];
    selecionadas = new Set();
    let html = '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;"><button class="btn btn-secondary" onclick="toggleTodas(\'marcar\')" style="font-size:11px;padding:5px 12px;">Marcar Todas</button><button class="btn btn-secondary" onclick="toggleTodas(\'desmarcar\')" style="font-size:11px;padding:5px 12px;">Desmarcar Todas</button><span style="font-size:12px;color:#aaa;"></span></div>';
    if (vencidas.length) {
        html += '<div class="preview-secao preview-vencidas"><h3>⚠️ Missões Vencidas (' + vencidas.length + ')</h3>';
        vencidas.forEach(m => {
            const chave = chaveMissao(m); missoesVisiveis.push(m); selecionadas.add(chave);
            html += '<div class="preview-item item-vencido"><label class="preview-check"><input type="checkbox" class="check-missao" data-chave="' + chave + '" checked onchange="toggleSelecionada(this.dataset.chave)"></label><div class="preview-conteudo"><div class="preview-titulo">' + (m.event||'Sem descrição') + '</div><div class="preview-detalhes"><span>📋 ' + (m.id||'N/I') + '</span> <span>👤 ' + (m.responsible||'N/I') + '</span> <span>⏰ ' + (m.deadline||'N/I') + '</span></div></div></div>';
        });
        html += '</div>';
    }
    if (proximas.length) {
        html += '<div class="preview-secao preview-proximas"><h3>📅 Próximos ' + filtroDias + ' Dias (' + proximas.length + ')</h3>';
        proximas.forEach(m => {
            const chave = chaveMissao(m); missoesVisiveis.push(m); selecionadas.add(chave);
            const cor = m.diasRestantes === 0 ? '#ef4444' : m.diasRestantes <= 2 ? '#f97316' : '#eab308';
            html += '<div class="preview-item item-proximo"><label class="preview-check"><input type="checkbox" class="check-missao" data-chave="' + chave + '" checked onchange="toggleSelecionada(this.dataset.chave)"></label><div class="preview-conteudo"><div class="preview-badge" style="background:' + cor + ';">' + m.prazoLabel + '</div><div class="preview-titulo">' + (m.event||'Sem descrição') + '</div><div class="preview-detalhes"><span>📋 ' + (m.id||'N/I') + '</span> <span>👤 ' + (m.responsible||'N/I') + '</span> <span>📁 ' + (m.class||'N/I') + '</span></div></div></div>';
        });
        html += '</div>';
    }
    if (!vencidas.length && !proximas.length) html = '<div class="preview-secao preview-ok"><h3>✅ Tudo em dia!</h3><p>Nenhuma missão urgente ou vencida nos próximos ' + filtroDias + ' dias.</p></div>';
    c.innerHTML = html;
}

function renderizarMensagemBruta() { document.getElementById('mensagemBruta').textContent = formatarMensagemWhatsApp(); }

function atualizarTudoWA() {
    filtroDias = parseInt(document.getElementById('filtroDias').value) || 7;
    filtroResponsavelWA = document.getElementById('filtroResponsavel').value;
    filtroTextoWA = (document.getElementById('filtroTextoWA').value || '').trim();
    renderizarPreviewDiario();
    renderizarMensagemBruta();
}

function rebuildWhatsAppFilters() {
    try {
        var sel = document.getElementById('filtroResponsavel');
        if (!sel) return;
        var current = sel.value;
        sel.innerHTML = '<option value="">Todos</option>';
        var resps = new Set();
        missions.forEach(function(m) { if (m.responsible) resps.add(m.responsible); });
        Array.from(resps).sort().forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            sel.appendChild(opt);
        });
        if (current && resps.has(current)) sel.value = current;
    } catch(e) { syncLog('rebuildWA filters error: ' + e.message, true); }
}

function refreshWhatsApp() {
    try {
        rebuildWhatsAppFilters();
        renderizarPreviewDiario();
        renderizarMensagemBruta();
        renderizarContatos();
    } catch(e) { syncLog('refreshWA error: ' + e.message, true); }
}

function initWhatsApp() {
    carregarContatos();
    const sel = document.getElementById('filtroResponsavel');
    if (sel) {
        const resps = new Set();
        missions.forEach(m => { if (m.responsible) resps.add(m.responsible); });
        Array.from(resps).sort().forEach(r => { const opt = document.createElement('option'); opt.value = r; opt.textContent = r; sel.appendChild(opt); });
    }
    renderizarContatos();
    renderizarPreviewDiario();
    renderizarMensagemBruta();
    const btnEnviar = document.getElementById('btnEnviar');
    if (btnEnviar) btnEnviar.addEventListener('click', enviarWhatsApp);
    const btnCopiar = document.getElementById('btnCopiar');
    if (btnCopiar) btnCopiar.addEventListener('click', copiarMensagem);
    const fDias = document.getElementById('filtroDias');
    if (fDias) fDias.addEventListener('change', atualizarTudoWA);
    const fResp = document.getElementById('filtroResponsavel');
    if (fResp) fResp.addEventListener('change', atualizarTudoWA);
    const fTexto = document.getElementById('filtroTextoWA');
    if (fTexto) fTexto.addEventListener('input', atualizarTudoWA);
    const btnGC = document.getElementById('btnGerenciarContatos');
    if (btnGC) btnGC.addEventListener('click', abrirModalContatos);
    const btnSC = document.getElementById('btnSalvarContato');
    if (btnSC) btnSC.addEventListener('click', salvarContatoForm);
    const mc = document.getElementById('modalContatos');
    if (mc) mc.addEventListener('click', function(e) { if (e.target === this) window.fecharModalContatos(); });
}

function getDaysLeft(d) {
    if (!d) return null;
    const deadline = new Date(d + 'T23:59:59');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
}

function formatDate(d) {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length !== 3) return d;
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]}. ${parts[0].slice(2)}`;
}

function statusBadge(status) {
    const map = {
        'RESOLVIDO': 'badge-resolved',
        'ACOMPANHAR': 'badge-follow',
        'PRAZO DE RESPOSTA': 'badge-deadline',
        'EVENTO': 'badge-event',
        'Missão Cmt Bda': 'badge-missao',
        'CALENDÁRIO DE OBRIGAÇÕES': 'badge-calendario'
    };
    return `<span class="badge ${map[status] || ''}">${status}</span>`;
}

function docStatusBadge(status) {
    const map = {
        'AGENDAR': 'badge-deadline',
        'RESOLVIDO': 'badge-resolved',
        'PENDENTE': 'badge-follow'
    };
    return `<span class="badge ${map[status] || ''}">${status || 'PENDENTE'}</span>`;
}

// ============ MISSÕES ============

function getFiltered() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const diex = document.getElementById('searchDiex').value.toLowerCase();
    const statusF = document.getElementById('filterStatus').value;
    const classF = document.getElementById('filterClass').value;
    const respF = document.getElementById('filterResponsible').value;
    const dateStart = document.getElementById('filterDateStart').value;
    const dateEnd = document.getElementById('filterDateEnd').value;
    return missions.filter(m => {
        if (search && !(m.event + m.notes).toLowerCase().includes(search)) return false;
        if (diex && !(m.id + m.omds + m.escSup).toLowerCase().includes(diex)) return false;
        if (statusF && m.status !== statusF) return false;
        if (classF && m.class !== classF) return false;
        if (respF && m.responsible !== respF) return false;
        if (dateStart && m.deadline < dateStart) return false;
        if (dateEnd && m.deadline > dateEnd) return false;
        if (quickFilter === 'overdue') {
            const d = getDaysLeft(m.deadline);
            if (!(d !== null && d < 0 && m.status !== 'RESOLVIDO')) return false;
        }
        if (quickFilter === 'deadline') {
            if (m.status !== 'PRAZO DE RESPOSTA') return false;
        }
        return true;
    });
}

function updateStats() {
    document.getElementById('totalMissions').textContent = missions.length;
    document.getElementById('resolvedCount').textContent = missions.filter(m => m.status === 'RESOLVIDO').length;
    document.getElementById('followCount').textContent = missions.filter(m => m.status === 'ACOMPANHAR').length;
    document.getElementById('deadlineCount').textContent = missions.filter(m => m.status === 'PRAZO DE RESPOSTA').length;
    document.getElementById('overdueCount').textContent = missions.filter(m => {
        const d = getDaysLeft(m.deadline);
        return d !== null && d < 0 && m.status !== 'RESOLVIDO';
    }).length;
}

function render() {
    renderProximasMissoes();
    updateStats();
    let data = getFiltered();

    document.getElementById('btnAtrasados').classList.toggle('active', quickFilter === 'overdue');
    document.getElementById('btnPrazoResposta').classList.toggle('active', quickFilter === 'deadline');
    data.sort((a, b) => {
        let va, vb;
        switch (sortCol) {
            case 'daysLeft': va = getDaysLeft(a.deadline) ?? 9999; vb = getDaysLeft(b.deadline) ?? 9999; break;
            case 'deadline': va = a.deadline || 'zzz'; vb = b.deadline || 'zzz'; break;
            default: va = (a[sortCol] || '').toLowerCase(); vb = (b[sortCol] || '').toLowerCase();
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });
    const semResolvido = data.filter(m => m.status !== 'RESOLVIDO');
    const resolvido = data.filter(m => m.status === 'RESOLVIDO');
    data = semResolvido.concat(resolvido);

    document.querySelectorAll('#tab-missions th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.col === sortCol) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    });

    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const pageData = data.slice(start, start + perPage);

    const tbody = document.getElementById('missionsBody');
    tbody.innerHTML = pageData.map(m => {
        const dl = getDaysLeft(m.deadline);
        let daysClass = '';
        let daysText = '-';
        let rowClass = '';
        if (dl !== null) {
            daysText = dl.toString();
            daysClass = dl < 0 ? 'days-negative' : dl === 0 ? 'days-zero' : 'days-positive';
        }
        if (dl !== null && dl < 0 && m.status !== 'RESOLVIDO') {
            rowClass = 'row-overdue';
        } else if (m.status === 'PRAZO DE RESPOSTA') {
            rowClass = 'row-deadline';
        }
        const globalIdx = missions.indexOf(m);
        return `<tr class="${rowClass}">
            <td class="id-cell">${m.id || '-'}</td>
            <td>${m.event}</td>
            <td class="deadline-cell">${formatDate(m.deadline)}</td>
            <td><span class="${daysClass}">${daysText}</span></td>
            <td>${m.responsible || '-'}</td>
            <td>${statusBadge(m.status)}</td>
            <td>${m.class || '-'}</td>
            <td class="notes-cell">${(m.notes || '').substring(0, 100)}${(m.notes || '').length > 100 ? '...' : ''}</td>
            <td class="id-cell">${m.omds || '-'}</td>
            <td class="id-cell">${m.escSup || '-'}</td>
            <td>
                <button class="btn-action btn-view" onclick="viewMission(${globalIdx})">Visualizar</button>
                <button class="btn-action btn-edit" onclick="editMission(${globalIdx})">Editar</button>
                <button class="btn-action btn-delete" onclick="deleteMission(${globalIdx})">Excluir</button>
            </td>
        </tr>`;
    }).join('');

    const pagDiv = document.getElementById('pagination');
    let pagHtml = '';
    for (let p = 1; p <= totalPages; p++) {
        if (totalPages > 10 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
            if (pagHtml.slice(-3) !== '...') pagHtml += '<button disabled>...</button>';
            continue;
        }
        pagHtml += `<button class="${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    }
    pagDiv.innerHTML = pagHtml;
}

function goToPage(p) { currentPage = p; render(); }

function openNewModal() {
    document.getElementById('modalTitle').textContent = 'Nova Missão';
    document.getElementById('editId').value = '';
    document.getElementById('fieldId').value = '';
    document.getElementById('fieldEvent').value = '';
    document.getElementById('fieldDeadline').value = '';
    document.getElementById('fieldResponsible').value = '';
    document.getElementById('fieldStatus').value = 'ACOMPANHAR';
    document.getElementById('fieldClass').value = '-';
    document.getElementById('fieldNotes').value = '';
    document.getElementById('fieldOmds').value = '';
    document.getElementById('fieldEscSup').value = '';
    document.getElementById('fieldLastUpdate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalOverlay').classList.add('active');
}

function viewMission(idx) {
    const m = missions[idx];
    if (!m) return;

    const daysLeft = getDaysLeft(m.deadline);
    let daysClass = 'days-positive';
    if (daysLeft < 0) daysClass = 'days-negative';
    else if (daysLeft === 0) daysClass = 'days-zero';

    const badge = statusBadge(m.status);

    const content = `
        <div class="view-mission-grid">
            <div class="view-field">
                <label>Nº DIEx</label>
                <div class="view-value">${m.id}</div>
            </div>
            <div class="view-field">
                <label>Evento ou Missão</label>
                <div class="view-value">${m.event}</div>
            </div>
            <div class="view-field">
                <label>Prazo</label>
                <div class="view-value">${formatDate(m.deadline)}</div>
            </div>
            <div class="view-field">
                <label>Dias para o Evento</label>
                <div class="view-value ${daysClass}">${daysLeft}</div>
            </div>
            <div class="view-field">
                <label>Militar Responsável</label>
                <div class="view-value">${m.responsible || '-'}</div>
            </div>
            <div class="view-field">
                <label>Situação</label>
                <div class="view-value">${badge}</div>
            </div>
            <div class="view-field">
                <label>Classe</label>
                <div class="view-value">${m.class || '-'}</div>
            </div>
            <div class="view-field">
                <label>Data Última Atualização</label>
                <div class="view-value">${m.lastUpdate || '-'}</div>
            </div>
            <div class="view-field full-width">
                <label>Anotações</label>
                <div class="view-value notes">${m.notes || '-'}</div>
            </div>
            <div class="view-field">
                <label>Nº DIEx Enc. OMDS</label>
                <div class="view-value">${m.omds || '-'}</div>
            </div>
            <div class="view-field">
                <label>Nº DIEx Esc Superior</label>
                <div class="view-value">${m.escSup || '-'}</div>
            </div>
        </div>
    `;

    document.getElementById('viewMissionContent').innerHTML = content;
    document.getElementById('viewOverlay').classList.add('active');
}

function closeViewModal() {
    document.getElementById('viewOverlay').classList.remove('active');
}

function printViewMission() {
    const content = document.getElementById('viewMissionContent').innerHTML;
    const title = document.querySelector('#viewOverlay .modal-header h3').textContent;
    const win = window.open('', '_blank');
    win.document.write(`
        <html><head><title>${title}</title>
        <link rel="stylesheet" href="style.css?v=2">
        <style>
            @page { size: A4; margin: 10mm 15mm; }
            * { box-sizing: border-box; }
            body { font-family: 'IBM Plex Mono', 'Courier New', monospace; font-size: 9px; line-height: 1.3; color: #222; }
            h2 { font-size: 13px; color: #556b2f; margin: 0 0 12px 0; text-align: center; }
            .view-mission-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .view-field { break-inside: avoid; }
            .view-field.full-width { grid-column: 1 / -1; }
            .view-field label { font-size: 7px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; display: block; margin-bottom: 1px; }
            .view-value { font-size: 8px; padding: 3px 6px; background: #f9f9f5; border: 1px solid #ddd; border-radius: 3px; line-height: 1.2; }
            .view-value.notes { white-space: pre-wrap; min-height: 24px; font-size: 8px; }
            .badge { display: inline-block; padding: 1px 5px; border-radius: 8px; font-size: 7px; font-weight: 700; }
            .badge-resolved { background: #e8f0d8; color: #3d5a1f; }
            .badge-follow { background: #dbeafe; color: #1e40af; }
            .badge-deadline { background: #fef3c7; color: #92400e; }
            .badge-event { background: #f3e8ff; color: #6b21a8; }
            .badge-missao { background: #fff7ed; color: #9a3412; }
            .badge-calendario { background: #ecfdf5; color: #065f46; }
            .days-negative { color: #c0392b; font-weight: 700; }
            .days-positive { color: #556b2f; font-weight: 700; }
            .days-zero { color: #d4a017; font-weight: 700; }
            .no-print { display: none; }
            .print-footer { text-align: center; color: #aaa; font-size: 7px; margin-top: 10px; border-top: 1px solid #eee; padding-top: 4px; }
            @media print { body { padding: 0; } .no-print { display: none; } }
        </style></head><body>
        <h2>${title}</h2>
        ${content}
        <div class="print-footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
        <script>window.print();window.close();<\/script>
        </body></html>
    `);
    win.document.close();
}

function editMission(idx) {
    const m = missions[idx];
    if (!m) return;
    document.getElementById('modalTitle').textContent = 'Editar Missão';
    document.getElementById('editId').value = idx;
    document.getElementById('fieldId').value = m.id;
    document.getElementById('fieldEvent').value = m.event;
    document.getElementById('fieldDeadline').value = m.deadline;
    document.getElementById('fieldResponsible').value = m.responsible;
    document.getElementById('fieldStatus').value = m.status;
    document.getElementById('fieldClass').value = m.class;
    document.getElementById('fieldNotes').value = m.notes;
    document.getElementById('fieldOmds').value = m.omds;
    document.getElementById('fieldEscSup').value = m.escSup;
    document.getElementById('fieldLastUpdate').value = m.lastUpdate;
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function saveMission() {
    const eventVal = document.getElementById('fieldEvent').value.trim();
    if (!eventVal) { alert('Preencha o campo Evento ou Missão.'); return; }
    const editId = document.getElementById('editId').value;
    const data = {
        id: document.getElementById('fieldId').value.trim(),
        event: eventVal,
        deadline: document.getElementById('fieldDeadline').value,
        responsible: document.getElementById('fieldResponsible').value,
        status: document.getElementById('fieldStatus').value,
        class: document.getElementById('fieldClass').value,
        notes: document.getElementById('fieldNotes').value.trim(),
        omds: document.getElementById('fieldOmds').value.trim(),
        escSup: document.getElementById('fieldEscSup').value.trim(),
        lastUpdate: document.getElementById('fieldLastUpdate').value
    };
    if (editId !== '') {
        missions[parseInt(editId)] = data;
    } else {
        missions.push(data);
    }
    save();
    closeModal();
    render();
}

function deleteMission(idx) {
    const m = missions[idx];
    if (!m) return;
    deleteTargetIdx = idx;
    document.getElementById('deleteMissionName').textContent = m.event;
    document.getElementById('deleteOverlay').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('deleteOverlay').classList.remove('active');
    deleteTargetIdx = null;
}

function confirmDelete() {
    if (deleteTargetIdx === null) return;
    missions.splice(deleteTargetIdx, 1);
    save();
    closeDeleteModal();
    render();
}

function save() {
    localStorage.setItem('bdaMissions', JSON.stringify(missions));
    var now = new Date().toISOString();
    localStorage.setItem('bdaMissions_savedAt', JSON.stringify(now));
    var payload = { missions: missions, docs: docs, contatos: contatos, savedAt: now };
    syncSave(payload);
}

function exportCSV() {
    const data = getFiltered();
    const header = ['Nº DIEx', 'Evento ou Missão', 'Prazo', 'Dias para o Evento', 'Militar Responsável', 'Situação', 'Classe', 'Data Última Atualização', 'Anotações', 'Nº DIEx Enc. OMDS', 'Nº DIEx Esc Superior'];
    const rows = data.map(m => {
        const dl = getDaysLeft(m.deadline);
        return [m.id, m.event, m.deadline, dl ?? '', m.responsible, m.status, m.class, m.lastUpdate, m.notes, m.omds, m.escSup].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');
    });
    const csv = '\uFEFF' + header.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `missoes_bda_inf_amv_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// ============ DOCUMENTOS ============

function getDocsFiltered() {
    const search = document.getElementById('searchDocInput').value.toLowerCase();
    const diex = document.getElementById('searchDocDiex').value.toLowerCase();
    const statusF = document.getElementById('filterDocStatus').value;
    return docs.filter(d => {
        if (search && !d.subject.toLowerCase().includes(search)) return false;
        if (diex && !d.diex.toLowerCase().includes(diex)) return false;
        if (statusF && d.docStatus !== statusF) return false;
        return true;
    });
}

function updateDocStats() {
    document.getElementById('totalDocs').textContent = docs.length;
    document.getElementById('resolvedDocs').textContent = docs.filter(d => d.docStatus === 'RESOLVIDO').length;
    document.getElementById('pendingDocs').textContent = docs.filter(d => !d.docStatus || d.docStatus === 'PENDENTE').length;
    document.getElementById('scheduledDocs').textContent = docs.filter(d => d.docStatus === 'AGENDAR').length;
}

function renderDocs() {
    updateDocStats();
    let data = getDocsFiltered();
    const statusOrder = { 'AGENDAR': 0, 'PENDENTE': 1, '': 2, 'RESOLVIDO': 3 };
    data.sort((a, b) => {
        const sa = statusOrder[a.docStatus] ?? 1;
        const sb = statusOrder[b.docStatus] ?? 1;
        if (sa !== sb) return sa - sb;
        let va = (a[docSortCol] || '').toLowerCase();
        let vb = (b[docSortCol] || '').toLowerCase();
        if (va < vb) return docSortDir === 'asc' ? -1 : 1;
        if (va > vb) return docSortDir === 'asc' ? 1 : -1;
        return 0;
    });

    document.querySelectorAll('#tab-documents th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.col === docSortCol) th.classList.add(docSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    });

    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (currentDocPage > totalPages) currentDocPage = totalPages;
    const start = (currentDocPage - 1) * perPage;
    const pageData = data.slice(start, start + perPage);

    const tbody = document.getElementById('docsBody');
    tbody.innerHTML = pageData.map((d, i) => {
        const globalIdx = docs.indexOf(d);
        let rowClass = '';
        if (d.docStatus === 'AGENDAR') rowClass = 'row-deadline';
        return `<tr class="${rowClass}">
            <td class="deadline-cell">${d.date || '-'}</td>
            <td class="id-cell">${d.diex || '-'}</td>
            <td>${d.subject}</td>
            <td>${docStatusBadge(d.docStatus)}</td>
            <td class="notes-cell">${(d.notes || '').substring(0, 120)}${(d.notes || '').length > 120 ? '...' : ''}</td>
            <td>
                <button class="btn-action btn-edit" onclick="editDoc(${globalIdx})">Editar</button>
                <button class="btn-action btn-view" onclick="printDoc(${globalIdx})">Imprimir</button>
                <button class="btn-action btn-delete" onclick="deleteDoc(${globalIdx})">Excluir</button>
            </td>
        </tr>`;
    }).join('');

    const pagDiv = document.getElementById('paginationDocs');
    let pagHtml = '';
    for (let p = 1; p <= totalPages; p++) {
        pagHtml += `<button class="${p === currentDocPage ? 'active' : ''}" onclick="goToDocPage(${p})">${p}</button>`;
    }
    pagDiv.innerHTML = pagHtml;
}

function goToDocPage(p) { currentDocPage = p; renderDocs(); }

function openNewDocModal() {
    document.getElementById('modalDocTitle').textContent = 'Novo Documento';
    document.getElementById('editDocId').value = '';
    document.getElementById('fieldDocDiex').value = '';
    document.getElementById('fieldDocDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fieldDocSubject').value = '';
    document.getElementById('fieldDocStatus').value = 'AGENDAR';
    document.getElementById('fieldDocNotes').value = '';
    document.getElementById('modalDocOverlay').classList.add('active');
}

function editDoc(idx) {
    const d = docs[idx];
    if (!d) return;
    document.getElementById('modalDocTitle').textContent = 'Editar Documento';
    document.getElementById('editDocId').value = idx;
    document.getElementById('fieldDocDiex').value = d.diex;
    document.getElementById('fieldDocDate').value = d.date || '';
    document.getElementById('fieldDocSubject').value = d.subject;
    document.getElementById('fieldDocStatus').value = d.docStatus || 'PENDENTE';
    document.getElementById('fieldDocNotes').value = d.notes;
    document.getElementById('modalDocOverlay').classList.add('active');
}

function closeDocModal() {
    document.getElementById('modalDocOverlay').classList.remove('active');
}

function saveDoc() {
    const subjectVal = document.getElementById('fieldDocSubject').value.trim();
    if (!subjectVal) { alert('Preencha o campo Assunto do Despacho.'); return; }
    const editId = document.getElementById('editDocId').value;
    const data = {
        date: document.getElementById('fieldDocDate').value,
        diex: document.getElementById('fieldDocDiex').value.trim(),
        subject: subjectVal,
        docStatus: document.getElementById('fieldDocStatus').value,
        notes: document.getElementById('fieldDocNotes').value.trim()
    };
    if (editId !== '') {
        docs[parseInt(editId)] = data;
    } else {
        docs.push(data);
    }
    saveDocs();
    closeDocModal();
    renderDocs();
}

function deleteDoc(idx) {
    const d = docs[idx];
    if (!d) return;
    deleteDocTargetIdx = idx;
    document.getElementById('deleteDocName').textContent = d.subject;
    document.getElementById('deleteDocOverlay').classList.add('active');
}

function printDoc(idx) {
    const d = docs[idx];
    if (!d) return;
    const win = window.open('', '_blank');
    win.document.write(`
        <html><head><title>Documento para Despacho</title>
        <style>
            @page { size: A4; margin: 10mm 15mm; }
            * { box-sizing: border-box; }
            body { font-family: 'IBM Plex Mono', 'Courier New', monospace; font-size: 9px; line-height: 1.3; color: #222; }
            h2 { font-size: 13px; color: #556b2f; margin: 0 0 16px 0; text-align: center; }
            .doc-grid { display: grid; grid-template-columns: 1fr; gap: 8px; max-width: 600px; margin: 0 auto; }
            .doc-field label { font-size: 7px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; display: block; margin-bottom: 1px; }
            .doc-value { font-size: 8px; padding: 4px 8px; background: #f9f9f5; border: 1px solid #ddd; border-radius: 3px; line-height: 1.2; white-space: pre-wrap; }
            .badge { display: inline-block; padding: 1px 5px; border-radius: 8px; font-size: 7px; font-weight: 700; }
            .badge-resolved { background: #e8f0d8; color: #3d5a1f; }
            .badge-deadline { background: #fef3c7; color: #92400e; }
            .badge-follow { background: #dbeafe; color: #1e40af; }
            .print-footer { text-align: center; color: #aaa; font-size: 7px; margin-top: 16px; border-top: 1px solid #eee; padding-top: 4px; }
        </style></head><body>
        <h2>Documento para Despacho com o Cmt Bda</h2>
        <div class="doc-grid">
            <div class="doc-field"><label>Nº DIEx</label><div class="doc-value">${d.diex || '-'}</div></div>
            <div class="doc-field"><label>Assunto do Despacho</label><div class="doc-value">${d.subject}</div></div>
            <div class="doc-field"><label>Situação</label><div class="doc-value">${docStatusBadge(d.docStatus)}</div></div>
            <div class="doc-field"><label>Anotações</label><div class="doc-value">${d.notes || '-'}</div></div>
        </div>
        <div class="print-footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
        <script>window.print();window.close();<\/script>
        </body></html>
    `);
    win.document.close();
}

function closeDeleteDocModal() {
    document.getElementById('deleteDocOverlay').classList.remove('active');
    deleteDocTargetIdx = null;
}

function confirmDeleteDoc() {
    if (deleteDocTargetIdx === null) return;
    docs.splice(deleteDocTargetIdx, 1);
    saveDocs();
    closeDeleteDocModal();
    renderDocs();
}

function saveDocs() {
    localStorage.setItem('bdaDocs', JSON.stringify(docs));
    syncSave({ missions: missions, docs: docs, contatos: contatos, savedAt: new Date().toISOString() });
}

function exportDocCSV() {
    const data = getDocsFiltered();
    const header = ['Data', 'Nº DIEx', 'Assunto do Despacho', 'Situação do Despacho', 'Anotações'];
    const rows = data.map(d => {
        return [d.date, d.diex, d.subject, d.docStatus, d.notes].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');
    });
    const csv = '\uFEFF' + header.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `documentos_despacho_bda_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function restoreDocs() {
    const pwd = prompt('Digite a senha para restaurar os documentos:');
    if (pwd !== 'a23741') return;
    if (!confirm('Restaurar todos os documentos para o padr\u00e3o?\n\nIsso vai substituir todos os documentos atuais pelos 12 iniciais.')) return;
    docs = [...INITIAL_DOCS];
    saveDocs();
    renderDocs();
}

// ============ PDF IMPORT ============

async function handlePDFImport(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let allText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            allText += strings.join(' ') + '\n===PAGE===\n';
        }

        const documents = parseDiexDocuments(allText);

        if (documents.length === 0) {
            alert('Não foi possível identificar dados no PDF.\n\nO sistema procura por documentos DIEx com campos como:\n- Nº DIEx\n- Evento ou Missão\n- Anotação');
            return;
        }

        let count = 0;
        const importTime = Date.now();
        if (type === 'missions') {
            documents.forEach((d, idx) => {
                missions.push({
                    id: d.diex || `IMPORT-${importTime}-${idx}`,
                    event: d.evento || '',
                    deadline: d.deadline || '',
                    responsible: '',
                    status: 'ACOMPANHAR',
                    class: '-',
                    lastUpdate: d.data || '',
                    notes: d.anotacao || '',
                    omds: '',
                    escSup: ''
                });
                count++;
            });
            save();
            render();
        } else {
            documents.forEach((d, idx) => {
                docs.push({
                    diex: d.diex || `IMPORT-${importTime}-${idx}`,
                    subject: d.evento || '',
                    docStatus: 'PENDENTE',
                    notes: d.anotacao || ''
                });
                count++;
            });
            saveDocs();
            renderDocs();
        }

        alert(`${count} documento(s) DIEx importado(s) com sucesso!`);
    } catch (err) {
        alert('Erro ao ler o PDF: ' + err.message);
    }
}

function parseDiexDocuments(text) {
    const pages = text.split('===PAGE===');
    const documents = [];

    pages.forEach(page => {
        const cleaned = page.replace(/\s+/g, ' ').trim();
        if (!cleaned) return;

        const diex = extractField(cleaned, [
            /Nº\s*DIEx\s*nº?\s*[:\-]?\s*(\S+)/i,
            /DIEx\s*nº?\s*[:\-]?\s*(\S+)/i,
            /Nº\s*DIEx\s*[:\-]?\s*(\S+)/i
        ]);

        const evento = extractField(cleaned, [
            /Evento\s+ou\s+Missão\s*[:]\s*(.+?)\s*(?:Anexos|Anotação|Anotações|Prazo|Data\s+Última|\d+\.\s*Encaminho|\d+\.\s*Desta\s+forma)/i,
            /Assunto\s*[:]\s*(.+?)\s*(?:Anexos|Anotação|Anotações|Prazo|Data\s+Última|\d+\.\s*Encaminho)/i
        ]);

        const anotacao = extractField(cleaned, [
            /Anotação\s*[:]\s*(.+?)\s*(?:Prazo|Data\s+Última|Responsável|Classe|Situação|DIEx|$)/i,
            /Anotações\s*[:]\s*(.+?)\s*(?:Prazo|Data\s+Última|Responsável|Classe|Situação|DIEx|$)/i,
            /(?:Encaminho|Desta\s+forma).*?(?:\d+\.\s*[A-Z])/i
        ]);

        let deadline = '';
        let data = '';

        const dateRegex = /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i;
        const dateMatch = cleaned.match(dateRegex);
        if (dateMatch) {
            const months = { janeiro:'01', fevereiro:'02', março:'03', abril:'04', maio:'05', junho:'06', julho:'07', agosto:'08', setembro:'09', outubro:'10', novembro:'11', dezembro:'12' };
            const dia = dateMatch[1];
            const mes = dateMatch[2].toLowerCase();
            const ano = dateMatch[3];
            const mesNum = months[mes];
            if (mesNum) {
                deadline = `${ano}-${mesNum}-${dia.padStart(2, '0')}`;
                data = `${dia}/${mes.slice(0,3)}/${ano}`;
            }
        }

        if (!deadline) {
            deadline = extractDeadline(cleaned);
        }

        if (diex || evento) {
            documents.push({
                diex: diex ? diex.trim() : '-',
                evento: evento ? evento.trim() : '',
                anotacao: anotacao ? anotacao.trim() : '',
                deadline: deadline,
                data: data
            });
        }
    });

    return documents;
}

function extractField(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return '';
}

function extractDeadline(text) {
    const dateMatch = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (dateMatch) {
        return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
    const months = { jan:'01', fev:'02', mar:'03', abr:'04', mai:'05', jun:'06', jul:'07', ago:'08', set:'09', out:'10', nov:'11', dez:'12' };
    const dateMatch2 = text.match(/(\d{2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\s+(\d{4})/i);
    if (dateMatch2) {
        return `${dateMatch2[3]}-${months[dateMatch2[2].toLowerCase().slice(0,3)]}-${dateMatch2[1]}`;
    }
    return '';
}

function normalizeStatus(s) {
    if (!s) return 'ACOMPANHAR';
    const upper = s.toUpperCase().trim();
    if (upper.includes('RESOLVIDO')) return 'RESOLVIDO';
    if (upper.includes('PRAZO')) return 'PRAZO DE RESPOSTA';
    if (upper.includes('ACOMPANHAR')) return 'ACOMPANHAR';
    if (upper.includes('EVENTO')) return 'EVENTO';
    if (upper.includes('AGENDAR')) return 'ACOMPANHAR';
    if (upper.includes('PENDENTE')) return 'ACOMPANHAR';
    return 'ACOMPANHAR';
}

function normalizeDocStatus(s) {
    if (!s) return 'PENDENTE';
    const upper = s.toUpperCase().trim();
    if (upper.includes('RESOLVIDO')) return 'RESOLVIDO';
    if (upper.includes('AGENDAR')) return 'AGENDAR';
    if (upper.includes('PENDENTE')) return 'PENDENTE';
    if (upper.includes('ACOMPANHAR')) return 'PENDENTE';
    return 'PENDENTE';
}

// ============ TXT IMPORT (806 missões) ============

function handleTxtImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const parsed = parseTSV(text);

        if (parsed.length === 0) {
            alert('Não foi possível identificar missões no arquivo TXT.');
            return;
        }

        let added = 0, updated = 0;
        parsed.forEach(rec => {
            const diex = rec[0] || '';
            const event = rec[1] || '';
            const deadline = parseDateFromTxt(rec[2] || '');
            const responsible = rec[4] || '';
            const status = normalizeStatus(rec[5] || '');
            const classe = rec[6] || '-';
            const lastUpdate = parseDateFromTxt(rec[7] || '');
            const notes = rec[8] || '';
            const omds = rec[9] || '';
            const escSup = rec[10] || '';

            const mission = {
                id: diex || '-',
                event: event,
                deadline: deadline,
                responsible: responsible,
                status: status,
                class: classe,
                lastUpdate: lastUpdate,
                notes: notes,
                omds: omds,
                escSup: escSup
            };

            if (!event) return;

            const idx = missions.findIndex(m => m.id === mission.id && mission.id !== '-');
            if (idx !== -1) {
                missions[idx] = mission;
                updated++;
            } else {
                missions.push(mission);
                added++;
            }
        });

        save();
        render();
        alert(`Importação concluída!\n\nAdicionadas: ${added}\nAtualizadas (duplicatas substituídas): ${updated}`);
    };
    reader.readAsText(file, 'UTF-8');
}

function parseTSV(text) {
    const records = [];
    let fields = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes) {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    current += '"';
                    i += 2;
                } else {
                    inQuotes = false;
                    i++;
                }
            } else {
                inQuotes = true;
                i++;
            }
        } else if (inQuotes) {
            if (ch === '\r') {
                current += '\n';
                i++;
                if (i < text.length && text[i] === '\n') i++;
            } else if (ch === '\n') {
                current += '\n';
                i++;
            } else {
                current += ch;
                i++;
            }
        } else {
            if (ch === '\t') {
                fields.push(current.trim());
                current = '';
                i++;
            } else if (ch === '\r') {
                fields.push(current.trim());
                current = '';
                if (i + 1 < text.length && text[i + 1] === '\n') i++;
                i++;
                if (fields.length > 1) records.push(fields);
                fields = [];
            } else if (ch === '\n') {
                fields.push(current.trim());
                current = '';
                i++;
                if (fields.length > 1) records.push(fields);
                fields = [];
            } else {
                current += ch;
                i++;
            }
        }
    }
    if (current || fields.length > 0) {
        fields.push(current.trim());
        if (fields.length > 1) records.push(fields);
    }

    // Skip header row
    return records.filter((r, idx) => {
        if (idx === 0 && r[0] && r[0].toLowerCase().includes('diex')) return false;
        return true;
    });
}

function parseDateFromTxt(dateStr) {
    if (!dateStr) return '';
    const months = {
        'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
        'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
        'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
    };
    const match = dateStr.match(/(\d{1,2})\s+(\w{3})\.?\s*(\d{2,4})?/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthKey = match[2].toLowerCase().slice(0, 3);
        const month = months[monthKey] || '01';
        let year = match[3] || '26';
        if (year.length === 2) year = '20' + year;
        return `${year}-${month}-${day}`;
    }
    return '';
}

function restoreMissions() {
    const pwd = prompt('Digite a senha para restaurar as missões:');
    if (pwd !== 'a23741') return;
    if (!confirm('Restaurar todas as missões para o padrão?\n\nIsso vai substituir todas as missões atuais pelas iniciais.')) return;
    missions = [...INITIAL_DATA];
    save();
    render();
}

// ============ DASHBOARD ============

let chartStatus = null;
let chartResponsible = null;
let chartClass = null;
let chartOverdue = null;

function renderDashboard() {
    renderStatusChart();
    renderResponsibleChart();
    renderClassChart();
    renderOverdueChart();
}

function destroyChart(chart) {
    if (chart) chart.destroy();
}

function renderStatusChart() {
    destroyChart(chartStatus);
    const statusCount = {};
    missions.forEach(m => {
        const s = m.status || 'ACOMPANHAR';
        statusCount[s] = (statusCount[s] || 0) + 1;
    });

    const labels = Object.keys(statusCount);
    const data = Object.values(statusCount);
    const colors = labels.map(s => {
        if (s === 'RESOLVIDO') return '#556b2f';
        if (s === 'ACOMPANHAR') return '#2980b9';
        if (s === 'PRAZO DE RESPOSTA') return '#d4a017';
        if (s === 'EVENTO') return '#8e44ad';
        if (s === 'Missão Cmt Bda') return '#e67e22';
        if (s === 'CALENDÁRIO DE OBRIGAÇÕES') return '#1abc9c';
        return '#95a5a6';
    });

    const ctx = document.getElementById('chartStatus').getContext('2d');
    chartStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff',
                hoverBorderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 12, family: 'Inter' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    titleFont: { size: 13, family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    callbacks: {
                        label: ctx => {
                            const total = data.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '55%'
        }
    });
}

function renderResponsibleChart() {
    destroyChart(chartResponsible);
    const respCount = {};
    missions.forEach(m => {
        const r = m.responsible || 'Não atribuído';
        respCount[r] = (respCount[r] || 0) + 1;
    });

    const sorted = Object.entries(respCount).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);
    const colors = ['#556b2f', '#2980b9', '#d4a017', '#8e44ad', '#e67e22', '#1abc9c', '#c0392b', '#95a5a6'];

    const ctx = document.getElementById('chartResponsible').getContext('2d');
    chartResponsible = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Missões',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    titleFont: { size: 13, family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    callbacks: {
                        label: ctx => ` ${ctx.raw} missões`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 11, family: 'Inter' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 12, family: 'Inter', weight: '500' } }
                }
            }
        }
    });
}

function renderClassChart() {
    destroyChart(chartClass);
    const classCount = {};
    missions.forEach(m => {
        const c = m.class || '-';
        classCount[c] = (classCount[c] || 0) + 1;
    });

    const sorted = Object.entries(classCount).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);
    const colors = ['#556b2f', '#2980b9', '#d4a017', '#8e44ad', '#e67e22', '#1abc9c', '#c0392b', '#34495e', '#16a085', '#f39c12', '#9b59b6', '#e74c3c', '#27ae60', '#2c3e50', '#7f8c8d', '#d35400', '#c0392b'];

    const ctx = document.getElementById('chartClass').getContext('2d');
    chartClass = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Missões',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderRadius: 4,
                borderSkipped: false,
                barThickness: 28
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    titleFont: { size: 13, family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    callbacks: {
                        label: ctx => ` ${ctx.raw} missões`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10, family: 'Inter' },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 11, family: 'Inter' } }
                }
            }
        }
    });
}

function renderOverdueChart() {
    destroyChart(chartOverdue);
    let onTime = 0, overdue = 0;
    missions.forEach(m => {
        const d = getDaysLeft(m.deadline);
        if (d !== null && d < 0 && m.status !== 'RESOLVIDO') overdue++;
        else onTime++;
    });

    const ctx = document.getElementById('chartOverdue').getContext('2d');
    chartOverdue = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['No Prazo / Resolvido', 'Atrasado'],
            datasets: [{
                data: [onTime, overdue],
                backgroundColor: ['#d4a017', '#1a365d'],
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 12, family: 'Inter' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    titleFont: { size: 13, family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    callbacks: {
                        label: ctx => {
                            const total = onTime + overdue;
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

function renderProximasMissoes() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const hojeStr = hoje.toISOString().split('T')[0];
    const fim = new Date(hoje); fim.setDate(fim.getDate() + 14);
    const fimStr = fim.toISOString().split('T')[0];

    const alertDiv = document.getElementById('alertProximas');
    if (!alertDiv) return;

    const upcoming = missions.filter(function(m) {
        if (!m.deadline) return false;
        if (m.status === 'RESOLVIDO') return false;
        return m.deadline >= hojeStr && m.deadline <= fimStr;
    });
    upcoming.sort(function(a, b) { return a.deadline.localeCompare(b.deadline); });

    if (upcoming.length === 0) {
        alertDiv.style.display = 'none';
        return;
    }
    alertDiv.style.display = 'flex';
    document.getElementById('alertProximasCount').textContent = upcoming.length;

    const listDiv = document.getElementById('proximasList');
    const daysOpt = { day:'2-digit', month:'short' };
    const diffDays = function(iso) {
        const d = new Date(iso + 'T12:00:00'); d.setHours(0,0,0,0);
        return Math.ceil((d - hoje) / 86400000);
    };
    const badge = function(s) {
        const u = (s||'').toUpperCase();
        if (u === 'PRAZO DE RESPOSTA') return 'badge-prazo';
        if (u === 'ACOMPANHAR') return 'badge-acompanhar';
        if (u === 'EVENTO') return 'badge-evento';
        return 'badge-acompanhar';
    };
    const urgency = function(iso) {
        const d = diffDays(iso);
        if (d <= 1) return 'urgency-1';
        if (d <= 3) return 'urgency-2';
        return 'urgency-3';
    };
    const fmt = function(iso) {
        if (!iso) return '-';
        return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', daysOpt);
    };
    const label = function(iso) {
        const d = diffDays(iso);
        if (d === 0) return 'Hoje';
        if (d === 1) return 'Amanhã';
        return d + ' dias';
    };

    listDiv.innerHTML =
        '<table><thead><tr><th>Prazo</th><th>Evento</th><th>Status</th><th>Resp.</th></tr></thead><tbody>' +
        upcoming.map(function(m) {
            return '<tr class="' + urgency(m.deadline) + '">' +
                '<td>' + fmt(m.deadline) + '<br><span style="font-size:0.62rem;opacity:0.6;">' + label(m.deadline) + '</span></td>' +
                '<td>' + (m.event || '-') + '</td>' +
                '<td><span class="badge ' + badge(m.status) + '">' + (m.status || '-') + '</span></td>' +
                '<td>' + (m.responsible || '-') + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';
}

window.toggleProximasList = function() {
    const list = document.getElementById('proximasList');
    const btn = document.getElementById('btnToggleProximas');
    if (list.style.display === 'none' || !list.style.display) {
        list.style.display = 'block';
        btn.textContent = 'Fechar lista';
    } else {
        list.style.display = 'none';
        btn.textContent = 'Ver lista';
    }
};

document.addEventListener('DOMContentLoaded', init);
