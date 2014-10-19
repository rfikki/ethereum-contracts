
/**
 * The Notary class provides a JavaScript API
 * for using Notary contracts in the browser.
 *
 * @param options
 * @param options.NOTARY
 * @param options.NOTARYDB
 */

var Notary = function(options) {
  options = options || {};
  this.NOTARY = options.NOTARY || window.NOTARY;
  this.NOTARYDB = options.NOTARYDB || window.NOTARYDB;
};

/**
 * Notarises a hash.
 *
 * This records an association between the hash,
 * the sender's account and a current timestamp.
 *
 * Example
 *
 *   notary.record('0xabcd', cb);
 *
 * @param {String} hash
 * @param {Function} callback(err)
 * @param {Error} err
 */

Notary.prototype.record = function(hash, callback) {
  var self = this;

  // Strip prefix, if present
  if (/^0x/.test(hash))
    hash = hash.substr(2);

  // Take lowest 20 bytes, if necessary
  if (hash.length > 40)
    hash = hash.substr(hash.length - 40);

  var ID = '0x' + hash;
  var params = {
    from: eth.key,
    value: 0,
    to: self.NOTARY,
    data: ["record", ID],
    gas: 10000,
    gasPrice: 10
  };
  var done = function(output) {
    var data = Helpers.params(output);
    var code = int('0x' + hex(data[0]));
    var msg;
    switch (code) {
      case 1: msg = "Notary lacks database permissions."; break;
      case 2: msg = "Hash must be 20 bytes or less."; break;
      case 3: msg = "Hash must not be empty."; break;
    }
    var err = msg ? new Error(msg) : null;
    callback(err, data);
  };
  eth.transact(params, done);
};

/**
 * Sets a custom property on a notary record.
 *
 * Example
 *
 *   notary.set('0xabcd', 'my-key', 'my-value', cb);
 *
 * @param {String} id
 * @param {String} key
 * @param {String} value
 * @param {Function} callback(err)
 * @param {Error} err
 */

Notary.prototype.set = function(id, key, value, callback) {
  var self = this;

  // Strip prefix, if present
  if (/^0x/.test(id))
    id = id.substr(2);

  // Take lowest 20 bytes, if necessary
  if (id.length > 40)
    id = id.substr(id.length - 40);

  var ID = '0x' + id;
  var KEY = '0x' + hex(key, 12);
  var VALUE = '0x' + hex(value, 32);

  var params = {
    from: eth.key,
    value: 0,
    to: self.NOTARY,
    data: ["set", ID, KEY, VALUE],
    gas: 10000,
    gasPrice: 10
  };
  var done = function(output) {
    var data = Helpers.params(output);
    var code = int('0x' + hex(data[0]));
    var msg;
    switch (code) {
      case 1: msg = "Only record owner may set properties."; break;
      case 2: msg = "Reserved keys may not be overriden."; break;
    }
    var err = msg ? new Error(msg) : null;
    callback(err, data);
  };
  eth.transact(params, done);
};

/**
 * Gets messages sent to the notary contract.
 *
 *   messages = notary.messages();
 *
 * @returns {Array<Object>} messages
 */

Notary.prototype.messages = function() {
  var filter = {
    to: this.NOTARY
  };
  var messages = eth.messages(filter);
  return messages;
};

/**
 * Gets records notarised by the notary contract.
 *
 *   records = notary.records();
 *
 * @returns {Object} records
 */

Notary.prototype.records = function() {
  var records = {};
  var messages = this.messages().reverse();
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var command = param(m.input, 0);

    if (/^record/.test(command)) {
      var id = hex(param(m.input, 1), 20);
      var ID = '0x' + id + lpad('', 2*12);
      var owner = eth.stateAt(this.NOTARYDB, ID);
      if (owner != this.NOTARY)
        continue;

      var ACCOUNT = '0x' + id + lpad(hex("account"), 2*12);
      var TIMESTAMP = '0x' + id + lpad(hex("timestamp"), 2*12);
      var account = eth.stateAt(this.NOTARYDB, ACCOUNT);
      var username = str(namereg(account));
      var timestamp = int(eth.stateAt(this.NOTARYDB, TIMESTAMP));
      var record = {
        id: id,
        ID: ID,
        owner: owner,
        account: account,
        username: username,
        timestamp: timestamp,
        created_at: new Date(timestamp * 1000),
        properties: {}
      };
      records[id] = record;
    }
    else if (/^set/.test(command)) {
      var inputs = Helpers.params(m.input);
      var id = hex(inputs[1], 20);
      var key = inputs[2];
      var value = inputs[3];
      var record = records[id];
      if (!record)
        continue;

      records[id].properties[key] = value;
    }
  }
  return records;
};
