const https = require('https');

const FIREBASE_URL = process.env.FIREBASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_TO = process.env.EMAIL_TO;

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function postJSON(url, body, headers) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Response: ' + data)); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

function escapeCSV(v) {
    return '"' + (v || '').toString().replace(/"/g, '""') + '"';
}

function normalizarData(str) {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T00:00:00');
    const meses = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
    const m = str.match(/(\d{1,2})\s*([a-z]{3})\.?\s*(?:de\s+)?(\d{2,4})?/i);
    if (m) {
        const dia = parseInt(m[1]);
        const mes = meses[m[2].toLowerCase()];
        let ano = m[3] ? parseInt(m[3]) : new Date().getFullYear();
        if (ano < 100) ano += 2000;
        if (mes !== undefined) return new Date(ano, mes, dia);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function getDaysLeft(deadline) {
    if (!deadline) return '';
    const dl = normalizarData(deadline);
    if (!dl || isNaN(dl.getTime())) return '';
    const now = new Date();
    return Math.ceil((dl - now) / 86400000);
}

async function main() {
    console.log('Fetching data from Firebase...');
    const data = await fetchJSON(FIREBASE_URL);

    if (!data || !data.missions) {
        console.log('No missions found in Firebase');
        process.exit(1);
    }

    const missions = data.missions;
    console.log('Missions found:', missions.length);

    const header = ['Nº DIEx', 'Evento ou Missão', 'Prazo', 'Dias para o Evento', 'Militar Responsável', 'Situação', 'Classe', 'Data Última Atualização', 'Anotações', 'Nº DIEx Enc. OMDS', 'Nº DIEx Esc Superior'];
    const rows = missions.map(m => {
        const dl = getDaysLeft(m.deadline);
        return [m.id, m.event, m.deadline, dl, m.responsible, m.status, m.class, m.lastUpdate, m.notes, m.omds, m.escSup].map(escapeCSV).join(';');
    });

    const csv = '\uFEFF' + header.join(';') + '\n' + rows.join('\n');
    const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');

    const now = new Date();
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const monthYear = monthNames[now.getMonth()] + ' ' + now.getFullYear();
    const dateStr = now.toISOString().split('T')[0];
    const filename = 'missoes_bda_inf_amv_' + dateStr + '.csv';

    console.log('Sending email via Resend...');
    const result = await postJSON('https://api.resend.com/emails', {
        from: 'onboarding@resend.dev',
        to: [EMAIL_TO],
        subject: 'Exportação CSV - Controle de Missões - ' + monthYear,
        text: 'Segue em anexo a exportação CSV das missões do Controle de Missões E4/Bda Inf Amv.\n\nTotal de missões: ' + missions.length + '\nData de geração: ' + dateStr,
        attachments: [{
            filename: filename,
            content: csvBase64
        }]
    }, {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
    });

    if (result.id) {
        console.log('Email sent successfully! ID:', result.id);
    } else {
        console.error('Failed to send email:', JSON.stringify(result));
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
