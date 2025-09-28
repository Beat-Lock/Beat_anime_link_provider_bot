import { Telegraf, Markup } from 'telegraf';
import { Router } from 'itty-router';

const router = Router();
const BOT_TOKEN = '7877393813:AAGKvpRBlYWwO70B9pQpD29BhYCXwiZGngw';
const ADMIN_ID = 829342319;
const LINK_EXPIRY_MINUTES = 5;

const bot = new Telegraf(BOT_TOKEN);

// User states for conversation flow
const userStates = new Map();

// KV storage functions
async function getKV(key, namespace) {
  return await namespace.get(key);
}

async function setKV(key, value, namespace) {
  return await namespace.put(key, value);
}

// User management
async function addUser(user, namespace) {
  const users = JSON.parse(await getKV('users', namespace) || '[]');
  const userExists = users.find(u => u.id === user.id);
  
  if (!userExists) {
    users.push({
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      joined_date: new Date().toISOString()
    });
    await setKV('users', JSON.stringify(users), namespace);
  }
}

async function getAllUsers(namespace) {
  return JSON.parse(await getKV('users', namespace) || '[]');
}

// Channel management
async function addForceSubChannel(channelUsername, channelTitle, namespace) {
  const channels = JSON.parse(await getKV('force_sub_channels', namespace) || '[]');
  const channelExists = channels.find(c => c.username === channelUsername);
  
  if (!channelExists) {
    channels.push({
      username: channelUsername,
      title: channelTitle,
      added_date: new Date().toISOString(),
      is_active: true
    });
    await setKV('force_sub_channels', JSON.stringify(channels), namespace);
    return true;
  }
  return false;
}

async function getAllForceSubChannels(namespace) {
  const channels = JSON.parse(await getKV('force_sub_channels', namespace) || '[]');
  return channels.filter(c => c.is_active);
}

async function getForceSubChannel(channelUsername, namespace) {
  const channels = JSON.parse(await getKV('force_sub_channels', namespace) || '[]');
  return channels.find(c => c.username === channelUsername && c.is_active);
}

async function deleteForceSubChannel(channelUsername, namespace) {
  const channels = JSON.parse(await getKV('force_sub_channels', namespace) || '[]');
  const channelIndex = channels.findIndex(c => c.username === channelUsername);
  
  if (channelIndex !== -1) {
    channels[channelIndex].is_active = false;
    await setKV('force_sub_channels', JSON.stringify(channels), namespace);
    return true;
  }
  return false;
}

// Link management
function generateLinkId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function generateLink(channelUsername, userId, namespace) {
  const linkId = generateLinkId();
  const links = JSON.parse(await getKV('generated_links', namespace) || '{}');
  
  links[linkId] = {
    channel_username: channelUsername,
    user_id: userId,
    created_time: new Date().toISOString(),
    is_used: false
  };
  
  await setKV('generated_links', JSON.stringify(links), namespace);
  return linkId;
}

async function getLinkInfo(linkId, namespace) {
  const links = JSON.parse(await getKV('generated_links', namespace) || '{}');
  return links[linkId];
}

async function markLinkUsed(linkId, namespace) {
  const links = JSON.parse(await getKV('generated_links', namespace) || '{}');
  if (links[linkId]) {
    links[linkId].is_used = true;
    await setKV('generated_links', JSON.stringify(links), namespace);
  }
}

// Check force subscription
async function checkForceSubscription(userId, bot, namespace) {
  const channels = await getAllForceSubChannels(namespace);
  const notJoinedChannels = [];
  
  for (const channel of channels) {
    try {
      const member = await bot.telegram.getChatMember(channel.username, userId);
      if (member.status === 'left' || member.status === 'kicked') {
        notJoinedChannels.push(channel);
      }
    } catch (error) {
      console.error(`Error checking ${channel.username}:`, error);
    }
  }
  
  return notJoinedChannels;
}

function isAdmin(userId) {
  return userId === ADMIN_ID;
}

// Start command
bot.start(async (ctx) => {
  const user = ctx.from;
  await addUser(user, ctx.BOT_DATA);
  
  if (ctx.startPayload) {
    await handleChannelLinkDeep(ctx, ctx.startPayload);
    return;
  }
  
  if (!isAdmin(user.id)) {
    const notJoinedChannels = await checkForceSubscription(user.id, bot, ctx.BOT_DATA);
    
    if (notJoinedChannels.length > 0) {
      const keyboard = notJoinedChannels.map(channel => [
        Markup.button.url(`📢 JOIN ${channel.title}`, `https://t.me/${channel.username.substring(1)}`)
      ]);
      
      keyboard.push([Markup.button.callback('✅ VERIFY SUBSCRIPTION', 'verify_subscription')]);
      
      const channelsText = notJoinedChannels.map(channel => `• ${channel.title} (${channel.username})`).join('\n');
      
      await ctx.reply(
        `📢 **Please join our channels to use this bot!**\n\n` +
        `**Required Channels:**\n${channelsText}\n\n` +
        `Join all channels above and then click Verify Subscription.`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(keyboard)
        }
      );
      return;
    }
  }
  
  if (isAdmin(user.id)) {
    await ctx.reply(
      '👑 **ADMIN PANEL** 👑\n\nWelcome back, Admin! Choose an option below:',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📊 BOT STATS', 'admin_stats')],
          [Markup.button.callback('📺 MANAGE FORCE SUB CHANNELS', 'manage_force_sub')],
          [Markup.button.callback('🔗 GENERATE CHANNEL LINKS', 'generate_links')],
          [Markup.button.callback('📢 BROADCAST MESSAGE', 'admin_broadcast')],
          [Markup.button.callback('👥 USER MANAGEMENT', 'user_management')]
        ])
      }
    );
  } else {
    await ctx.reply(
      '🌟 **WELCOME TO THE ADVANCED LINKS SHARING BOT** 🌟\n\n' +
      'Use this bot to request content access safely.\n' +
      'Explore the options below to get started!',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📋 REQUEST CONTENT', 'request_content')],
          [Markup.button.callback('👤 CONTACT ADMIN', 'contact_admin')],
          [Markup.button.callback('ℹ️ ABOUT BOT', 'about_bot')]
        ])
      }
    );
  }
});

// Handle deep links
async function handleChannelLinkDeep(ctx, linkId) {
  const linkInfo = await getLinkInfo(linkId, ctx.BOT_DATA);
  
  if (!linkInfo || linkInfo.is_used) {
    await ctx.reply('❌ This link has expired or is invalid.');
    return;
  }
  
  const linkAge = new Date() - new Date(linkInfo.created_time);
  if (linkAge > LINK_EXPIRY_MINUTES * 60 * 1000) {
    await ctx.reply('❌ This link has expired.');
    return;
  }
  
  const notJoinedChannels = await checkForceSubscription(ctx.from.id, bot, ctx.BOT_DATA);
  if (notJoinedChannels.length > 0) {
    const keyboard = notJoinedChannels.map(channel => [
      Markup.button.url(`📢 JOIN ${channel.title}`, `https://t.me/${channel.username.substring(1)}`)
    ]);
    
    keyboard.push([Markup.button.callback('✅ VERIFY SUBSCRIPTION', `verify_deep_${linkId}`)]);
    
    const channelsText = notJoinedChannels.map(channel => `• ${channel.title}`).join('\n');
    
    await ctx.reply(
      `📢 **Please join our channels to get access!**\n\n` +
      `**Required Channels:**\n${channelsText}\n\n` +
      `Join all channels above and then click Verify Subscription.`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(keyboard)
      }
    );
    return;
  }
  
  try {
    const chat = await bot.telegram.getChat(linkInfo.channel_username);
    const inviteLink = await bot.telegram.createChatInviteLink(chat.id, {
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + 300
    });
    
    await markLinkUsed(linkId, ctx.BOT_DATA);
    
    await ctx.reply(
      `🎉 **Access Granted!** 🎉\n\n` +
      `**Channel:** ${chat.title}\n` +
      `**Invite Link:** ${inviteLink.invite_link}\n` +
      `⏰ **Expires in:** 5 minutes\n` +
      `👥 **Usage:** Single use\n\n` +
      `Enjoy the content! 🍿`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await ctx.reply('❌ Error generating access link.');
  }
}

// Broadcast command
bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('❌ Admin only command.');
    return;
  }
  
  const message = ctx.message.text.split(' ').slice(1).join(' ');
  if (!message) {
    await ctx.reply('Usage: /broadcast <message>');
    return;
  }
  
  const users = await getAllUsers(ctx.BOT_DATA);
  let successCount = 0;
  
  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.id, message);
      successCount++;
    } catch (error) {}
  }
  
  await ctx.reply(`📊 Broadcast sent to ${successCount}/${users.length} users.`);
});

// Add channel command
bot.command('addchannel', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('❌ Admin only command.');
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    await ctx.reply('Usage: /addchannel @channelusername Channel Title');
    return;
  }
  
  const channelUsername = args[0];
  const channelTitle = args.slice(1).join(' ');
  
  if (await addForceSubChannel(channelUsername, channelTitle, ctx.BOT_DATA)) {
    await ctx.reply(`✅ Channel ${channelTitle} (${channelUsername}) added successfully!`);
  } else {
    await ctx.reply('❌ Error adding channel. It might already exist.');
  }
});

// Button handlers
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const user = ctx.from;
  
  await ctx.answerCbQuery();
  
  if (data === 'verify_subscription') {
    const notJoinedChannels = await checkForceSubscription(user.id, bot, ctx.BOT_DATA);
    
    if (notJoinedChannels.length > 0) {
      const channelsText = notJoinedChannels.map(channel => `• ${channel.title}`).join('\n');
      await ctx.editMessageText(
        `❌ **You haven't joined all required channels!**\n\n` +
        `**Still missing:**\n${channelsText}\n\n` +
        `Please join all channels and try again.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    if (isAdmin(user.id)) {
      await ctx.editMessageText(
        '👑 **ADMIN PANEL** 👑\n\nWelcome back, Admin!',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📊 BOT STATS', 'admin_stats')],
            [Markup.button.callback('📺 MANAGE FORCE SUB CHANNELS', 'manage_force_sub')],
            [Markup.button.callback('🔗 GENERATE CHANNEL LINKS', 'generate_links')],
            [Markup.button.callback('📢 BROADCAST MESSAGE', 'admin_broadcast')],
            [Markup.button.callback('👥 USER MANAGEMENT', 'user_management')]
          ])
        }
      );
    } else {
      await ctx.editMessageText(
        '✅ **Subscription verified!**\n\nWelcome to the bot!',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📋 REQUEST CONTENT', 'request_content')],
            [Markup.button.callback('👤 CONTACT ADMIN', 'contact_admin')],
            [Markup.button.callback('ℹ️ ABOUT BOT', 'about_bot')]
          ])
        }
      );
    }
  }
  
  else if (data === 'admin_stats') {
    if (!isAdmin(user.id)) {
      await ctx.editMessageText('❌ Admin only.');
      return;
    }
    
    const users = await getAllUsers(ctx.BOT_DATA);
    const channels = await getAllForceSubChannels(ctx.BOT_DATA);
    
    await ctx.editMessageText(
      `📊 **BOT STATISTICS** 📊\n\n` +
      `👥 **Total Users:** ${users.length}\n` +
      `📺 **Force Sub Channels:** ${channels.length}\n` +
      `🔗 **Link Expiry:** ${LINK_EXPIRY_MINUTES} minutes\n\n` +
      `**Last Update:** ${new Date().toLocaleString()}`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔄 REFRESH', 'admin_stats')],
          [Markup.button.callback('🔙 BACK', 'admin_back')]
        ])
      }
    );
  }
  
  else if (data === 'manage_force_sub') {
    await showForceSubManagement(ctx);
  }
  
  else if (data === 'generate_links') {
    await showGenerateLinks(ctx);
  }
  
  else if (data.startsWith('genlink_')) {
    const channelUsername = data.substring(8);
    await generateChannelLink(ctx, channelUsername);
  }
  
  else if (data === 'add_channel_start') {
    userStates.set(user.id, 'awaiting_channel_username');
    await ctx.editMessageText(
      '📺 **ADD FORCE SUBSCRIPTION CHANNEL**\n\n' +
      'Please send me the channel username (starting with @):\n\n' +
      'Example: `@Beat_Anime_Ocean`',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 CANCEL', 'manage_force_sub')]
        ])
      }
    );
  }
  
  else if (data.startsWith('channel_')) {
    const channelUsername = data.substring(8);
    await showChannelDetails(ctx, channelUsername);
  }
  
  else if (data.startsWith('delete_')) {
    const channelUsername = data.substring(7);
    await showDeleteConfirmation(ctx, channelUsername);
  }
  
  else if (data.startsWith('confirm_delete_')) {
    const channelUsername = data.substring(15);
    await deleteChannel(ctx, channelUsername);
  }
  
  else if (data === 'request_content') {
    await ctx.editMessageText(
      '📋 **REQUEST CONTENT**\n\n' +
      'To request specific content or channel access:\n\n' +
      '📧 **Contact Admin:** @Beect\n' +
      '💬 **Send your request** directly to the admin\n\n' +
      'We\'ll respond as soon as possible!',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 BACK', 'user_back')]
        ])
      }
    );
  }
  
  else if (data === 'contact_admin') {
    await ctx.editMessageText(
      '👤 **CONTACT ADMIN**\n\n' +
      'For any questions or support:\n\n' +
      '📧 **Admin:** @Beect\n' +
      '💬 **Direct Message:** https://t.me/Beect\n\n' +
      'We\'re here to help!',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 BACK', 'user_back')]
        ])
      }
    );
  }
  
  else if (data === 'about_bot') {
    await ctx.editMessageText(
      'ℹ️ **ABOUT THIS BOT**\n\n' +
      '🌟 **Advanced Links Sharing Bot** 🌟\n\n' +
      '**Features:**\n' +
      '• Secure content access\n' +
      '• Force subscription system\n' +
      '• Admin management\n' +
      '• User-friendly interface\n\n' +
      'Built with ❤️ for content sharing communities!',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 BACK', 'user_back')]
        ])
      }
    );
  }
  
  else if (data === 'admin_back' || data === 'user_back') {
    if (isAdmin(user.id)) {
      await ctx.editMessageText(
        '👑 **ADMIN PANEL** 👑\n\nChoose an option:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📊 BOT STATS', 'admin_stats')],
            [Markup.button.callback('📺 MANAGE FORCE SUB CHANNELS', 'manage_force_sub')],
            [Markup.button.callback('🔗 GENERATE CHANNEL LINKS', 'generate_links')],
            [Markup.button.callback('📢 BROADCAST MESSAGE', 'admin_broadcast')],
            [Markup.button.callback('👥 USER MANAGEMENT', 'user_management')]
          ])
        }
      );
    } else {
      await ctx.editMessageText(
        '🌟 **MAIN MENU** 🌟\n\nChoose an option:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📋 REQUEST CONTENT', 'request_content')],
            [Markup.button.callback('👤 CONTACT ADMIN', 'contact_admin')],
            [Markup.button.callback('ℹ️ ABOUT BOT', 'about_bot')]
          ])
        }
      );
    }
  }
});

// Show force sub management
async function showForceSubManagement(ctx) {
  if (!isAdmin(ctx.from.id)) {
    await ctx.editMessageText('❌ Admin only.');
    return;
  }
  
  const channels = await getAllForceSubChannels(ctx.BOT_DATA);
  const keyboard = channels.map(channel => [
    Markup.button.callback(`📺 ${channel.title}`, `channel_${channel.username}`)
  ]);
  
  keyboard.push([Markup.button.callback('➕ ADD CHANNEL', 'add_channel_start')]);
  keyboard.push([Markup.button.callback('🔙 BACK', 'admin_back')]);
  
  const channelCount = channels.length;
  
  await ctx.editMessageText(
    `📺 **MANAGE FORCE SUBSCRIPTION CHANNELS**\n\n` +
    `**Total Channels:** ${channelCount}\n\n` +
    (channelCount === 0 
      ? 'No force sub channels added yet. Click "ADD CHANNEL" to get started!'
      : 'Select a channel to view details or manage:'),
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard)
    }
  );
}

// Show channel details
async function showChannelDetails(ctx, channelUsername) {
  if (!isAdmin(ctx.from.id)) {
    await ctx.editMessageText('❌ Admin only.');
    return;
  }
  
  const channel = await getForceSubChannel(channelUsername, ctx.BOT_DATA);
  
  if (!channel) {
    await ctx.editMessageText('❌ Channel not found.');
    return;
  }
  
  // Generate quick link for this channel
  const linkId = await generateLink(channelUsername, ctx.from.id, ctx.BOT_DATA);
  const deepLink = `https://t.me/${ctx.botInfo.username}?start=${linkId}`;
  
  await ctx.editMessageText(
    `📺 **CHANNEL DETAILS**\n\n` +
    `**Title:** ${channel.title}\n` +
    `**Username:** ${channel.username}\n` +
    `**Quick Link:** \n\`${deepLink}\`\n\n` +
    `**Link expires in:** ${LINK_EXPIRY_MINUTES} minutes`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔗 GENERATE LINK', `genlink_${channelUsername}`)],
        [Markup.button.callback('🗑️ DELETE CHANNEL', `delete_${channelUsername}`)],
        [Markup.button.callback('📺 BACK TO CHANNELS', 'manage_force_sub')],
        [Markup.button.callback('🔙 BACK TO MENU', 'admin_back')]
      ])
    }
  );
}

// Show delete confirmation
async function showDeleteConfirmation(ctx, channelUsername) {
  const channel = await getForceSubChannel(channelUsername, ctx.BOT_DATA);
  
  if (channel) {
    await ctx.editMessageText(
      `🗑️ **CONFIRM DELETION**\n\n` +
      `Are you sure you want to delete this channel?\n\n` +
      `**Channel:** ${channel.title}\n` +
      `**Username:** ${channel.username}\n\n` +
      `This action cannot be undone!`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✅ YES, DELETE', `confirm_delete_${channelUsername}`)],
          [Markup.button.callback('❌ NO, CANCEL', `channel_${channelUsername}`)]
        ])
      }
    );
  }
}

// Delete channel
async function deleteChannel(ctx, channelUsername) {
  if (await deleteForceSubChannel(channelUsername, ctx.BOT_DATA)) {
    await ctx.editMessageText(
      `✅ **CHANNEL DELETED**\n\n` +
      `Channel \`${channelUsername}\` has been deleted successfully.`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📺 BACK TO CHANNELS', 'manage_force_sub')]
        ])
      }
    );
  }
}

// Show generate links
async function showGenerateLinks(ctx) {
  if (!isAdmin(ctx.from.id)) {
    await ctx.editMessageText('❌ Admin only.');
    return;
  }
  
  const channels = await getAllForceSubChannels(ctx.BOT_DATA);
  
  if (channels.length === 0) {
    await ctx.editMessageText(
      '❌ No force sub channels found!\n\nPlease add channels first.',
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📺 ADD CHANNEL', 'add_channel_start')],
          [Markup.button.callback('🔙 BACK', 'admin_back')]
        ])
      }
    );
    return;
  }
  
  const keyboard = channels.map(channel => [
    Markup.button.callback(`🔗 ${channel.title}`, `genlink_${channel.username}`)
  ]);
  
  keyboard.push([Markup.button.callback('🔙 BACK', 'admin_back')]);
  
  await ctx.editMessageText(
    '🔗 **GENERATE CHANNEL LINKS**\n\n' +
    'Select a channel to generate expirable links:',
    {
      reply_markup: Markup.inlineKeyboard(keyboard)
    }
  );
}

// Generate channel link
async function generateChannelLink(ctx, channelUsername) {
  if (!isAdmin(ctx.from.id)) {
    await ctx.editMessageText('❌ Admin only.');
    return;
  }
  
  const linkId = await generateLink(channelUsername, ctx.from.id, ctx.BOT_DATA);
  const deepLink = `https://t.me/${ctx.botInfo.username}?start=${linkId}`;
  
  await ctx.editMessageText(
    `🔗 **LINK GENERATED** 🔗\n\n` +
    `**Channel:** ${channelUsername}\n` +
    `**Expires in:** ${LINK_EXPIRY_MINUTES} minutes\n\n` +
    `**Direct Link:**\n\`${deepLink}\`\n\n` +
    `Share this link with users!`,
    {
      parse_mode: 'Markdown'
    }
  );
}

// Handle text messages for adding channels
bot.on('text', async (ctx) => {
  const user = ctx.from;
  const state = userStates.get(user.id);
  
  if (state === 'awaiting_channel_username') {
    const text = ctx.message.text;
    
    if (!text.startsWith('@')) {
      await ctx.reply(
        '❌ Please provide a valid channel username starting with @\n\n' +
        'Example: `@Beat_Anime_Ocean`\n\n' +
        'Try again:',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    userStates.set(user.id, 'awaiting_channel_title');
    ctx.session = { channelUsername: text };
    
    await ctx.reply(
      '📝 **STEP 2: Channel Title**\n\n' +
      'Now please send me the display title for this channel:\n\n' +
      'Example: `Anime Ocean Channel`',
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 CANCEL', 'manage_force_sub')]
        ])
      }
    );
  }
  
  else if (state === 'awaiting_channel_title') {
    const channelUsername = ctx.session.channelUsername;
    const channelTitle = ctx.message.text;
    
    if (await addForceSubChannel(channelUsername, channelTitle, ctx.BOT_DATA)) {
      userStates.delete(user.id);
      delete ctx.session;
      
      await ctx.reply(
        `✅ **FORCE SUB CHANNEL ADDED SUCCESSFULLY!**\n\n` +
        `**Username:** ${channelUsername}\n` +
        `**Title:** ${channelTitle}\n\n` +
        `Channel has been added to force subscription list!`,
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📺 MANAGE CHANNELS', 'manage_force_sub')]
          ])
        }
      );
    } else {
      await ctx.reply('❌ Error adding channel. It might already exist.');
    }
  }
});

// Webhook handler
router.post('/webhook', async (request, env) => {
  try {
    const body = await request.text();
    const update = JSON.parse(body);
    
    const context = {
      BOT_DATA: env.BOT_DATA,
      ...bot.context
    };
    
    await bot.handleUpdate(update, context);
    
    return new Response('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});

router.get('/', () => new Response('🤖 Bot is running!'));

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};