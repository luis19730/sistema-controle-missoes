const https = require('https');
const nodemailer = require('nodemailer');

const FIREBASE_URL = process.env.FIREBASE_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

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

function escapeCSV(v) {
    return '"' + (v || '').toString().replace(/"/g, '""') + '"';
}

function getDaysLeft(deadline) {
    if (!deadline) return '';
    const now = new Date();
    const dl = new Date(deadline + 'T23:59:59');
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

    const now = new Date();
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const monthYear = monthNames[now.getMonth()] + ' ' + now.getFullYear();
    const dateStr = now.toISOString().split('T')[0];
    const filename = 'missoes_bda_inf_amv_' + dateStr + '.csv';

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_PASS
        }
    });

    const mailOptions = {
        from: GMAIL_USER,
        to: GMAIL_USER,
        subject: 'Exportação CSV - Controle de Missões - ' + monthYear,
        text: 'Segue em anexo a exportação CSV das missões do Controle de Missões E4/Bda Inf Amv.\n\nTotal de missões: ' + missions.length + '\nData de geração: ' + dateStr,
        attachments: [{
            filename: filename,
            content: csv,
            contentType: 'text/csv;charset=utf-8;'
        }]
    };

    console.log('Sending email to ' + GMAIL_USER + '...');
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
