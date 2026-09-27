const path = require('path');

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || '8797429352:AAGXQRvT7HvtouRy6B3wykeY8qeHMLXlNDU',
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'data.db'),
  DEV_USERNAME: '@nexusweb_dev',
  DEV_CHANNEL: 'https://t.me/nexusweb_dev',
  GROUP_COMMUNITY: 'https://t.me/tunellingnexus'
};

