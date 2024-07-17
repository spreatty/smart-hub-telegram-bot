const https = require('https');
const fs = require('fs');
const express = require('express');
const { Telegraf } = require('telegraf');
const config = require('./config.json');
const host = require('./package.json').config.host;
const log = (...args) => console.log(new Date().toLocaleString(), ...args);

const sslKey = fs.readFileSync('ssl/bot-key.key');
const sslCert = fs.readFileSync('ssl/bot-cert.pem');
const bot = new Telegraf(config.botToken);
const path = '/telegraf/' + bot.secretPathComponent();
const webhookUrl = 'https://' + host + ':' + config.botPort + path;

const acMsgMap = {
    'off': 'Кондиціонер вимкнено',
    'on': 'Кондиціонер увімкнено',
    'requested': 'Запуск кондиціонера заплановано'
};
const powerMsgMap = {
    'off': 'Живлення відсутнє',
    'backup': 'Живлення резервне',
    'on': 'Живлення державне'
};

const storageFile = 'storage.json';
let storage = { subscribedChats: [] };
if (fs.existsSync(storageFile)) {
    storage = require('./' + storageFile);
}

bot.use((ctx, next) => {
    if (config.usernameWhitelist.includes(ctx.update.message?.from.username)) {
        //log(ctx.update);
        //log(ctx.update.message?.entities);
        next();
    }
});

const saveStorage = () => {
    try {
        fs.writeFileSync(storageFile, JSON.stringify(storage));
        log('Storage saved');
    } catch(e) {
        log('Failed to save storage', e);
    }
};

const broadcast = msg => {
    storage.subscribedChats.forEach(id => bot.telegram.sendMessage(id, msg));
}

bot.command('start', ctx => {
    const chat = ctx.update.message.chat.id;
    if (!storage.subscribedChats.includes(chat)) {
        storage.subscribedChats.push(chat);
        log("Subscribed chat", chat);
        saveStorage();
    }
});

bot.command('stop', ctx => {
    const chat = ctx.update.message.chat.id;
    const idx = storage.subscribedChats.indexOf(chat);
    if (idx != -1) {
        storage.subscribedChats.splice(idx, 1);
        log("Unsubscribed chat", chat);
        saveStorage();
    }
});

bot.command('acon', ctx => {
    
});

bot.command('acoff', ctx => {
    
});

(async () => {
    const localApp = express();
    localApp.post('/ac', express.json(), (req, res) => {
        log('AC update', req.body);
        const msg = acMsgMap[req.body.status];
        if (msg)
            broadcast(msg);
        res.sendStatus(201);
    });
    localApp.post('/power', express.json(), (req, res) => {
        log('Power update', req.body);
        const msg = powerMsgMap[req.body.status];
        if (msg)
            broadcast(msg);
        res.sendStatus(201);
    });
    await new Promise((resolve, reject) => {
        try {
            localApp.listen(config.localPort, resolve);
        } catch(e) {
            reject(e);
        }
    });
    log('Local server ready', config.localPort);

    const app = express();
    app.get('/health', (req, res) => {
        res.send({ status: 'ok' });
    });
    app.post(path, bot.webhookCallback(path));
    await new Promise((resolve, reject) => {
        try {
            https.createServer({ key: sslKey, cert: sslCert }, app).listen(config.botPort, resolve);
        } catch(e) {
            reject(e);
        }
    });
    log('Bot server ready', config.botPort);
    await bot.telegram.setWebhook(webhookUrl, { certificate: { source: sslCert } });
    log('Bot set webhook', webhookUrl);
})();