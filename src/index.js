import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } from 'discord.js';
import Fuse from 'fuse.js';
import { SENSITIVITY_DB, getAllModels, normalize, renderSensitivity, seriesBuckets } from './sensitivity.js';
import { loadUsers, saveUsers } from './storage.js';

const PREFIX = '!';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User],
});

// In-memory cache
let users = loadUsers();

const ALL_MODELS = getAllModels();
const fuse = new Fuse(ALL_MODELS, {
    includeScore: true,
    threshold: 0.4,
});

const SERIES_ALIASES = [
    { alias: 'ip', label: 'iPhone', startsWith: 'iPhone ' },
    { alias: 'ss', label: 'Samsung S', startsWith: 'Samsung S' },
    { alias: 'sa', label: 'Samsung A', startsWith: 'Samsung A' },
    { alias: 'sm', label: 'Samsung M', startsWith: 'Samsung M' },
    { alias: 'op', label: 'Oppo', startsWith: 'Oppo ' },
    { alias: 'px', label: 'Pixel', startsWith: 'Pixel ' },
    { alias: 'rd', label: 'Redmi', startsWith: 'Redmi' },
    { alias: 'rl', label: 'Realme', startsWith: 'Realme ' },
    { alias: 'tt', label: 'Tecno', startsWith: 'Tecno ' },
    { alias: 'po', label: 'Poco', startsWith: 'Poco ' },
    { alias: 'op1', label: 'OnePlus', startsWith: 'OnePlus ' },
];

function findSeries(aliasOrText) {
    const token = aliasOrText.toLowerCase().trim();
    const matched = SERIES_ALIASES.find(s => s.alias === token);
    if (matched) return matched;
    // textual series must match exactly the label (or label + " series"), not just startWith
    const plain = token.replace(/\s+/g, ' ');
    return SERIES_ALIASES.find(s => {
        const label = s.label.toLowerCase();
        return plain === label || plain === `${label} series`;
    });
}

function formatSeriesList(seriesLabel, models) {
    const first = models.slice(0, 15).join(', ');
    const more = models.length > 15 ? ` and ${models.length - 15} more...` : '';
    return `📚 ${seriesLabel} models I know: ${first}${more}\nUse: !sens <exact model> (e.g., !sens ${models[0]})`;
}

function buildWelcomeMessage(memberMention) {
    return (
        `👋 Welcome ${memberMention} to ZOOM's Free Fire community! 🎉\n\n` +
        `I'm FF SensBot — here to help you dominate with the best sensitivity settings for your device.\n\n` +
        `✅ Type !help to see all brand/series commands (like !op, !tt, !ss) and how to get your exact model's sensitivity.\n\n` +
        `Quick examples:\n` +
        `- !ss → Samsung S series list\n` +
        `- !op → Oppo series list\n` +
        `- !sens Samsung S10 → exact model sensitivity\n` +
        `- !sens sm10 → Samsung M10 via shorthand\n\n` +
        `Need help? Type !help anytime. Let’s get you locked in for headshots! 🎯`
    );
}

function parseArgs(content) {
    return content.trim().split(/\s+/).slice(1);
}

function findModel(queryRaw) {
    const query = queryRaw.trim();
    if (!query) return null;

    // handle shorthand like sm10 -> Samsung M10, ss20 -> Samsung S20, sa52 -> Samsung A52, ip11 -> iPhone 11, ttSpark7 -> Tecno Spark 7
    const qn = normalize(query);

    const patterns = [
        { re: /^sm(\d{1,3}[a-z]?)$/, build: m => `Samsung M${m[1].toUpperCase()}` },
        { re: /^ss(\d{1,3}[a-z]?)$/, build: m => `Samsung S${m[1].toUpperCase()}` },
        { re: /^sa(\d{1,3}[a-z]?)$/, build: m => `Samsung A${m[1].toUpperCase()}` },
        { re: /^ip(\d{1,2}|x|xs|xr)$/, build: m => {
            const map = { x: 'X', xs: 'XS', xr: 'XR' };
            const val = map[m[1]] || m[1];
            return `iPhone ${val}`;
        } },
        // Tecno
        { re: /^ttspark(\d{1,2})$/, build: m => `Tecno Spark ${m[1]}` },
        { re: /^ttcamon(\d{1,2})$/, build: m => `Tecno Camon ${m[1]}` },
        { re: /^ttphantom$/, build: () => `Tecno Phantom` },
        { re: /^px(\d)$/, build: m => `Pixel ${m[1]}` },
        // Poco
        { re: /^po(f|m|x)(\d)$/, build: m => `Poco ${m[1].toUpperCase()}${m[2]}` },
        // Redmi
        { re: /^rdnote(\d{1,2})$/, build: m => `Redmi Note ${m[1]}` },
        { re: /^rd(\d{1,2})$/, build: m => `Redmi ${m[1]}` },
        { re: /^op(\d{1,2})$/, build: m => `OnePlus ${m[1]}` },
        // Oppo
        { re: /^oa(\d{1,2})$/, build: m => `Oppo A${m[1]}` },
        { re: /^of(\d{1,2})$/, build: m => `Oppo F${m[1]}` },
        { re: /^oreno(\d{1,2})$/, build: m => `Oppo Reno ${m[1]}` },
        { re: /^ofindx$/, build: () => `Oppo Find X` },
        // Realme
        { re: /^rl(\d{1,2}|x|xt)$/, build: m => {
            const map = { x: 'X', xt: 'XT' };
            const v = map[m[1]] || m[1];
            return `Realme ${v}`;
        } },
        { re: /^rlgt$/, build: () => `Realme GT` },
    ];

    for (const p of patterns) {
        const m = qn.match(p.re);
        if (m) {
            const candidate = p.build(m);
            if (SENSITIVITY_DB[candidate]) return candidate;
        }
    }

    // Try direct match
    if (SENSITIVITY_DB[query]) return query;

    // Fuzzy match
    const found = fuse.search(query).sort((a,b) => a.score - b.score)[0];
    if (found && found.item) return found.item;

    return null;
}

function sendSensitivityReply(channel, model) {
    const data = SENSITIVITY_DB[model];
    if (!data) return channel.send(`❌ I couldn't find sensitivity for "${model}".`);
    const rendered = renderSensitivity(model, data);
    const embed = new EmbedBuilder()
        .setTitle(rendered.title)
        .setDescription(rendered.lines.join('\n'))
        .setColor(0x00cc88);
    return channel.send({ embeds: [embed] });
}

client.once(Events.ClientReady, c => {
    console.log(`FF SensBot is online as ${c.user.tag}`);
});

client.on(Events.GuildMemberAdd, async member => {
    try {
        const channelId = process.env.WELCOME_CHANNEL_ID;
        let targetChannel = null;
        if (channelId) targetChannel = member.guild.channels.cache.get(channelId) || await member.guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel) {
            targetChannel = member.guild.systemChannel || member.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('welcome')) || member.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('general'));
        }
        if (!targetChannel) return;
        await targetChannel.send(buildWelcomeMessage(member.toString()));
    } catch {}
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const [cmdRaw, ...rest] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (cmdRaw || '').toLowerCase();
    const args = rest;

    if (cmd === 'help') {
        const seriesCmds = [
            '`!ss` Samsung S',
            '`!sm` Samsung M',
            '`!sa` Samsung A',
            '`!ip` iPhone',
            '`!op` Oppo',
            '`!oreno` Oppo Reno',
            '`!ofindx` Oppo Find X',
            '`!px` Pixel',
            '`!rd` Redmi',
            '`!rdnote` Redmi Note',
            '`!po` Poco',
            '`!rl` Realme',
            '`!rlgt` Realme GT',
            '`!tt` Tecno',
            '`!ttspark` Tecno Spark',
            '`!ttcamon` Tecno Camon',
        ].join(' • ');

        const usage = [
            'Use a series command above to list supported models.',
            'Then request a model either by full name or shorthand:',
            '- Full name: `!sens Samsung S10`, `!sens Oppo A16`',
            '- Shorthand: `!sens ss10`, `!sens oa16`, `!sens ttcamon17`',
        ].join('\n');

        const help = new EmbedBuilder()
            .setTitle('FF SensBot Help')
            .setColor(0x00aaff)
            .setDescription(
                [
                    '**Browse by Series**',
                    seriesCmds,
                    '',
                    '**Get Sensitivity**',
                    usage,
                    '',
                    '**Account**',
                    '`!register [model]` – Save your device (e.g., `!register Samsung M10`)\n`!mysens` – Show sensitivity for your saved device',
                ].join('\n')
            );
        return void message.channel.send({ embeds: [help] });
    }

    if (cmd === 'sens') {
        const q = args.join(' ').trim();
        if (!q) {
            return void message.reply('Usage: `!sens [series|model]` e.g. `!sens ss` or `!sens Samsung M10`');
        }

        const series = findSeries(q);
        if (series) {
            const models = ALL_MODELS.filter(m => m.startsWith(series.startsWith));
            if (models.length) return void message.channel.send(formatSeriesList(series.label, models));
        }

        const model = findModel(q);
        if (!model) return void message.reply(`I couldn't find a close match for "${q}". Try a series like \'!sens ss\' or provide the exact model.`);
        return void sendSensitivityReply(message.channel, model);
    }

    // Series listing commands (direct, without !sens)
    const directSeriesMap = [
        { cmd: 'ss', label: 'Samsung S', startsWith: 'Samsung S' },
        { cmd: 'sm', label: 'Samsung M', startsWith: 'Samsung M' },
        { cmd: 'sa', label: 'Samsung A', startsWith: 'Samsung A' },
        { cmd: 'ip', label: 'iPhone', startsWith: 'iPhone ' },
        { cmd: 'op', label: 'Oppo', startsWith: 'Oppo ' },
        { cmd: 'oreno', label: 'Oppo Reno', startsWith: 'Oppo Reno ' },
        { cmd: 'ofindx', label: 'Oppo Find X', startsWith: 'Oppo Find X' },
        { cmd: 'px', label: 'Pixel', startsWith: 'Pixel ' },
        { cmd: 'rd', label: 'Redmi', startsWith: 'Redmi ' },
        { cmd: 'rdnote', label: 'Redmi Note', startsWith: 'Redmi Note ' },
        { cmd: 'po', label: 'Poco', startsWith: 'Poco ' },
        { cmd: 'rl', label: 'Realme', startsWith: 'Realme ' },
        { cmd: 'rlgt', label: 'Realme GT', startsWith: 'Realme GT' },
        { cmd: 'tt', label: 'Tecno', startsWith: 'Tecno ' },
        { cmd: 'ttspark', label: 'Tecno Spark', startsWith: 'Tecno Spark ' },
        { cmd: 'ttcamon', label: 'Tecno Camon', startsWith: 'Tecno Camon ' },
    ];

    const direct = directSeriesMap.find(s => s.cmd === cmd);
    if (direct) {
        const models = ALL_MODELS.filter(m => m.startsWith(direct.startsWith));
        if (models.length) return void message.channel.send(formatSeriesList(direct.label, models));
        return void message.reply('No models found in that series.');
    }

    if (cmd === 'register') {
        const q = args.join(' ').trim();
        if (!q) return void message.reply('Usage: `!register [model]` e.g. `!register Samsung M10`');
        const model = findModel(q) || q;
        if (!SENSITIVITY_DB[model]) return void message.reply(`I couldn't find sensitivity for "${q}". Try \'!sens ss\' to browse Samsung S series.`);
        users[message.author.id] = { model };
        saveUsers(users);
        return void message.reply(`Saved your device as: ${model}. Use \'!mysens\' anytime!`);
    }

    if (cmd === 'mysens') {
        const entry = users[message.author.id];
        if (!entry || !entry.model) return void message.reply('You have not registered a device yet. Use `!register [model]`.');
        if (!SENSITIVITY_DB[entry.model]) return void message.reply(`Your saved device "${entry.model}" is not in my database anymore.`);
        return void sendSensitivityReply(message.channel, entry.model);
    }
});

client.login(process.env.DISCORD_TOKEN);


