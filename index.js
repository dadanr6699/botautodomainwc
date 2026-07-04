require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const CloudflareManager = require('./services/CloudflareManager');
const { readConfig, writeConfig, readCustomSubdomains, writeCustomSubdomains } = require('./utils/fileUtils');

const bot = new Telegraf(process.env.BOT_TOKEN);


const sessions = new Map();

// Helper to escape HTML tags in strings to prevent Telegram parse errors
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper to chunk arrays for grid keyboards
function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

// Helper to check registration
function isRegistered(userId) {
    const config = readConfig();
    return !!config[userId];
}

// Render Dashboard
function getDashboardText(ctx) {
    const userId = String(ctx.from.id);
    const config = readConfig();
    const userConfig = config[userId];
    
    let text = '☁️ <b>CLOUDFLARE WILDCARD</b> ☁️\n';
    text += '────────────────\n';
    text += `👤 <b>Pengguna:</b> @${ctx.from.username || ctx.from.first_name}\n`;
    
    if (userConfig) {
        text += `🔌 <b>Cloudflare:</b> Connected ✅\n`;
        text += `📧 <b>Email:</b> <code>${userConfig.email}</code>\n`;
        text += `🏢 <b>Account:</b> <code>${userConfig.accountName}</code>\n`;
    } else {
        text += `🔌 <b>Cloudflare:</b> Disconnected ❌\n`;
        text += `⚠️ <b>Status:</b> Belum Terdaftar\n\n`;
        text += `Silakan hubungkan akun Cloudflare Anda terlebih dahulu untuk memulai.`;
    }
    text += '\n────────────────\n';
    text += `👨‍💻 <b>Dev:</b> @Dadan_R01`;
    return text;
}

// Get Keyboard Markup
function getKeyboard(userId) {
    if (!isRegistered(userId)) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔑 Hubungkan Cloudflare', 'menu_addcf')],
            [Markup.button.callback('📊 Cek Status Konfigurasi', 'menu_cfconfig')]
        ]);
    }
    
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('☁️ Setup DNS & Wildcard', 'menu_setup_wildcard'),
            Markup.button.callback('🎯 Setup Wildcard Saja', 'menu_setup_wildcard_only')
        ],
        [
            Markup.button.callback('🔑 Update API Key', 'menu_addcf'),
            Markup.button.callback('⚙️ Lihat Config', 'menu_cfconfig')
        ],
        [
            Markup.button.callback('🗑️ Hapus Config', 'menu_deletecf')
        ]
    ]);
}

// Start Session Helper
async function startSession(ctx, stateKey, promptMessage, keyboard = null) {
    const userId = String(ctx.from.id);
    const extra = { parse_mode: 'HTML' };
    if (keyboard) {
        extra.reply_markup = keyboard.reply_markup;
    }
    
    let sentMsg;
    if (ctx.callbackQuery) {
        ctx.answerCbQuery().catch(() => {});
        try {
            sentMsg = await ctx.editMessageText(promptMessage, extra);
        } catch (e) {
            sentMsg = await ctx.reply(promptMessage, extra);
        }
    } else {
        sentMsg = await ctx.reply(promptMessage, extra);
    }
    
    sessions.set(userId, { state: stateKey, botMessageId: sentMsg.message_id });
    return sentMsg;
}

// Main Command Start
bot.start(async (ctx) => {
    return ctx.reply(getDashboardText(ctx), {
        parse_mode: 'HTML',
        ...getKeyboard(String(ctx.from.id))
    });
});

// Dashboard Callback to return to menu
bot.action('menu_dashboard', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    sessions.delete(userId);
    return ctx.editMessageText(getDashboardText(ctx), {
        parse_mode: 'HTML',
        ...getKeyboard(userId)
    });
});

// Callback Query Listeners
bot.action('menu_addcf', (ctx) => {
    let msg = '🔑 <b>HUBUNGKAN AKUN CLOUDFLARE</b>\n\n';
    msg += 'Masukkan <b>Global API Key</b> dan <b>Email Cloudflare</b> Anda dengan format:\n';
    msg += '<code>&lt;global_api_key&gt; &lt;email&gt;</code>\n\n';
    msg += 'Contoh:\n';
    msg += '<code>cf8762ab4c19... contoh@email.com</code>\n\n';
    msg += 'ℹ️ <b>Cara mendapatkan Global API Key Anda:</b>\n';
    msg += '1. Login ke dashboard <a href="https://dash.cloudflare.com">dash.cloudflare.com</a>\n';
    msg += '2. Klik ikon Profil di pojok kanan atas -> pilih <b>My Profile</b>.\n';
    msg += '3. Buka tab <b>API Tokens</b>.\n';
    msg += '4. Pada bagian <b>Global API Key</b>, klik <b>View</b>, masukkan sandi Anda, lalu salin kuncinya.';
    
    const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
    return startSession(ctx, 'AWAITING_CF_CONFIG', msg, backKeyboard);
});

bot.action('menu_cfconfig', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    const config = readConfig();
    const userConfig = config[userId];
    
    const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
    
    if (!userConfig) {
        return ctx.editMessageText('⚠️ Anda belum terdaftar di sistem. Silakan hubungkan Cloudflare Anda.', {
            parse_mode: 'HTML',
            ...backKeyboard
        });
    }
    
    const maskedKey = userConfig.global_api_key.substring(0, 8) + '***' + userConfig.global_api_key.slice(-4);
    let text = '⚙️ <b>KONFIGURASI CLOUDFLARE AKTIF</b>\n\n';
    text += `📧 <b>Email:</b> <code>${userConfig.email}</code>\n`;
    text += `🔑 <b>API Key:</b> <code>${maskedKey}</code>\n`;
    text += `🏢 <b>Account Name:</b> <code>${userConfig.accountName}</code>\n`;
    text += `🆔 <b>Account ID:</b> <code>${userConfig.accountId}</code>\n`;
    return ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...backKeyboard
    });
});



bot.action('menu_setup_wildcard', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    
    try {
        const cf = new CloudflareManager(userId);
        const zones = await cf.getZones();
        
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        
        if (zones.length === 0) {
            return ctx.editMessageText('⚠️ Tidak ditemukan domain di akun Cloudflare Anda. Silakan hubungkan domain terlebih dahulu.', {
                parse_mode: 'HTML',
                ...backKeyboard
            });
        }
        
        // Sort zones from shortest to longest name
        zones.sort((a, b) => a.name.length - b.name.length);
        
        sessions.set(userId, { state: 'SETUP_CHOOSE_ZONE', zones: zones });
        
        const zoneButtons = zones.map((zone, idx) => Markup.button.callback(zone.name, `setupzone_${idx}`));
        const buttons = chunkArray(zoneButtons, 2);
        buttons.push([Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]);
        
        return ctx.editMessageText('☁️ <b>PILIH DOMAIN UTAMA</b>\n\nSilakan pilih domain utama yang akan digunakan untuk setup:', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (err) {
        console.error(err);
        return ctx.editMessageText(`❌ Gagal mengambil domain: ${err.message}`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]])
        });
    }
});
bot.action('menu_setup_wildcard_only', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    
    try {
        const cf = new CloudflareManager(userId);
        const zones = await cf.getZones();
        
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        
        if (zones.length === 0) {
            return ctx.editMessageText('⚠️ Tidak ditemukan domain di akun Cloudflare Anda. Silakan hubungkan domain terlebih dahulu.', {
                parse_mode: 'HTML',
                ...backKeyboard
            });
        }
        
        // Sort zones from shortest to longest name
        zones.sort((a, b) => a.name.length - b.name.length);
        
        sessions.set(userId, { state: 'SETUP_ONLY_CHOOSE_ZONE', zones: zones });
        
        const zoneButtons = zones.map((zone, idx) => Markup.button.callback(zone.name, `setuponlyzone_${idx}`));
        const buttons = chunkArray(zoneButtons, 2);
        buttons.push([Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]);
        
        return ctx.editMessageText('☁️ <b>PILIH DOMAIN UTAMA (WILDCARD SAJA)</b>\n\nSilakan pilih domain utama yang akan digunakan untuk setup wildcard saja:', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (err) {
        console.error(err);
        return ctx.editMessageText(`❌ Gagal mengambil domain: ${err.message}`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]])
        });
    }
});

bot.action(/^setuponlyzone_(.+)$/, async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    const param = ctx.match[1];
    const session = sessions.get(userId);
    
    const index = parseInt(param, 10);
    if (session && session.state === 'SETUP_ONLY_CHOOSE_ZONE' && session.zones && session.zones[index]) {
        const zone = session.zones[index];
        
        let msg = `☁️ Domain Terpilih: <b>${zone.name}</b>\n\n`;
        msg += `Silakan masukkan domain backend Anda yang sudah ada (contoh: <code>vps.domain.com</code>):`;
        
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        const sentMsg = await ctx.editMessageText(msg, { parse_mode: 'HTML', ...backKeyboard });
        sessions.set(userId, { 
            state: 'SETUP_ONLY_AWAITING_BACKEND_NAME', 
            zoneName: zone.name, 
            botMessageId: sentMsg.message_id 
        });
        return;
    } else {
        return ctx.reply('⚠️ Sesi kadaluwarsa. Silakan klik menu Setup Wildcard Saja kembali.');
    }
});



bot.action(/^setupzone_(.+)$/, async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    const param = ctx.match[1];
    const session = sessions.get(userId);
    
    const index = parseInt(param, 10);
    if (session && session.state === 'SETUP_CHOOSE_ZONE' && session.zones && session.zones[index]) {
        const zone = session.zones[index];
        
        let msg = `☁️ Domain Terpilih: <b>${zone.name}</b>\n\n`;
        msg += `Silakan masukkan nama subdomain:`;
        
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        const sentMsg = await ctx.editMessageText(msg, { parse_mode: 'HTML', ...backKeyboard });
        sessions.set(userId, { 
            state: 'SETUP_AWAITING_BACKEND_NAME', 
            zoneName: zone.name, 
            botMessageId: sentMsg.message_id 
        });
        return;
    } else {
        return ctx.reply('⚠️ Sesi kadaluwarsa. Silakan klik menu Setup Wildcard kembali.');
    }
});

bot.action('setup_wildcard_btn', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    const session = sessions.get(userId);
    
    if (session && session.state === 'SETUP_POINTING_DONE') {
        const { zoneName, backendDomain, ipAddress, botMessageId } = session;
        
        sessions.set(userId, { 
            state: 'SETUP_AWAITING_WILDCARD_PREFIX', 
            zoneName: zoneName, 
            backendDomain: backendDomain, 
            ipAddress: ipAddress, 
            botMessageId: botMessageId 
        });
        
        const prompt = `📍 <b>Domain Backend:</b> <code>${backendDomain}</code> ➔ <code>${ipAddress}</code>\n\n` +
                       `<b>Langkah Selanjutnya: Setup Wildcard</b>\n` +
                       `Silakan masukkan subdomain (contoh: <code>bug.subdomain.com</code>):`;
        
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        if (botMessageId) {
            return ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, prompt, { parse_mode: 'HTML', ...backKeyboard }).catch(async () => {
                return ctx.reply(prompt, { parse_mode: 'HTML', ...backKeyboard });
            });
        }
        return ctx.reply(prompt, { parse_mode: 'HTML', ...backKeyboard });
    } else {
        return ctx.reply('⚠️ Sesi kadaluwarsa atau tidak valid. Silakan ulangi setup.');
    }
});


bot.action('menu_deletecf', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ Ya, Hapus', 'confirm_deletecf'),
            Markup.button.callback('❌ Batal', 'cancel_deletecf')
        ]
    ]);
    return ctx.editMessageText('⚠️ <b>KONFIRMASI PENGHAPUSAN</b>\n\nApakah Anda yakin ingin menghapus konfigurasi Cloudflare dari sistem?', {
        parse_mode: 'HTML',
        ...keyboard
    });
});

bot.action('confirm_deletecf', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    const userId = String(ctx.from.id);
    const config = readConfig();
    delete config[userId];
    writeConfig(config);
    return ctx.editMessageText('✅ Konfigurasi Cloudflare Anda berhasil dihapus.', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]])
    });
});

bot.action('cancel_deletecf', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText('❌ Penghapusan konfigurasi dibatalkan.', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]])
    });
});

bot.action('refresh_saas_status', async (ctx) => {
    if (ctx.callbackQuery) ctx.answerCbQuery('⏳ Menyegarkan status...').catch(() => {});
    const userId = String(ctx.from.id);
    const session = sessions.get(userId);
    
    const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
    
    if (!session || session.state !== 'CUSTOM_HOSTNAME_REGISTERED') {
        return ctx.reply('⚠️ Sesi kadaluwarsa. Silakan daftarkan ulang custom hostname Anda.', {
            parse_mode: 'HTML',
            ...backKeyboard
        });
    }
    
    const { hostname, zoneName, botMessageId } = session;
    
    try {
        const cf = new CloudflareManager(userId);
        const res = await cf.getCustomHostnameStatus(hostname, zoneName);
        
        let responseText = `ℹ️ <b>Status Custom Hostname</b>\n\n`;
        responseText += `🌐 <b>Domain:</b> <code>${hostname}</code>\n`;
        responseText += `📦 <b>Fallback Origin:</b> <i>(Pastikan Fallback Origin sudah disiapkan di dasbor Cloudflare)</i>\n\n`;
        responseText += `⚙️ <b>Status Hostname:</b> <code>${res.status}</code> ${res.status === 'active' ? '✅' : '⏳'}\n`;

        if (res.ssl) {
            responseText += `🔒 <b>Status SSL:</b> <code>${res.ssl.status}</code> ${res.ssl.status === 'active' ? '✅' : '⏳'}\n`;
            if (res.ssl.status !== 'active' && res.ssl.validation_records && res.ssl.validation_records.length > 0) {
                const record = res.ssl.validation_records[0];
                if (record.txt_name) {
                    responseText += `📝 <b>Certificate Validation (SSL):</b>\n`;
                    responseText += `• <b>Type:</b> <code>TXT</code>\n`;
                    responseText += `• <b>Certificate validation request (Name):</b> <code>${record.txt_name}</code>\n`;
                    responseText += `• <b>Certificate validation response (Value):</b> <code>${record.txt_value}</code>\n\n`;
                } else if (record.http_url) {
                    responseText += `📝 <b>Certificate Validation (SSL):</b>\n`;
                    responseText += `• <b>Type:</b> <code>HTTP</code>\n`;
                    responseText += `• <b>HTTP URL:</b> <code>${record.http_url}</code>\n`;
                    responseText += `• <b>HTTP Body:</b> <code>${record.http_body}</code>\n\n`;
                }
            }
        }

        if (res.ownership_verification && res.status !== 'active') {
            responseText += `🔑 <b>Hostname Pre-Validation (Ownership):</b>\n`;
            responseText += `• <b>Type:</b> <code>${res.ownership_verification.type.toUpperCase()}</code>\n`;
            responseText += `• <b>Hostname pre-validation TXT name (Name):</b> <code>${res.ownership_verification.name}</code>\n`;
            responseText += `• <b>Hostname pre-validation TXT value (Value):</b> <code>${res.ownership_verification.value}</code>\n\n`;
        }

        responseText += `🕒 <i>Terakhir diperbarui: ${new Date().toLocaleTimeString('id-ID')} WIB</i>\n\n`;
        if (res.status === 'active' && (!res.ssl || res.ssl.status === 'active')) {
            responseText += `🎉 <b>Selamat! Custom Hostname dan SSL Anda sudah aktif sepenuhnya.</b>`;
        } else {
            responseText += `💡 <i>Silakan tunggu beberapa menit dan klik tombol <b>🔄 Refresh Status</b> di bawah untuk memperbarui status verifikasi.</i>`;
        }
        
        const saasStatusKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Status', 'refresh_saas_status')],
            [Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]
        ]);
        
        if (botMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, responseText, { parse_mode: 'HTML', ...saasStatusKeyboard }).catch(async (e) => {
                if (!e.message.includes('message is not modified')) {
                    await ctx.reply(responseText, { parse_mode: 'HTML', ...saasStatusKeyboard });
                }
            });
        } else {
            await ctx.editMessageText(responseText, { parse_mode: 'HTML', ...saasStatusKeyboard });
        }
    } catch (err) {
        console.error(err);
        const saasStatusKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Status', 'refresh_saas_status')],
            [Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]
        ]);
        const errMsg = `❌ <b>Gagal memperbarui status:</b> ${escapeHtml(err.message)}`;
        if (botMessageId) {
            await ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, errMsg, { parse_mode: 'HTML', ...saasStatusKeyboard }).catch(() => {});
        } else {
            await ctx.editMessageText(errMsg, { parse_mode: 'HTML', ...saasStatusKeyboard }).catch(() => {});
        }
    }
});

// Middleware to intercept inputs
bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    const userId = String(ctx.from?.id);
    const session = sessions.get(userId);
    
    if (session && !ctx.message?.text?.startsWith('/')) {
        return handleSessionInput(ctx, session);
    }
    return next();
});

// Handle conversational session inputs
async function handleSessionInput(ctx, session) {
    const userId = String(ctx.from.id);
    
    try {
        const botMessageId = session.botMessageId;
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        
        if (session.state === 'AWAITING_CF_CONFIG') {
            const text = ctx.message.text.trim();
            sessions.delete(userId);
            
            // Delete user input message
            ctx.deleteMessage().catch(() => {});
            
            const parts = text.split(/\s+/);
            if (parts.length < 2) {
                const errMsg = '❌ Format salah. Gunakan format: <code>&lt;global_api_key&gt; &lt;email&gt;</code>';
                if (botMessageId) {
                    return ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, errMsg, { parse_mode: 'HTML', ...backKeyboard });
                }
                return ctx.reply(errMsg, { parse_mode: 'HTML', ...backKeyboard });
            }
            const apiKey = parts[0];
            const email = parts[1];
            
            let status;
            const loadingText = '⏳ Memverifikasi API Key ke Cloudflare...';
            if (botMessageId) {
                status = await ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, loadingText, { parse_mode: 'HTML' });
            } else {
                status = await ctx.reply(loadingText, { parse_mode: 'HTML' });
            }
            const targetMessageId = status ? status.message_id : botMessageId;
            
            const response = await fetch('https://api.cloudflare.com/client/v4/accounts', {
                headers: {
                    'X-Auth-Email': email,
                    'X-Auth-Key': apiKey,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            
            if (!data.success || !data.result || data.result.length === 0) {
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, '❌ Kredensial tidak valid. Silakan coba lagi.', { parse_mode: 'HTML', ...backKeyboard });
            }
            
            const accountId = data.result[0].id;
            const accountName = data.result[0].name;
            
            const config = readConfig();
            config[userId] = {
                global_api_key: apiKey,
                email: email,
                accountId,
                accountName,
                createdAt: new Date().toISOString(),
            };
            writeConfig(config);
            
            return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, `✅ <b>REGISTRASI BERHASIL!</b>\n\n📧 <b>Email:</b> <code>${email}</code>\n🏢 <b>Account:</b> <code>${accountName}</code>`, { parse_mode: 'HTML', ...backKeyboard });
        }
        


        if (session.state === 'SETUP_ONLY_AWAITING_BACKEND_NAME') {
            const backendDomain = ctx.message.text.trim().toLowerCase().replace(/\.+$/, '');
            const zoneName = session.zoneName;
            
            // Delete user input message
            ctx.deleteMessage().catch(() => {});
            
            sessions.set(userId, { 
                state: 'SETUP_ONLY_AWAITING_WILDCARD_PREFIX', 
                zoneName: zoneName, 
                backendDomain: backendDomain, 
                botMessageId: botMessageId 
            });
            
            const prompt = `📍 <b>Domain Backend Existing:</b> <code>${backendDomain}</code>\n\n` +
                           `Silakan masukkan subdomain wildcard yang diinginkan (contoh: <code>bug.domain.com</code> atau <code>*.bug.domain.com</code>):`;
            
            const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
            if (botMessageId) {
                return ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, prompt, { parse_mode: 'HTML', ...backKeyboard });
            }
            return ctx.reply(prompt, { parse_mode: 'HTML', ...backKeyboard });
        }
        if (session.state === 'SETUP_ONLY_AWAITING_WILDCARD_PREFIX') {
            const prefix = ctx.message.text.trim().toLowerCase().replace(/\.+$/, '');
            const zoneName = session.zoneName;
            const backendDomain = session.backendDomain;
            
            // Delete user input message
            ctx.deleteMessage().catch(() => {});
            sessions.delete(userId);
            
            let finalDomain = backendDomain;
            if (prefix !== '@') {
                if (prefix === '*') {
                    finalDomain = `*.${backendDomain}`;
                } else if (prefix.endsWith(zoneName)) {
                    finalDomain = prefix;
                } else {
                    finalDomain = `${prefix}.${zoneName}`;
                }
            }
            
            // Generate clean worker name based on the final domain
            const workerName = finalDomain.replace(/\*/g, 'wildcard').replace(/\./g, '-').replace(/[^a-z0-9-]/g, '').toLowerCase();
            
            let status;
            const loadingText = `⏳ Memproses setup wildcard saja...\n\n1. Mendaftarkan domain wildcard <code>${finalDomain}</code>\n2. Menyambungkan ke system proxy...`;
            if (botMessageId) {
                status = await ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, loadingText, { parse_mode: 'HTML' }).catch(async () => {
                    return ctx.reply(loadingText, { parse_mode: 'HTML' });
                });
            } else {
                status = await ctx.reply(loadingText, { parse_mode: 'HTML' });
            }
            const targetMessageId = status ? status.message_id : botMessageId;
            
            try {
                const cf = new CloudflareManager(userId);
                
                // 1. Check and delete conflicting A/CNAME records for finalDomain to avoid error 100117
                try {
                    const zoneId = await cf.getZoneId(finalDomain);
                    const dnsUrl = `${cf.baseUrl}/zones/${zoneId}/dns_records?name=${finalDomain}`;
                    const dnsRes = await fetch(dnsUrl, { headers: cf.headers });
                    const dnsData = await dnsRes.json();
                    if (dnsData.success && dnsData.result && dnsData.result.length > 0) {
                        for (const record of dnsData.result) {
                            if (record.type === 'A' || record.type === 'CNAME') {
                                const delUrl = `${cf.baseUrl}/zones/${zoneId}/dns_records/${record.id}`;
                                await fetch(delUrl, { method: 'DELETE', headers: cf.headers });
                            }
                        }
                    }
                } catch (cleanupErr) {
                    console.error('Conflicting DNS cleanup failed:', cleanupErr);
                }
                
                // 2. Automatic Worker Code (dynamically proxies to the backendDomain)
                const codeText = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "${backendDomain}";
    const modifiedRequest = new Request(url.toString(), request);
    return fetch(modifiedRequest);
  }
};`;
                
                // 3. Upload Worker Script
                await cf.uploadWorker(workerName, codeText);
                
                // 4. Bind Custom Domain to the Worker
                await cf.bindCustomDomain(workerName, finalDomain);
                
                // 5. Save to custom_subdomains database
                const subdomains = readCustomSubdomains();
                if (!subdomains[userId]) {
                    subdomains[userId] = [];
                }
                if (!subdomains[userId].includes(finalDomain)) {
                    subdomains[userId].push(finalDomain);
                    writeCustomSubdomains(subdomains);
                }
                
                let responseText = `✅ <b>SETUP WILDCARD SAJA BERHASIL!</b>\n\n`;
                responseText += `📍 <b>Domain Backend:</b> <code>${backendDomain}</code>\n`;
                responseText += `🌐 <b>Domain Wildcard:</b> <code>${finalDomain}</code>\n\n`;
                responseText += `⏳ <b>Penting:</b> Silakan tunggu sekitar 3 sampai 5 menit agar domain aktif.\n\n`;
                
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, responseText, { parse_mode: 'HTML', ...backKeyboard });
            } catch (err) {
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, `❌ <b>Gagal melakukan setup wildcard saja:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML', ...backKeyboard });
            }
        }




        if (session.state === 'SETUP_AWAITING_BACKEND_NAME') {
            const prefix = ctx.message.text.trim().toLowerCase().replace(/\.+$/, '');
            const zoneName = session.zoneName;
            
            // Delete user input message
            ctx.deleteMessage().catch(() => {});
            
            let backendDomain = zoneName;
            if (prefix !== '@') {
                if (prefix.endsWith(zoneName)) {
                    backendDomain = prefix;
                } else {
                    backendDomain = `${prefix}.${zoneName}`;
                }
            }
            
            sessions.set(userId, { 
                state: 'SETUP_AWAITING_IP', 
                zoneName: zoneName, 
                backendDomain: backendDomain, 
                botMessageId: botMessageId 
            });
            
            const prompt = `📍 Domain Backend: <code>${backendDomain}</code>\n\nSilakan masukkan IP Address VPS tujuan (contoh: <code>127.0.0.1</code>):`;
            const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
            if (botMessageId) {
                return ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, prompt, { parse_mode: 'HTML', ...backKeyboard });
            }
            return ctx.reply(prompt, { parse_mode: 'HTML', ...backKeyboard });
        }

        if (session.state === 'SETUP_AWAITING_IP') {
            const ipAddress = ctx.message.text.trim();
            const zoneName = session.zoneName;
            const backendDomain = session.backendDomain;
            
            // Delete user input message
            ctx.deleteMessage().catch(() => {});
            
            const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
            
            let loadingMsg;
            const loadingText = `⏳ Mendaftarkan DNS A Record: <code>${backendDomain}</code> ➔ <code>${ipAddress}</code>...`;
            if (botMessageId) {
                loadingMsg = await ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, loadingText, { parse_mode: 'HTML' }).catch(async () => {
                    return ctx.reply(loadingText, { parse_mode: 'HTML' });
                });
            } else {
                loadingMsg = await ctx.reply(loadingText, { parse_mode: 'HTML' });
            }
            const targetMessageId = loadingMsg ? loadingMsg.message_id : botMessageId;
            
            try {
                const cf = new CloudflareManager(userId);
                let dnsStatusText = '';
                try {
                    await cf.addARecord(backendDomain, ipAddress);
                    dnsStatusText = `✅ <b>DNS A Record berhasil didaftarkan!</b>\n`;
                } catch (dnsErr) {
                    if (dnsErr.message.includes('already exists') || dnsErr.message.includes('terdaftar')) {
                        dnsStatusText = `ℹ️ <b>DNS A Record sudah terdaftar sebelumnya.</b>\n`;
                    } else {
                        throw dnsErr;
                    }
                }
                
                sessions.set(userId, { 
                    state: 'SETUP_POINTING_DONE', 
                    zoneName: zoneName, 
                    backendDomain: backendDomain, 
                    ipAddress: ipAddress, 
                    botMessageId: targetMessageId 
                });
                
                let prompt = `${dnsStatusText}`;
                prompt += `📍 <b>Domain Backend:</b> <code>${backendDomain}</code> ➔ <code>${ipAddress}</code>\n\n`;
                prompt += `Silakan klik tombol di bawah untuk melanjutkan ke Setup Wildcard:`;
                
                const nextKeyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('☁️ Setup Wildcard Sekarang', 'setup_wildcard_btn')],
                    [Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]
                ]);
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, prompt, { parse_mode: 'HTML', ...nextKeyboard }).catch(async () => {
                    return ctx.reply(prompt, { parse_mode: 'HTML', ...nextKeyboard });
                });
            } catch (err) {
                sessions.delete(userId);
                const errMsg = `❌ <b>Gagal mendaftarkan DNS A Record:</b> ${escapeHtml(err.message)}`;
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, errMsg, { parse_mode: 'HTML', ...backKeyboard }).catch(async () => {
                    return ctx.reply(errMsg, { parse_mode: 'HTML', ...backKeyboard });
                });
            }
        }

        if (session.state === 'SETUP_AWAITING_WILDCARD_PREFIX') {
            const prefix = ctx.message.text.trim().toLowerCase().replace(/\.+$/, '');
            const zoneName = session.zoneName;
            const backendDomain = session.backendDomain;
            const ipAddress = session.ipAddress;
            
            // Delete user input message
            ctx.deleteMessage().catch(() => {});
            sessions.delete(userId);
            
            let finalDomain = backendDomain;
            if (prefix !== '@') {
                if (prefix === '*') {
                    finalDomain = `*.${backendDomain}`;
                } else if (prefix.endsWith(zoneName)) {
                    finalDomain = prefix;
                } else {
                    finalDomain = `${prefix}.${zoneName}`;
                }
            }
            
            // Generate clean worker name based on the final domain
            const workerName = finalDomain.replace(/\*/g, 'wildcard').replace(/\./g, '-').replace(/[^a-z0-9-]/g, '').toLowerCase();
            
            let status;
            const loadingText = `⏳ Memproses setup wildcard...\n\n1. Mendaftarkan domain wildcard <code>${finalDomain}</code>\n2. Menyambungkan ke sistem proxy...`;
            if (botMessageId) {
                status = await ctx.telegram.editMessageText(ctx.chat.id, botMessageId, null, loadingText, { parse_mode: 'HTML' }).catch(async () => {
                    return ctx.reply(loadingText, { parse_mode: 'HTML' });
                });
            } else {
                status = await ctx.reply(loadingText, { parse_mode: 'HTML' });
            }
            const targetMessageId = status ? status.message_id : botMessageId;
            
            try {
                const cf = new CloudflareManager(userId);
                
                // 1. Check and delete conflicting A/CNAME records for finalDomain to avoid error 100117
                try {
                    const zoneId = await cf.getZoneId(finalDomain);
                    const dnsUrl = `${cf.baseUrl}/zones/${zoneId}/dns_records?name=${finalDomain}`;
                    const dnsRes = await fetch(dnsUrl, { headers: cf.headers });
                    const dnsData = await dnsRes.json();
                    if (dnsData.success && dnsData.result && dnsData.result.length > 0) {
                        for (const record of dnsData.result) {
                            if (record.type === 'A' || record.type === 'CNAME') {
                                const delUrl = `${cf.baseUrl}/zones/${zoneId}/dns_records/${record.id}`;
                                await fetch(delUrl, { method: 'DELETE', headers: cf.headers });
                            }
                        }
                    }
                } catch (cleanupErr) {
                    console.error('Conflicting DNS cleanup failed:', cleanupErr);
                }
                
                // 2. Automatic Worker Code (dynamically proxies to the backendDomain)
                const codeText = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "${backendDomain}";
    const modifiedRequest = new Request(url.toString(), request);
    return fetch(modifiedRequest);
  }
};`;
                
                // 3. Upload Worker Script
                await cf.uploadWorker(workerName, codeText);
                
                // 4. Bind Custom Domain to the Worker
                await cf.bindCustomDomain(workerName, finalDomain);
                
                // 5. Save to custom_subdomains database
                const subdomains = readCustomSubdomains();
                if (!subdomains[userId]) {
                    subdomains[userId] = [];
                }
                if (!subdomains[userId].includes(finalDomain)) {
                    subdomains[userId].push(finalDomain);
                    writeCustomSubdomains(subdomains);
                }
                
                let responseText = `✅ <b>SETUP WILDCARD BERHASIL!</b>\n\n`;
                responseText += `📍 <b>DNS A Record:</b> <code>${backendDomain}</code> ➔ <code>${ipAddress}</code>\n`;
                responseText += `🌐 <b>Domain Wildcard:</b> <code>${finalDomain}</code>\n\n`;
                responseText += `⏳ <b>Penting:</b> Silakan tunggu sekitar 3 sampai 5 menit agar domain aktif.\n\n`;
                
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, responseText, { parse_mode: 'HTML', ...backKeyboard });
            } catch (err) {
                return ctx.telegram.editMessageText(ctx.chat.id, targetMessageId, null, `❌ <b>Gagal melakukan setup wildcard:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML', ...backKeyboard });
            }
        }
        
    } catch (error) {
        sessions.delete(userId);
        console.error(error);
        const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu', 'menu_dashboard')]]);
        if (session.botMessageId) {
            return ctx.telegram.editMessageText(ctx.chat.id, session.botMessageId, null, `❌ <b>Gagal memproses:</b> ${escapeHtml(error.message)}`, { parse_mode: 'HTML', ...backKeyboard });
        }
        return ctx.reply(`❌ <b>Gagal memproses:</b> ${escapeHtml(error.message)}`, { parse_mode: 'HTML', ...backKeyboard });
    }
}



bot.launch().then(() => {
    console.log('🤖 Premium Wildcard Domain Manager 2.0 online!');
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
