let uuid;
try {
    uuid = require('@langchain/core/node_modules/uuid/dist/index.js');
} catch (_e) {
    uuid = require('uuid/dist/index.js');
}

module.exports = uuid;
module.exports.default = uuid;
