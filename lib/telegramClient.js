const axios = require('axios');

function createNodeBotClient(bot) {
  return {
    async sendMessage(chatId, text, options = {}) {
      return bot.sendMessage(chatId, text, options);
    },
    async sendPhoto(chatId, photo, options = {}) {
      return bot.sendPhoto(chatId, photo, options);
    },
    async answerCallbackQuery(callbackQueryId, options = {}) {
      return bot.answerCallbackQuery(callbackQueryId, options);
    },
  };
}

function createHttpBotClient(token) {
  const baseUrl = `https://api.telegram.org/bot${token}`;
  return {
    async sendMessage(chatId, text, options = {}) {
      const payload = { chat_id: chatId, text, ...options };
      return axios.post(`${baseUrl}/sendMessage`, payload);
    },
    async sendPhoto(chatId, photo, options = {}) {
      const payload = { chat_id: chatId, photo, ...options };
      return axios.post(`${baseUrl}/sendPhoto`, payload);
    },
    async answerCallbackQuery(callbackQueryId, options = {}) {
      const payload = { callback_query_id: callbackQueryId, ...options };
      return axios.post(`${baseUrl}/answerCallbackQuery`, payload);
    },
  };
}

module.exports = { createNodeBotClient, createHttpBotClient };