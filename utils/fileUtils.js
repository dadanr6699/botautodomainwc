const fs = require('fs');
const path = require('path');
const { PATHS } = require('../config/constants');

function readJsonFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        writeJsonFile(filePath, defaultValue);
        return defaultValue;
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
        return defaultValue;
    }
}

function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err);
        return false;
    }
}

module.exports = {
    readConfig: () => readJsonFile(PATHS.USER_CONFIG, {}),
    writeConfig: (data) => writeJsonFile(PATHS.USER_CONFIG, data),
    readCustomSubdomains: () => readJsonFile(PATHS.CUSTOM_SUBDOMAINS, {}),
    writeCustomSubdomains: (data) => writeJsonFile(PATHS.CUSTOM_SUBDOMAINS, data),
};
